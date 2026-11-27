// Dashboard — organizado por pergunta: (1) o que preciso fazer hoje, (2) como estamos no período (com comparação),
// (3) onde ganhamos e perdemos, (4) financeiro e tendência, (5) análises complementares (recolhidas).
import { store } from "../core/store.js?v=20261127-151925";
import { $, fmt, fmtD, esc, raw, h, MESES_CURTOS, toTitleCase, hojeIso } from "../core/utils.js?v=20261127-151925";
import { icon, vazio, tag } from "../core/ui.js?v=20261127-151925";
import { registro, base, COR_STATUS } from "../core/charts.js?v=20261127-151925";
import { navigate } from "../core/router.js?v=20261127-151925";
import { iniciarRegua, onRegua, pendentesHoje, situacaoRegua, TIPO_ROTULO } from "../core/regua.js?v=20261127-151925";
import { verEmail } from "./reguas.js?v=20261127-151925";
import { getLicit, getOrgao, getProp, getCat, getPortal, isEspelho, isVencido, propTotal, STATUS_VENCIDO, ataFoiRenovada } from "../core/domain.js?v=20261127-151925";
import { linhasResultados, participacoes, rankingConcorrentes, CLASSE_ROTULO } from "../core/resultados.js?v=20261127-151925";
import { reequilibriosSemRetorno, diasAguardando } from "../core/risco.js?v=20261127-151925";
import { cobAtraso } from "./cobrancas.js?v=20261127-151925";
import { margemAtual } from "./propostas.js?v=20261127-151925";

const reg = registro();
let unsub = null, unsubRegua = null;
let periodoSel = null;   // "2026" | "12m" | "todos"
let metrica = "vencido";

// Paleta dos gráficos (pele grafite): principal, atenção, positivo, neutro.
const C = { grafite: "#1a1d23", grafite2: "#4a4f5a", red: "#CF0001", green: "#1b8a5a", amber: "#d9a400", orange: "#d9641c", purple: "#6d3fc9", teal: "#0f7f8c", gray: "#c9cbd1", gray2: "#e6e4df" };
const SERIE = [C.grafite, C.green, C.purple, C.teal, C.orange, C.amber, C.grafite2, C.gray];
const abrev = (v) => { const a = Math.abs(v); if (a >= 1e6) return (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi"; if (a >= 1e3) return (v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: a >= 1e5 ? 0 : 1 }) + " mil"; return String(Math.round(v)); };
const pct = (v, d = 0) => (v == null || !isFinite(v) ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: d }) + "%");

export default {
  id: "dashboard", titulo: "Dashboard", grupo: "Principal", icone: "dashboard",

  render(el) {
    el.innerHTML = `
      <div class="dash-toolbar"><label class="field field-inline"><span>Período</span><select id="dash-periodo"></select></label><span class="muted" id="dash-comp" style="font-size:12px"></span></div>

      <div class="section-title">O que preciso fazer hoje</div>
      <div class="hoje-grid" id="dash-hoje"></div>
      <div class="card" style="margin-top:12px"><div class="card-head"><h2>Contatos comerciais pendentes <span id="dash-regua-badge" class="tag tag-red" hidden></span></h2><button class="btn btn-ghost btn-sm" data-act="ir" data-para="reguas">Ver régua completa</button></div><div class="card-body" id="dash-regua"></div></div>

      <div class="section-title">Como estamos no período</div>
      <div class="grid grid-6" id="dash-kpis"></div>

      <div class="section-title">Onde ganhamos e perdemos <span class="muted" style="font-weight:400;text-transform:none;letter-spacing:0">· disputas com resultado lançado</span></div>
      <div class="grid grid-3">
        <div class="card"><div class="card-head"><h2>Itens disputados: resultado</h2><button class="btn btn-ghost btn-sm" data-act="ir" data-para="resultados">Detalhar</button></div><div class="card-body"><div class="chart-box"><canvas id="c-classes"></canvas><div class="chart-empty" hidden></div></div></div></div>
        <div class="card"><div class="card-head"><h2>Quem mais ganha de nós</h2><button class="btn btn-ghost btn-sm" data-act="ir" data-para="concorrentes">Concorrentes</button></div><div class="card-body flush" id="dash-conc"></div></div>
        <div class="card"><div class="card-head"><h2>Desempenho por portal</h2></div><div class="card-body flush" id="dash-portal"></div></div>
      </div>

      <div class="section-title">Financeiro e tendência</div>
      <div class="grid grid-2">
        <div class="card"><div class="card-head"><h2>Por mês</h2><select class="input input-sm" id="dash-metrica"><option value="vencido">Vencido (R$)</option><option value="empenhado">Empenhado (R$)</option><option value="custo">Custo das vencidas (R$)</option><option value="licitacoes">Licitações (qtd)</option><option value="propostas">Propostas (qtd)</option></select></div><div class="card-body"><div class="chart-box"><canvas id="c-mes"></canvas><div class="chart-empty" hidden></div></div></div></div>
        <div class="card"><div class="card-head"><h2>Vencido vs empenhado (acumulado)</h2></div><div class="card-body"><div class="chart-box"><canvas id="c-acum"></canvas><div class="chart-empty" hidden></div></div></div></div>
      </div>
      <div class="grid grid-3">
        <div class="card"><div class="card-head"><h2>Mix de receita por categoria</h2></div><div class="card-body"><div class="chart-box sm"><canvas id="c-mix"></canvas><div class="chart-empty" hidden></div></div></div></div>
        <div class="card"><div class="card-head"><h2>Empenhos por estado</h2></div><div class="card-body"><div class="chart-box sm"><canvas id="c-estado"></canvas><div class="chart-empty" hidden></div></div></div></div>
        <div class="card"><div class="card-head"><h2>Resultado das propostas (R$)</h2></div><div class="card-body"><div class="chart-box sm"><canvas id="c-result"></canvas><div class="chart-empty" hidden></div></div></div></div>
      </div>
      <div class="grid grid-2">
        <div class="card"><div class="card-head"><h2>Top produtos vendidos</h2><button class="btn btn-ghost btn-sm" data-act="ir" data-para="produtos">Produtos</button></div><div class="card-body flush" id="dash-topprod"></div></div>
        <div class="card"><div class="card-head"><h2>Órgãos que mais empenham</h2><button class="btn btn-ghost btn-sm" data-act="ir" data-para="empenhos">Empenhos</button></div><div class="card-body flush" id="dash-top-org"></div></div>
      </div>

      <details class="dash-mais"><summary class="section-title" style="cursor:pointer">Análises complementares <span class="muted" style="font-weight:400;text-transform:none;letter-spacing:0">· funil, sazonalidade, ciclo, recorrência, atividades</span></summary>
        <div class="grid grid-3" style="margin-top:4px">
          <div class="card"><div class="card-head"><h2>Funil de conversão</h2></div><div class="card-body" id="dash-funil"></div></div>
          <div class="card"><div class="card-head"><h2>Sazonalidade das licitações</h2></div><div class="card-body" id="dash-saz"></div></div>
          <div class="card"><div class="card-head"><h2>Tempo médio por etapa</h2></div><div class="card-body" id="dash-ciclo"></div></div>
          <div class="card"><div class="card-head"><h2>Win rate por modalidade</h2></div><div class="card-body" id="dash-winrate"></div></div>
          <div class="card"><div class="card-head"><h2>Órgãos recorrentes</h2></div><div class="card-body flush" id="dash-recorr"></div></div>
          <div class="card"><div class="card-head"><h2>Atividades recentes</h2></div><div class="card-body" id="dash-ativ"></div></div>
        </div>
      </details>`;

    $("#dash-periodo").addEventListener("change", (e) => { periodoSel = e.target.value; update(); });
    $("#dash-metrica").addEventListener("change", (e) => { metrica = e.target.value; update(); });
    iniciarRegua();
    el.addEventListener("click", (e) => { const b = e.target.closest("[data-act]"); if (!b) return;
      if (b.dataset.act === "ir") { if (b.dataset.busca) sessionStorage.setItem("rlux.busca:" + b.dataset.para, b.dataset.busca); navigate(b.dataset.para); }
      if (b.dataset.act === "regua-ver") { const [origem, refId] = b.dataset.id.split(":"); const li = pendentesHoje().find((l) => l.origem === origem && l.refId === refId); if (li) verEmail(li); } });
    store.ready().then(update);
    unsub = store.on("*", debounceUpdate);
    unsubRegua = onRegua(debounceUpdate);
  },

  destroy() { unsub?.(); unsub = null; unsubRegua?.(); unsubRegua = null; reg.destroy(); },
};

let t;
function debounceUpdate() { clearTimeout(t); t = setTimeout(update, 150); }

// ---------- período ----------
// Devolve { ini, fim, meses: ["YYYY-MM"...], rotulo, prev: {ini, fim, rotulo} | null }
function periodo(sel, hoje) {
  const ym = (d) => d.toISOString().slice(0, 7);
  const mesesEntre = (a, b) => { const out = []; const d = new Date(a + "-01T00:00:00Z"); while (ym(d) <= b) { out.push(ym(d)); d.setUTCMonth(d.getUTCMonth() + 1); } return out; };
  if (sel === "12m") {
    const fim = hojeIso(); const dIni = new Date(hoje); dIni.setMonth(dIni.getMonth() - 11, 1); const ini = dIni.toISOString().slice(0, 10);
    const pIni = new Date(dIni); pIni.setFullYear(pIni.getFullYear() - 1); const pFim = new Date(hoje); pFim.setFullYear(pFim.getFullYear() - 1);
    return { ini, fim, meses: mesesEntre(ini.slice(0, 7), fim.slice(0, 7)), rotulo: "últimos 12 meses", prev: { ini: pIni.toISOString().slice(0, 10), fim: pFim.toISOString().slice(0, 10), rotulo: "12 meses anteriores" } };
  }
  if (sel === "todos") return { ini: "0000-01-01", fim: "9999-12-31", meses: null, rotulo: "todos os anos", prev: null };
  const ano = +sel; const atual = ano === hoje.getFullYear();
  const fim = atual ? hojeIso() : `${ano}-12-31`;
  return { ini: `${ano}-01-01`, fim: `${ano}-12-31`, meses: Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`), rotulo: String(ano),
    prev: { ini: `${ano - 1}-01-01`, fim: `${ano - 1}-${fim.slice(5)}`, rotulo: atual ? `mesmo período de ${ano - 1}` : String(ano - 1) } };
}

function update() {
  if (!$("#dash-kpis")) return;
  const hoje = new Date(); const anoAtual = hoje.getFullYear();
  const props = store.get("propostas").filter((p) => !isEspelho(p));
  const lics = store.get("licitacoes"), atas = store.get("atas"), emps = store.get("empenhos"), crms = store.get("crm"), adesoes = store.get("adesoes"), portais = store.get("portais");

  // ----- seletor de período -----
  const anos = new Set([anoAtual]);
  lics.forEach((l) => l.data && anos.add(+l.data.slice(0, 4))); emps.forEach((e) => e.data && anos.add(+e.data.slice(0, 4)));
  const sel = $("#dash-periodo"); if (periodoSel === null) periodoSel = String(anoAtual);
  sel.innerHTML = [...anos].sort((a, b) => b - a).map((a) => `<option value="${a}">${a}</option>`).join("") + `<option value="12m">Últimos 12 meses</option><option value="todos">Todos os anos</option>`;
  sel.value = periodoSel;
  const per = periodo(periodoSel, hoje);
  $("#dash-comp").textContent = per.prev ? `comparado com ${per.prev.rotulo}` : "sem comparação (todos os anos)";
  const dentro = (iso, p = per) => !!iso && iso.slice(0, 10) >= p.ini && iso.slice(0, 10) <= p.fim;

  // ----- conjuntos do período (e do período anterior) -----
  const conj = (p) => {
    const licsF = lics.filter((l) => dentro(l.data, p));
    const propsF = props.filter((x) => dentro(getLicit(x.licitacaoId).data, p));
    const empsF = emps.filter((e) => dentro(e.data, p));
    const adesoesF = adesoes.filter((a) => a.status === "Aprovada" && dentro(a.solicitacao, p));
    const atasRenov = atas.filter((a) => a.ataOrigemId && a.propostaId && dentro(a.assinatura, p));
    const vencF = propsF.filter((x) => isVencido(x));
    const totalRenovado = atasRenov.reduce((s, a) => s + propTotal(getProp(a.propostaId)), 0);
    const totalV = vencF.reduce((s, x) => s + propTotal(x), 0) + totalRenovado;
    const totalE = empsF.reduce((s, e) => s + (e.valorRecebido || 0), 0);
    const totalAd = adesoesF.reduce((s, a) => s + (a.valorTotal || 0), 0);
    const custoV = vencF.reduce((s, x) => s + (x.itens || []).reduce((q, i) => q + (i.custo || 0) * (i.qtd || 0), 0), 0);
    const recV = vencF.reduce((s, x) => s + propTotal(x), 0);
    const linhas = linhasResultados().filter((r) => dentro(r.data, p));
    const ganhos = linhas.filter((r) => !r.perdido).length;
    return { licsF, propsF, empsF, adesoesF, atasRenov, vencF, totalRenovado, totalV, totalE, totalAd, margem: custoV > 0 ? (recV / custoV - 1) * 100 : null, linhas, ganhos, exito: linhas.length ? ganhos / linhas.length * 100 : null };
  };
  const A = conj(per), B = per.prev ? conj(per.prev) : null;
  const atasF = atas.filter((a) => a.propostaId && dentro(getLicit(getProp(a.propostaId)?.licitacaoId).data));

  // ----- HOJE: pendências acionáveis -----
  const pend = pendentesHoje().sort((a, b) => situacaoRegua(a).ord - situacaoRegua(b).ord || (a.proximo || "").localeCompare(b.proximo || ""));
  const cobVenc = store.get("cobrancas").filter((c) => (cobAtraso(c) || 0) > 0); const cobVal = cobVenc.reduce((s, c) => s + (c.valor || 0), 0);
  const reqs = reequilibriosSemRetorno(15);
  const atas30 = atas.filter((a) => { if (!a.vencimento || ataFoiRenovada(a)) return false; const d = (new Date(a.vencimento) - hoje) / 864e5; return d >= 0 && d <= 30; });
  const propsAlerta = props.filter((p) => { const a = margemAtual(p); return a && (a.itensAbaixo > 0 || a.abaixoLucroMin || a.pct < 0); });
  const crmPend = crms.filter((c) => ["Agendado", "Em Contato", "Em Negociação", "Em Renovação"].includes(c.status) && c.proxCont && c.proxCont <= hojeIso());
  const tile = (n, label, sub, para, cls) => `<button class="hoje-tile ${n ? cls : "ok"}" data-act="ir" data-para="${para}"><div class="hoje-n">${n}</div><div><div class="hoje-l">${esc(label)}</div><div class="hoje-s">${n ? esc(sub) : "em dia"}</div></div><span class="hoje-arrow">›</span></button>`;
  $("#dash-hoje").innerHTML =
    tile(pend.length, "Régua: contatos", "clientes a contatar", "reguas", "warn") +
    tile(cobVenc.length, "Cobranças vencidas", `${fmt(cobVal)} em atraso`, "cobrancas", "bad") +
    tile(reqs.length, "Reequilíbrio s/ retorno", reqs.length ? `mais antigo há ${diasAguardando(reqs[0])} dias` : "", "reequilibrio", "warn") +
    tile(atas30.length, "ATAs vencem em 30 dias", atas30.length ? `próxima: ${fmtD(atas30.sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0].vencimento)}` : "", "atas", "warn") +
    tile(propsAlerta.length, "Propostas em alerta", "abaixo do piso / margem baixa", "propostas", "bad") +
    tile(crmPend.length, "CRM atrasado", "próximo contato já passou", "crm", "warn");

  // ----- régua -----
  const badge = $("#dash-regua-badge"); badge.hidden = !pend.length; badge.textContent = `${pend.length} pendente${pend.length > 1 ? "s" : ""}`;
  $("#dash-regua").innerHTML = pend.length ? `<div class="list">${pend.slice(0, 6).map((li) => { const s = situacaoRegua(li);
    return h`<div class="list-item"><div class="list-main"><div class="list-title">${li.titulo}${li.origem === "adesao" ? " · Adesão" : ""} — ${toTitleCase(li.orgaoNome || li.orgao?.nome || "—")}</div><div class="list-sub">${TIPO_ROTULO[li.tipoProx]} · saldo ${fmt(li.saldo)}${li.vencIso ? " · vence " + fmtD(li.vencIso) : ""}${li.ultimo ? " · último envio " + fmtD(li.ultimo) : " · nunca contatado"}</div></div>${raw(tag(s.txt, s.cls))}<button class="btn btn-primary btn-sm" data-act="regua-ver" data-id="${li.origem + ":" + li.refId}">${raw(icon("mail"))} E-mail</button></div>`; }).join("")}</div>${pend.length > 6 ? `<p class="muted" style="font-size:12px;margin-top:8px">+ ${pend.length - 6} na régua completa</p>` : ""}` : vazio("Nenhum contato pendente", "Todos os relacionamentos estão em dia.");

  // ----- KPIs com comparação -----
  const delta = (a, b, { invert = false, pontos = false } = {}) => {
    if (!B || b == null || a == null) return `<div class="kpi-note">${B ? "sem base de comparação" : ""}</div>`;
    if (!b && !a) return `<div class="kpi-note">—</div>`;
    const d = pontos ? a - b : (b ? (a - b) / Math.abs(b) * 100 : null);
    if (d == null) return `<div class="kpi-note">sem movimento em ${esc(per.prev.rotulo)}</div>`;
    const bom = invert ? d < 0 : d > 0; const neutro = Math.abs(d) < 0.5;
    return `<div class="kpi-note" style="color:${neutro ? "var(--muted)" : bom ? "var(--green)" : "var(--red)"}">${neutro ? "=" : d > 0 ? "▲" : "▼"} ${Math.abs(d).toLocaleString("pt-BR", { maximumFractionDigits: pontos ? 1 : 0 })}${pontos ? " p.p." : "%"} <span class="muted">vs ${esc(per.prev.rotulo)}</span></div>`;
  };
  const kpi = (label, value, sub, extra = "", cls = "") => `<div class="kpi ${cls}"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(value)}</div>${sub}${extra}</div>`;
  $("#dash-kpis").innerHTML =
    kpi("Licitações", A.licsF.length, delta(A.licsF.length, B?.licsF.length)) +
    kpi("Total vencido", fmt(A.totalV), delta(A.totalV, B?.totalV), A.totalRenovado > 0 ? `<div class="kpi-note">inclui ${fmt(A.totalRenovado)} renovado</div>` : "", "accent") +
    kpi("Total empenhado", fmt(A.totalE), delta(A.totalE, B?.totalE), A.totalV > 0 ? `<div class="kpi-note">${pct(A.totalE / A.totalV * 100)} do vencido</div>` : "") +
    kpi("Êxito por item", pct(A.exito), delta(A.exito, B?.exito, { pontos: true }), `<div class="kpi-note">${A.ganhos} de ${A.linhas.length} itens disputados</div>`) +
    kpi("Margem das vencidas", pct(A.margem, 1), delta(A.margem, B?.margem, { pontos: true }), `<div class="kpi-note">sobre o custo</div>`) +
    kpi("Adesões aprovadas", fmt(A.totalAd), delta(A.totalAd, B?.totalAd), `<div class="kpi-note">${A.adesoesF.length} adesão(ões)</div>`);

  // ----- Onde ganhamos e perdemos -----
  const classes = ["ganho", "convocado", "empate", "acima_piso", "entre_custo_piso", "abaixo_custo"];
  const corClasse = { ganho: C.green, convocado: C.teal, empate: C.amber, acima_piso: C.grafite2, entre_custo_piso: C.orange, abaixo_custo: C.red };
  const cnt = {}, val = {}; A.linhas.forEach((r) => { const k = r.classe || (r.perdido ? "sem_info" : "ganho"); cnt[k] = (cnt[k] || 0) + 1; val[k] = (val[k] || 0) + (r.valor || 0); });
  const semInfo = cnt.sem_info || 0; const ks = classes.filter((k) => cnt[k]);
  grafico("classes", "c-classes", ks.length, "Lance o resultado das disputas (botão ↻ em Propostas) para ver por que ganhamos e perdemos.", {
    type: "bar", data: { labels: ks.map((k) => CLASSE_ROTULO[k][0]), datasets: [{ data: ks.map((k) => cnt[k]), backgroundColor: ks.map((k) => corClasse[k]), borderRadius: 4 }] },
    options: base({ indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => `${i.raw} item(ns) · ${fmt(val[ks[i.dataIndex]] || 0)}`, afterLabel: (i) => CLASSE_ROTULO[ks[i.dataIndex]][2] } } }, scales: { x: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } }, y: { ticks: { autoSkip: false, font: { size: 11 } } } } }) });
  if (semInfo && ks.length) { const box = $("#c-classes")?.closest(".card-body"); if (box && !box.querySelector(".nota-seminfo")) box.insertAdjacentHTML("beforeend", `<p class="muted nota-seminfo" style="font-size:11.5px;margin:6px 0 0">${semInfo} item(ns) perdido(s) sem preço do vencedor — importe a planilha da Effecti para classificar.</p>`); } else $("#c-classes")?.closest(".card-body")?.querySelector(".nota-seminfo")?.remove();

  const rank = rankingConcorrentes(participacoes(A.linhas)).filter((g) => !g.nos && g.sobreNos > 0).sort((a, b) => b.sobreNos - a.sobreNos || b.valorGanho - a.valorGanho).slice(0, 6);
  $("#dash-conc").innerHTML = rank.length ? `<div class="table-wrap"><table><thead><tr><th>Empresa</th><th class="num" title="Itens em que venceu disputas em que a RLUX participou">Sobre nós</th><th class="num">Total ganho</th></tr></thead><tbody>${rank.map((g) => h`<tr class="clicavel" data-act="ir" data-para="concorrentes" data-busca="${g.nome}"><td><strong>${toTitleCase(g.nome).slice(0, 36)}</strong><div class="muted" style="font-size:11px">${g.vitorias} vitória(s) · ${g.difMedia != null ? `fecha em média ${g.difMedia.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% ${g.difMedia < 0 ? "abaixo" : "acima"} do nosso lance` : "sem lance nosso comparável"}</div></td><td class="num"><strong style="color:var(--red)">${g.sobreNos}</strong></td><td class="num">${fmt(g.valorGanho)}</td></tr>`).join("")}</tbody></table></div>` : vazio("Sem concorrência registrada", "Importe os resultados da Effecti ao lançar a disputa.");

  const pp = {}; A.linhas.forEach((r) => { const k = r.portal || "—"; const g = (pp[k] ||= { itens: 0, ganhos: 0, valorGanho: 0, valorPerdido: 0 }); g.itens++; if (!r.perdido) { g.ganhos++; g.valorGanho += r.valor || 0; } else g.valorPerdido += r.valor || 0; });
  const pm = {}; A.vencF.forEach((p) => { const sg = getPortal(getLicit(p.licitacaoId).portalId)?.sigla || "—"; const g = (pm[sg] ||= { rec: 0, custo: 0 }); (p.itens || []).forEach((i) => { g.rec += i.total || 0; g.custo += (i.custo || 0) * (i.qtd || 0); }); });
  const ppK = Object.keys(pp).sort((a, b) => pp[b].itens - pp[a].itens);
  $("#dash-portal").innerHTML = ppK.length ? `<div class="table-wrap"><table><thead><tr><th>Portal</th><th class="num">Itens</th><th class="num">Êxito</th><th class="num">Ganho</th><th class="num">Margem</th></tr></thead><tbody>${ppK.map((k) => { const g = pp[k]; const e = g.ganhos / g.itens * 100; const m = pm[k] && pm[k].custo > 0 ? (pm[k].rec / pm[k].custo - 1) * 100 : null;
    return h`<tr class="clicavel" data-act="ir" data-para="resultados"><td><strong>${k}</strong></td><td class="num">${g.itens}</td><td class="num"><strong style="color:${raw(e >= 50 ? "var(--green)" : e >= 25 ? "var(--orange)" : "var(--red)")}">${pct(e)}</strong></td><td class="num">${fmt(g.valorGanho)}</td><td class="num">${pct(m, 1)}</td></tr>`; }).join("")}</tbody></table></div>` : vazio("Sem disputas com resultado no período");

  // ----- Financeiro: por mês com comparação -----
  const meses = per.meses || mesesDe(A, per); const idx = (iso) => meses.indexOf(String(iso || "").slice(0, 7));
  const serieMensal = (S, p, ms) => {
    const d = Array(ms.length).fill(0); const i2 = (iso) => ms.indexOf(String(iso || "").slice(0, 7)); const add = (iso, v) => { const i = i2(iso); if (i >= 0) d[i] += v; };
    if (metrica === "vencido") { S.vencF.forEach((x) => add(getLicit(x.licitacaoId).data, propTotal(x))); S.atasRenov.forEach((a) => add(a.assinatura, propTotal(getProp(a.propostaId)))); }
    else if (metrica === "empenhado") S.empsF.forEach((e) => add(e.data, e.valorRecebido || 0));
    else if (metrica === "custo") S.vencF.forEach((x) => add(getLicit(x.licitacaoId).data, (x.itens || []).reduce((q, i) => q + (i.custo || 0) * (i.qtd || 0), 0)));
    else if (metrica === "licitacoes") S.licsF.forEach((l) => add(l.data, 1));
    else S.propsF.forEach((x) => add(getLicit(x.licitacaoId).data, 1));
    return d;
  };
  const moeda = !["licitacoes", "propostas"].includes(metrica);
  const atual = serieMensal(A, per, meses);
  const mesesPrev = B && per.prev ? meses.map((m) => `${+m.slice(0, 4) - 1}-${m.slice(5)}`) : null;
  const anterior = mesesPrev ? serieMensal(B, per.prev, mesesPrev) : null;
  const rotMes = (m) => `${MESES_CURTOS[+m.slice(5, 7) - 1]}${per.meses && periodoSel !== "12m" ? "" : "/" + m.slice(2, 4)}`;
  const ds = [{ label: `${$("#dash-metrica").selectedOptions[0]?.textContent || ""} · ${per.rotulo}`, data: atual, backgroundColor: C.grafite, borderRadius: 4, order: 2 }];
  if (anterior) ds.push({ label: per.prev.rotulo, data: anterior, type: "line", borderColor: C.gray, backgroundColor: C.gray, borderWidth: 2, borderDash: [4, 3], pointRadius: 2, tension: .3, order: 1 });
  grafico("mes", "c-mes", atual.some((v) => v) || (anterior || []).some((v) => v), "Nada registrado neste período.", { type: "bar", data: { labels: meses.map(rotMes), datasets: ds },
    options: base({ plugins: { legend: { display: !!anterior }, tooltip: { callbacks: { label: (i) => `${i.dataset.label}: ${moeda ? fmt(i.raw) : i.raw}` } } }, scales: { y: { beginAtZero: true, ticks: moeda ? { callback: abrev } : { stepSize: 1, precision: 0 } } } }) });

  // acumulado
  const vAc = Array(meses.length).fill(0), eAc = Array(meses.length).fill(0), aAc = Array(meses.length).fill(0);
  A.vencF.forEach((p) => { const i = idx(getLicit(p.licitacaoId).data); if (i >= 0) vAc[i] += propTotal(p); });
  A.atasRenov.forEach((a) => { const i = idx(a.assinatura); if (i >= 0) vAc[i] += propTotal(getProp(a.propostaId)); });
  A.empsF.forEach((e) => { const i = idx(e.data); if (i >= 0) eAc[i] += e.valorRecebido || 0; });
  A.adesoesF.forEach((a) => { const i = idx(a.solicitacao); if (i >= 0) aAc[i] += a.valorTotal || 0; });
  const acum = (arr) => { let s = 0; return arr.map((v) => (s += v)); };
  const dsAc = [{ label: "Vencido", data: acum(vAc), borderColor: C.grafite, backgroundColor: "rgba(26,29,35,.06)", fill: true, tension: .35, borderWidth: 2, pointRadius: 2 },
    { label: "Empenhado", data: acum(eAc), borderColor: C.green, backgroundColor: "rgba(27,138,90,.08)", fill: true, tension: .35, borderWidth: 2, pointRadius: 2 }];
  if (aAc.some((v) => v)) dsAc.push({ label: "Adesões", data: acum(aAc), borderColor: C.purple, borderWidth: 2, borderDash: [5, 3], tension: .35, pointRadius: 2 });
  grafico("acum", "c-acum", vAc.some((v) => v) || eAc.some((v) => v), "Sem propostas vencidas nem empenhos no período.", { type: "line", data: { labels: meses.map(rotMes), datasets: dsAc },
    options: base({ plugins: { tooltip: { callbacks: { label: (i) => `${i.dataset.label}: ${fmt(i.raw)}` } } }, scales: { y: { beginAtZero: true, ticks: { callback: abrev } } } }) });

  // mix por categoria (barras horizontais ordenadas)
  const prods = store.get("produtos"); const catMap = {};
  A.vencF.forEach((p) => (p.itens || []).forEach((i) => { const prod = prods.find((x) => x.id === i.produtoId); const cat = prod ? getCat(prod.catId) : {}; const k = cat.nome || "Sem categoria"; (catMap[k] ||= { val: 0, cor: cat.cor || C.gray }).val += i.total || 0; }));
  const catK = Object.keys(catMap).sort((a, b) => catMap[b].val - catMap[a].val).slice(0, 8); const catTot = catK.reduce((s, k) => s + catMap[k].val, 0);
  grafico("mix", "c-mix", catK.length, "Sem propostas vencidas no período.", { type: "bar", data: { labels: catK, datasets: [{ data: catK.map((k) => catMap[k].val), backgroundColor: catK.map((k) => catMap[k].cor), borderRadius: 4 }] },
    options: base({ indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => `${fmt(i.raw)} · ${pct(i.raw / catTot * 100)}` } } }, scales: { x: { beginAtZero: true, ticks: { callback: abrev } }, y: { ticks: { autoSkip: false, font: { size: 11 } } } } }) });

  // empenhos por estado
  const estMap = {}; A.empsF.forEach((e) => { const p = getProp(e.propostaId); const l = getLicit(p?.licitacaoId); const o = getOrgao(l?.orgaoId); const uf = o.estado || "Sem UF"; estMap[uf] = (estMap[uf] || 0) + (e.valorRecebido || 0); });
  const est = Object.entries(estMap).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
  grafico("estado", "c-estado", est.length, "Sem empenhos no período.", { type: "bar", data: { labels: est.map(([k]) => k), datasets: [{ data: est.map(([, v]) => v), backgroundColor: C.grafite, borderRadius: 4 }] },
    options: base({ indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => fmt(i.raw) } } }, scales: { x: { beginAtZero: true, ticks: { callback: abrev } }, y: { ticks: { autoSkip: false } } } }) });

  // resultado das propostas por status (barras)
  const stG = {}; A.propsF.forEach((p) => { const st = p.status || "Em Andamento"; stG[st] = (stG[st] || 0) + propTotal(p); });
  const stK = Object.keys(stG).sort((a, b) => stG[b] - stG[a]);
  grafico("result", "c-result", stK.length, "Sem propostas no período.", { type: "bar", data: { labels: stK, datasets: [{ data: stK.map((k) => stG[k]), backgroundColor: stK.map((k) => COR_STATUS[k] || C.gray), borderRadius: 4 }] },
    options: base({ indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => fmt(i.raw) } } }, scales: { x: { beginAtZero: true, ticks: { callback: abrev } }, y: { ticks: { autoSkip: false, font: { size: 11 } } } } }) });

  // top produtos / órgãos
  const pv = {}; A.vencF.forEach((p) => (p.itens || []).forEach((i) => { const k = i.produtoId || i.codigo || i.nome; const r = (pv[k] ||= { nome: i.nome, codigo: i.codigo, qtd: 0, receita: 0, n: 0 }); r.qtd += i.qtd || 0; r.receita += i.total || 0; r.n++; }));
  const topP = Object.values(pv).sort((a, b) => b.receita - a.receita).slice(0, 6);
  $("#dash-topprod").innerHTML = topP.length ? `<div class="table-wrap"><table><thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Receita</th></tr></thead><tbody>${topP.map((x) => h`<tr class="clicavel" data-act="ir" data-para="produtos" data-busca="${x.codigo || x.nome || ""}"><td><strong>${(x.nome || "").slice(0, 34)}</strong><div class="muted" style="font-size:11px">${x.codigo || ""} · ${x.n} proposta${x.n > 1 ? "s" : ""}</div></td><td class="num">${x.qtd.toLocaleString("pt-BR")}</td><td class="num"><strong>${fmt(x.receita)}</strong></td></tr>`).join("")}</tbody></table></div>` : vazio("Sem produtos vendidos no período");
  const orgMap = {}; A.empsF.forEach((e) => { const p = getProp(e.propostaId); const l = getLicit(p?.licitacaoId); const o = getOrgao(l?.orgaoId); if (!o.nome) return; const g = (orgMap[o.id] ||= { nome: o.nome, uasg: o.uasg || "", total: 0, qtd: 0 }); g.total += e.valorRecebido || 0; g.qtd++; });
  const topO = Object.values(orgMap).sort((a, b) => b.total - a.total).slice(0, 6);
  $("#dash-top-org").innerHTML = topO.length ? `<div class="table-wrap"><table><thead><tr><th>Órgão</th><th class="num">Empenhos</th><th class="num">Total</th></tr></thead><tbody>${topO.map((o) => h`<tr class="clicavel" data-act="ir" data-para="empenhos" data-busca="${o.nome}"><td><strong>${toTitleCase(o.nome).slice(0, 38)}</strong><div class="muted" style="font-size:11px">UASG ${o.uasg || "—"}</div></td><td class="num">${o.qtd}</td><td class="num"><strong>${fmt(o.total)}</strong></td></tr>`).join("")}</tbody></table></div>` : vazio("Sem empenhos no período");

  // ----- Análises complementares -----
  const nLics = A.licsF.length, nProps = A.propsF.length, nVenc = A.vencF.length, nEmp = new Set(A.empsF.map((e) => e.propostaId)).size; const max = nLics || 1;
  const ticket = nVenc ? A.vencF.reduce((s, p) => s + propTotal(p), 0) / nVenc : 0;
  $("#dash-funil").innerHTML = [["Licitações", nLics, C.grafite2], ["Propostas", nProps, C.purple], ["Vencidas", nVenc, C.green], ["Empenhadas", nEmp, C.teal]].map(([lbl, v, cor]) => `
    <div class="funnel-row"><div class="lbl">${lbl}</div><div class="bar"><div class="fill" style="width:${Math.round(v / max * 100)}%;background:${cor}">${v}</div></div><div class="val">${Math.round(v / max * 100)}%</div></div>`).join("") +
    `<p class="muted" style="font-size:12.5px;margin-top:10px">Conversão: <strong>${nLics ? Math.round(nVenc / nLics * 100) : 0}%</strong> · Ticket médio vencido: <strong>${nVenc ? fmt(ticket) : "—"}</strong></p>`;

  const saz = Array(12).fill(0); lics.forEach((l) => { if (l.data) saz[+l.data.slice(5, 7) - 1]++; }); const sazMax = Math.max(...saz, 1);
  const sazCor = ["#f1f1ee", "#dcdcd8", "#bfc0bb", "#8e9096", "#5a5e68", "#1a1d23"];
  $("#dash-saz").innerHTML = `<div class="heat-grid">${MESES_CURTOS.map((m, i) => { const k = Math.min(Math.floor(saz[i] / sazMax * 5), 5); return `<div class="heat-cell" style="background:${sazCor[k]};color:${k >= 3 ? "#fff" : "var(--text)"}"><small>${m}</small><strong>${saz[i]}</strong></div>`; }).join("")}</div><p class="muted" style="font-size:11.5px;margin-top:8px">Todos os anos somados · cor mais escura = mais licitações no mês</p>`;

  const dd = (a, b) => Math.round((new Date(b.slice(0, 10)) - new Date(a.slice(0, 10))) / 864e5); const okd = (d) => d >= 0 && d < 365;
  const t1 = [], t2 = [], t3 = [];
  A.propsF.forEach((p) => { const l = getLicit(p.licitacaoId); if (l.data && p.criadoEm) { const d = dd(l.data, p.criadoEm); if (okd(d)) t1.push(d); } });
  atas.forEach((a) => { const p = getProp(a.propostaId); if (p?.criadoEm && a.assinatura) { const d = dd(p.criadoEm, a.assinatura); if (okd(d)) t2.push(d); }
    emps.filter((e) => e.propostaId === a.propostaId).forEach((e) => { if (a.assinatura && e.data) { const d = dd(a.assinatura, e.data); if (okd(d)) t3.push(d); } }); });
  const avg = (arr) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;
  const etapas = [["Licitação → Proposta", avg(t1)], ["Proposta → ATA", avg(t2)], ["ATA → Empenho", avg(t3)]]; const ciclo = etapas.reduce((s, e) => s + (e[1] || 0), 0);
  $("#dash-ciclo").innerHTML = `<div class="list">${etapas.map(([l, d]) => `<div class="list-item"><div class="list-main"><div class="list-title">${l}</div></div><strong>${d != null ? d + (d === 1 ? " dia" : " dias") : "—"}</strong></div>`).join("")}</div>${ciclo ? `<p class="muted" style="font-size:12.5px;margin-top:10px">Ciclo total médio: <strong>${ciclo} dias</strong></p>` : ""}`;

  const tipoMap = {}; A.licsF.forEach((l) => { const tp = l.tipo || "Outros"; (tipoMap[tp] ||= { total: 0, venc: 0 }).total++; if (props.some((p) => p.licitacaoId === l.id && STATUS_VENCIDO.includes(p.status))) tipoMap[tp].venc++; });
  const tipoK = Object.keys(tipoMap).sort((a, b) => tipoMap[b].total - tipoMap[a].total);
  $("#dash-winrate").innerHTML = tipoK.length ? tipoK.map((tp) => { const wr = Math.round(tipoMap[tp].venc / tipoMap[tp].total * 100); const cor = wr >= 50 ? "var(--green)" : wr >= 25 ? "var(--orange)" : "var(--red)";
    return h`<div class="bar-row"><div class="bar-head"><span>${tp}</span><strong style="color:${raw(cor)}">${wr}% <small class="muted">(${tipoMap[tp].venc}/${tipoMap[tp].total})</small></strong></div><div class="prog"><div class="prog-fill" style="width:${wr}%;background:${raw(cor)}"></div></div></div>`; }).join("") : vazio("Sem licitações no período");

  const orgRec = {}; A.licsF.forEach((l) => { const o = getOrgao(l.orgaoId); if (!o.id) return; (orgRec[o.id] ||= { nome: o.nome, uasg: o.uasg, n: 0 }).n++; });
  const recs = Object.values(orgRec).filter((o) => o.n > 1).sort((a, b) => b.n - a.n).slice(0, 6);
  $("#dash-recorr").innerHTML = recs.length ? `<div class="table-wrap"><table><thead><tr><th>Órgão</th><th class="num">Licitações</th></tr></thead><tbody>${recs.map((o) => h`<tr class="clicavel" data-act="ir" data-para="licitacoes" data-busca="${o.nome}"><td><strong>${toTitleCase(o.nome).slice(0, 34)}</strong><div class="muted" style="font-size:11px">UASG ${o.uasg || "—"}</div></td><td class="num">${raw(tag(o.n + "×", "tag-gray"))}</td></tr>`).join("")}</tbody></table></div>` : vazio("Sem órgãos recorrentes no período");

  const acts = [];
  lics.slice(-3).forEach((l) => acts.push({ t: `Licitação ${l.numero}`, s: fmtD(l.data) }));
  props.slice(-3).forEach((p) => acts.push({ t: `Proposta #${p.num || "?"}`, s: p.status || "Em Andamento" }));
  $("#dash-ativ").innerHTML = acts.length ? `<div class="list">${acts.reverse().map((a) => h`<div class="list-item"><div class="list-main"><div class="list-title">${a.t}</div><div class="list-sub">${a.s}</div></div></div>`).join("")}</div>` : vazio("Nada registrado ainda");
}

// meses para "todos os anos": do primeiro ao último mês com movimento (máx. 36)
function mesesDe(A, per) {
  const ms = new Set();
  A.licsF.forEach((l) => l.data && ms.add(l.data.slice(0, 7))); A.empsF.forEach((e) => e.data && ms.add(e.data.slice(0, 7)));
  const arr = [...ms].sort(); if (!arr.length) return [hojeIso().slice(0, 7)];
  const out = []; const d = new Date(arr[0] + "-01T00:00:00Z"); const fim = arr[arr.length - 1];
  while (d.toISOString().slice(0, 7) <= fim && out.length < 36) { out.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1); }
  return out.slice(-36);
}

// Gráfico com estado vazio explicativo
function grafico(key, canvasId, temDados, msgVazio, cfg) {
  const canvas = document.getElementById(canvasId); if (!canvas) return; const empty = canvas.parentElement.querySelector(".chart-empty");
  if (cfg?.options?.indexAxis === "y") { const n = cfg.data?.labels?.length || 0; canvas.parentElement.style.height = Math.max(160, Math.min(420, n * 30 + 56)) + "px"; cfg.options.datasets = { bar: { categoryPercentage: .72, barPercentage: .9, maxBarThickness: 22 } }; }
  if (!temDados) { canvas.style.visibility = "hidden"; if (empty) { empty.hidden = false; empty.textContent = msgVazio; } return; }
  canvas.style.visibility = ""; if (empty) empty.hidden = true; reg.chart(key, canvasId, cfg);
}

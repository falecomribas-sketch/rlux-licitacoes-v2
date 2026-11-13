// Relatórios — mesmas abas e cálculos do sistema atual (renderRExec, renderRFunil, ...),
// com filtro de ano em todas as abas e exportação Excel.
import { store } from "../core/store.js?v=20261113-114024";
import { $, fmt, fmtD, fmtNum, esc, raw, h, MESES_CURTOS, toTitleCase, hojeIso } from "../core/utils.js?v=20261113-114024";
import { icon, vazio, tag } from "../core/ui.js?v=20261113-114024";
import { exportarExcel, UFS } from "../core/forms.js?v=20261113-114024";
import { registro, base, short, CORES, COR_STATUS, tipMoeda } from "../core/charts.js?v=20261113-114024";
import { getLicit, getOrgao, getProp, getPortal, getCat, isEspelho, isVencido, propTotal, propEmpenhado, STATUS_CLASS } from "../core/domain.js?v=20261113-114024";

const ABAS = [["exec", "Executivo"], ["funil", "Funil"], ["vsemp", "Vencido × Empenhado"], ["portais", "Portais"], ["orgaos", "Órgãos"], ["estados", "Estados"], ["atas", "ATAs"], ["propostas", "Propostas"], ["empenhos", "Empenhos"]];
let aba = "exec", anoSel = null, unsub = null; const reg = registro();
let fAtaV = "", fAtaUF = "";

export default {
  id: "relatorios", titulo: "Relatórios", grupo: "CRM e análise", icone: "chart",
  render(el) {
    el.innerHTML = `
      <div class="dash-toolbar"><label class="field field-inline"><span>Ano</span><select id="rel-ano"></select></label></div>
      <div class="tabs" id="rel-tabs">${ABAS.map(([k, t]) => `<button class="tab ${aba === k ? "active" : ""}" data-aba="${k}">${t}</button>`).join("")}</div>
      <div id="rel-body"></div>`;
    el.querySelector("#rel-tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-aba]"); if (!b) return; aba = b.dataset.aba; el.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.dataset.aba === aba)); reg.destroy(); desenhar(); });
    el.querySelector("#rel-ano").addEventListener("change", (e) => { anoSel = e.target.value; desenhar(); });
    el.querySelector("#rel-body").addEventListener("click", (e) => { const b = e.target.closest("[data-act]"); if (b) acoes[b.dataset.act]?.(); });
    el.querySelector("#rel-body").addEventListener("change", (e) => { if (e.target.name === "fAtaV") { fAtaV = e.target.value; desenhar(); } if (e.target.name === "fAtaUF") { fAtaUF = e.target.value; desenhar(); } });
    store.ready().then(desenhar); unsub = store.on("*", () => { clearTimeout(desenhar._t); desenhar._t = setTimeout(desenhar, 150); });
  },
  destroy() { unsub?.(); reg.destroy(); },
};

// ---------- dados filtrados por ano ----------
function dados() {
  const anoAtual = new Date().getFullYear();
  const props = store.get("propostas").filter((p) => !isEspelho(p)), lics = store.get("licitacoes"), emps = store.get("empenhos"), atas = store.get("atas"), adesoes = store.get("adesoes");
  const anos = new Set([anoAtual]); lics.forEach((l) => l.data && anos.add(+l.data.slice(0, 4))); emps.forEach((e) => e.data && anos.add(+e.data.slice(0, 4)));
  const sel = $("#rel-ano"); if (anoSel === null) anoSel = String(anoAtual);
  sel.innerHTML = `<option value="todos">Todos os anos</option>` + [...anos].sort((a, b) => b - a).map((a) => `<option value="${a}">${a}</option>`).join(""); sel.value = anoSel;
  const ano = anoSel === "todos" ? null : +anoSel; const noAno = (iso) => !ano || (iso && +iso.slice(0, 4) === ano);
  const licsF = lics.filter((l) => noAno(l.data)), propsF = props.filter((p) => noAno(getLicit(p.licitacaoId).data)), empsF = emps.filter((e) => noAno(e.data));
  const atasF = atas.filter((a) => a.propostaId && noAno(getLicit(getProp(a.propostaId)?.licitacaoId).data));
  const adesoesF = adesoes.filter((a) => a.status === "Aprovada" && noAno(a.solicitacao));
  const atasRenov = atas.filter((a) => a.ataOrigemId && a.propostaId && noAno(a.assinatura));
  return { ano, rotulo: ano || "todos os anos", licsF, propsF, empsF, atasF, adesoesF, atasRenov, vend: propsF.filter(isVencido), emps, atas, props };
}
const ctxProp = (p) => { const l = getLicit(p?.licitacaoId), o = getOrgao(l.orgaoId); return { l, o }; };
const ctxEmp = (e) => { if (e.adesaoId) { const a = store.find("adesoes", e.adesaoId) || {}; const ata = store.find("atas", a.ataId) || {}; const p = getProp(ata.propostaId); const { l } = ctxProp(p); return { p, l, o: { nome: a.orgaoAderente, uasg: a.uasgAderente, estado: getOrgao(a.orgaoId).estado } }; } const p = getProp(e.propostaId); return { p, ...ctxProp(p) }; };

function desenhar() {
  const body = $("#rel-body"); if (!body) return; const d = dados();
  ({ exec, funil, vsemp, portais, orgaos, estados, atas: relAtas, propostas, empenhos })[aba](body, d);
}
const card = (titulo, inner, extra = "") => `<div class="card"><div class="card-head"><h2>${titulo}</h2>${extra}</div><div class="card-body">${inner}</div></div>`;
const btnExcel = (act) => `<button class="btn btn-ghost btn-sm" data-act="${act}">${icon("download")} Excel</button>`;
const tabela = (cols, rows, total = "") => `<div class="table-wrap"><table><thead><tr>${cols.map((c) => `<th class="${c.startsWith("#") ? "num" : ""}">${c.replace(/^#/, "")}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${cols.length}" class="muted" style="text-align:center;padding:24px">Sem dados no período</td></tr>`}${total}</tbody></table></div>`;
const td = (v, num = false) => `<td class="${num ? "num" : ""}">${v}</td>`;
const kpi = (label, value, note = "", cor = "") => `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value" ${cor ? `style="color:${cor}"` : ""}>${value}</div>${note ? `<div class="kpi-note">${note}</div>` : ""}</div>`;
let ultimo = {}; // dados da última aba desenhada, para exportação

// ---------- Executivo ----------
function exec(body, d) {
  const totalVPregoes = d.vend.reduce((s, p) => s + propTotal(p), 0), totalRenovado = d.atasRenov.reduce((s, a) => s + propTotal(getProp(a.propostaId)), 0), totalV = totalVPregoes + totalRenovado;
  const totalAd = d.adesoesF.reduce((s, a) => s + (a.valorTotal || 0), 0), totalE = d.empsF.reduce((s, e) => s + (e.valorRecebido || 0), 0), receita = totalV + totalAd;
  const taxa = d.propsF.length ? Math.round(d.vend.length / d.propsF.length * 100) : 0, ticket = d.vend.length ? totalVPregoes / d.vend.length : 0;
  body.innerHTML = `
    <div class="grid grid-4" style="margin-bottom:16px">
      ${kpi("Total vencido", fmt(totalV), `${d.vend.length} proposta(s)${totalRenovado ? ` + ${fmt(totalRenovado)} renovado` : ""}`)}
      ${kpi("Adesões aprovadas", fmt(totalAd), `${d.adesoesF.length} adesão(ões)`, "var(--purple)")}
      ${kpi("Receita total", fmt(receita), "vencido + adesões")}
      ${kpi("Total empenhado", fmt(totalE), `${d.empsF.length} empenho(s)`, "var(--green)")}
      ${kpi("Saldo a empenhar", fmt(receita - totalE), `${receita ? Math.round(totalE / receita * 100) : 0}% empenhado`, "var(--amber-txt)")}
      ${kpi("Taxa de conversão", taxa + "%", `${d.propsF.length} propostas`)}
      ${kpi("Ticket médio", fmt(ticket), "por proposta vencida")}
      ${kpi("ATAs", d.atasF.length, `${store.get("orgaos").length} órgãos cadastrados`)}
    </div>
    <div class="grid grid-2">
      ${card(`Tendência mensal — ${d.rotulo}`, `<div class="chart-box"><canvas id="c-tend"></canvas></div>`)}
      ${card("Conversão por portal", `<div class="chart-box"><canvas id="c-convp"></canvas></div>`)}
      ${card("Receita por categoria de produto", `<div class="chart-box"><canvas id="c-cat"></canvas></div>`)}
      ${card("Propostas por status (R$)", `<div class="chart-box"><canvas id="c-stval"></canvas></div>`)}
    </div>`;
  const mes = (iso) => +iso.slice(5, 7) - 1; const v = Array(12).fill(0), e = Array(12).fill(0), a = Array(12).fill(0);
  d.vend.forEach((p) => { const l = getLicit(p.licitacaoId); if (l.data) v[mes(l.data)] += propTotal(p); });
  d.atasRenov.forEach((x) => { if (x.assinatura) v[mes(x.assinatura)] += propTotal(getProp(x.propostaId)); });
  d.empsF.forEach((x) => { if (x.data) e[mes(x.data)] += x.valorRecebido || 0; });
  d.adesoesF.forEach((x) => { if (x.solicitacao) a[mes(x.solicitacao)] += x.valorTotal || 0; });
  reg.chart("tend", "c-tend", { type: "line", data: { labels: MESES_CURTOS, datasets: [
    { label: "Vencido", data: v, borderColor: "#2457d6", backgroundColor: "rgba(36,87,214,.08)", fill: true, tension: .4 },
    { label: "Adesões", data: a, borderColor: "#6d3fc9", backgroundColor: "rgba(109,63,201,.06)", fill: true, tension: .4, borderDash: [5, 3] },
    { label: "Empenhado", data: e, borderColor: "#1b8a5a", backgroundColor: "rgba(27,138,90,.08)", fill: true, tension: .4 }] },
    options: base({ plugins: { tooltip: tipMoeda }, scales: { y: { beginAtZero: true, ticks: { callback: short } } } }) });
  const pm = {}; store.get("portais").forEach((p) => { pm[p.id] = { sigla: p.sigla, total: 0, venc: 0 }; });
  d.propsF.forEach((p) => { const l = getLicit(p.licitacaoId); if (!pm[l.portalId]) return; pm[l.portalId].total++; if (isVencido(p)) pm[l.portalId].venc++; });
  const pk = Object.keys(pm).filter((k) => pm[k].total > 0);
  reg.chart("convp", "c-convp", { type: "bar", data: { labels: pk.map((k) => pm[k].sigla), datasets: [{ label: "Propostas", data: pk.map((k) => pm[k].total), backgroundColor: "rgba(36,87,214,.45)", borderRadius: 4 }, { label: "Vencidas", data: pk.map((k) => pm[k].venc), backgroundColor: "#1b8a5a", borderRadius: 4 }] },
    options: base({ scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }) });
  const prods = store.get("produtos"), cm = {};
  d.propsF.forEach((p) => (p.itens || []).forEach((i) => { const prod = prods.find((x) => x.id === i.produtoId); if (!prod?.catId) return; const c = getCat(prod.catId); (cm[prod.catId] ||= { nome: c.nome || "?", cor: c.cor || "#a9b3c7", val: 0 }).val += i.total || 0; }));
  const ck = Object.keys(cm).filter((k) => cm[k].val > 0);
  reg.chart("cat", "c-cat", { type: "doughnut", data: { labels: ck.map((k) => cm[k].nome), datasets: [{ data: ck.map((k) => cm[k].val), backgroundColor: ck.map((k) => cm[k].cor), borderWidth: 0 }] }, options: base({ cutout: "60%", plugins: { legend: { position: "bottom" }, tooltip: tipMoeda } }) });
  const sm = {}; d.propsF.forEach((p) => { const st = p.status || "Em Andamento"; sm[st] = (sm[st] || 0) + propTotal(p); }); const sk = Object.keys(sm);
  reg.chart("stval", "c-stval", { type: "bar", data: { labels: sk, datasets: [{ label: "Valor", data: sk.map((k) => sm[k]), backgroundColor: sk.map((k) => COR_STATUS[k] || "#a9b3c7"), borderRadius: 5 }] }, options: base({ plugins: { legend: { display: false }, tooltip: tipMoeda }, scales: { y: { beginAtZero: true, ticks: { callback: short } } } }) });
}

// ---------- Funil ----------
function funil(body, d) {
  const valProp = d.propsF.reduce((s, p) => s + propTotal(p), 0), valVend = d.vend.reduce((s, p) => s + propTotal(p), 0), valEmp = d.empsF.reduce((s, e) => s + (e.valorRecebido || 0), 0), valAd = d.adesoesF.reduce((s, a) => s + (a.valorTotal || 0), 0);
  const nL = d.licsF.length, nP = d.propsF.length, nV = d.vend.length, nA = d.adesoesF.length, nE = d.empsF.length, nT = d.atasF.length;
  const steps = [["Licitações", nL, 0, "#2457d6", 100], ["Propostas", nP, valProp, "#6d3fc9", nL ? Math.round(nP / nL * 100) : 0], ["Vencidas", nV, valVend, "#1b8a5a", nP ? Math.round(nV / nP * 100) : 0], ["Adesões", nA, valAd, "#6d3fc9", nV ? Math.round(nA / nV * 100) : 0], ["Empenhos", nE, valEmp, "#d9641c", nV ? Math.round(nE / nV * 100) : 0], ["ATAs", nT, 0, "#0f7f8c", nV ? Math.round(nT / nV * 100) : 0]];
  ultimo.funil = steps.map(([Etapa, Qtd, Valor, , Pct]) => ({ Etapa, Qtd, Valor, "%": Pct }));
  body.innerHTML = card(`Funil de licitações — ${d.rotulo}`, `<div style="max-width:760px;margin:0 auto">${steps.map(([l, n, v, c, pct]) => `<div class="funnel-row"><div class="lbl">${l}</div><div class="bar"><div class="fill" style="width:${Math.max(pct, n ? 4 : 0)}%;background:${c}">${n}</div></div><div class="val" style="width:150px">${v ? fmt(v) : ""} <span class="muted">${pct}%</span></div></div>`).join("")}</div>
    <div class="grid grid-4" style="margin-top:18px">${kpi("Volume vencido", fmt(valVend), "", "var(--green)")}${kpi("Volume adesões", fmt(valAd), "", "var(--purple)")}${kpi("Volume empenhado", fmt(valEmp), "", "var(--orange)")}${kpi("Em aberto", fmt(valVend + valAd - valEmp), "receita − empenhado", "var(--red)")}</div>`, btnExcel("xFunil"));
}

// ---------- Vencido × Empenhado ----------
function vsemp(body, d) {
  const rows = d.vend.map((p) => { const { l, o } = ctxProp(p); const tV = propTotal(p), tE = propEmpenhado(p.id); return { p, l, o, tV, tE, saldo: tV - tE, pct: tV ? Math.round(tE / tV * 100) : 0 }; }).sort((a, b) => b.tV - a.tV);
  const totV = rows.reduce((s, r) => s + r.tV, 0), totE = rows.reduce((s, r) => s + r.tE, 0);
  ultimo.vsemp = rows.map((r) => ({ Proposta: "#" + (r.p.num || "?"), "Pregão/Nº": r.l.numero || "", Tipo: r.l.tipo || "", UASG: r.o.uasg || "", Órgão: r.o.nome || "", "Valor Vencido": r.tV, "Valor Empenhado": r.tE, Saldo: r.saldo, "% Empenhado": r.pct + "%" }));
  body.innerHTML = card(`Vencido vs empenhado — ${d.rotulo}`, `<div class="chart-box lg"><canvas id="c-vsemp"></canvas></div><div style="margin-top:16px">${tabela(["Nº", "Pregão", "UASG", "Órgão", "#Vencido", "#Empenhado", "#Saldo", "#%"], rows.map((r) => h`<tr>${raw(td("#" + (r.p.num || "?")))}${raw(td(esc(r.l.numero || "—")))}${raw(td(esc(r.o.uasg || "—")))}${raw(td(esc(toTitleCase(r.o.nome || "—"))))}${raw(td(fmt(r.tV), 1))}${raw(td(fmt(r.tE), 1))}${raw(td(fmt(r.saldo), 1))}${raw(td(tag(r.pct + "%", r.pct >= 100 ? "tag-green" : r.pct >= 50 ? "tag-amber" : "tag-red"), 1))}</tr>`), `<tr class="tbl-total"><td colspan="4">Total</td>${td(fmt(totV), 1)}${td(fmt(totE), 1)}${td(fmt(totV - totE), 1)}${td((totV ? Math.round(totE / totV * 100) : 0) + "%", 1)}</tr>`)}</div>`, btnExcel("xVsemp"));
  const top = rows.slice(0, 25);
  reg.chart("vsemp", "c-vsemp", { type: "bar", data: { labels: top.map((r) => `#${r.p.num || "?"} ${r.l.numero || ""}`), datasets: [{ label: "Vencido", data: top.map((r) => r.tV), backgroundColor: "rgba(36,87,214,.8)", borderRadius: 4 }, { label: "Empenhado", data: top.map((r) => r.tE), backgroundColor: "#1b8a5a", borderRadius: 4 }] }, options: base({ plugins: { tooltip: tipMoeda }, scales: { y: { beginAtZero: true, ticks: { callback: short } }, x: { ticks: { font: { size: 10 } } } } }) });
}

// ---------- Portais ----------
function portais(body, d) {
  const pm = {}; store.get("portais").forEach((p) => { pm[p.id] = { sigla: p.sigla, nome: p.nome, total: 0, vend: 0, valV: 0, valE: 0 }; });
  d.propsF.forEach((p) => { const l = getLicit(p.licitacaoId); if (!pm[l.portalId]) return; pm[l.portalId].total++; if (isVencido(p)) { pm[l.portalId].vend++; pm[l.portalId].valV += propTotal(p); } });
  d.empsF.forEach((e) => { const { l } = ctxEmp(e); if (pm[l?.portalId]) pm[l.portalId].valE += e.valorRecebido || 0; });
  const items = Object.values(pm).sort((a, b) => b.valV - a.valV);
  ultimo.portais = items.map((p) => ({ Portal: p.sigla, Nome: p.nome, Propostas: p.total, Vencidas: p.vend, "Valor Vencido": p.valV, "Valor Empenhado": p.valE, Taxa: (p.total ? Math.round(p.vend / p.total * 100) : 0) + "%" }));
  body.innerHTML = `<div class="grid grid-2" style="margin-bottom:16px">${card("Vencido por portal", `<div class="chart-box"><canvas id="c-vport"></canvas></div>`)}${card("Empenhado por portal", `<div class="chart-box"><canvas id="c-eport"></canvas></div>`)}</div>
    ${card(`Detalhamento — ${d.rotulo}`, tabela(["Portal", "#Propostas", "#Vencidas", "#Valor vencido", "#Valor empenhado", "#Taxa"], items.map((p) => `<tr>${td(`<strong>${esc(p.sigla)}</strong> <span class="muted">${esc(p.nome || "")}</span>`)}${td(p.total, 1)}${td(p.vend, 1)}${td(fmt(p.valV), 1)}${td(fmt(p.valE), 1)}${td(tag((p.total ? Math.round(p.vend / p.total * 100) : 0) + "%", p.total && p.vend / p.total >= .5 ? "tag-green" : "tag-amber"), 1)}</tr>`)), btnExcel("xPortais"))}`;
  const labels = items.map((p) => p.sigla);
  reg.chart("vport", "c-vport", { type: "bar", data: { labels, datasets: [{ label: "Vencido", data: items.map((p) => p.valV), backgroundColor: labels.map((_, i) => CORES[i % CORES.length]), borderRadius: 5 }] }, options: base({ plugins: { legend: { display: false }, tooltip: tipMoeda }, scales: { y: { beginAtZero: true, ticks: { callback: short } } } }) });
  reg.chart("eport", "c-eport", { type: "bar", data: { labels, datasets: [{ label: "Empenhado", data: items.map((p) => p.valE), backgroundColor: labels.map((_, i) => CORES[(i + 1) % CORES.length]), borderRadius: 5 }] }, options: base({ plugins: { legend: { display: false }, tooltip: tipMoeda }, scales: { y: { beginAtZero: true, ticks: { callback: short } } } }) });
}

// ---------- Órgãos ----------
function orgaos(body, d) {
  const om = {}; const add = (o) => om[o.id] ||= { nome: o.nome || "—", uasg: o.uasg || "—", estado: o.estado || "", valV: 0, valE: 0 };
  d.vend.forEach((p) => { const { o } = ctxProp(p); if (o.id) add(o).valV += propTotal(p); });
  d.empsF.filter((e) => !e.adesaoId).forEach((e) => { const { o } = ctxEmp(e); if (o.id) add(o).valE += e.valorRecebido || 0; });
  const items = Object.values(om).sort((a, b) => b.valV - a.valV);
  ultimo.orgaos = items.map((o) => ({ Órgão: o.nome, UF: o.estado, UASG: o.uasg, "Valor Vencido": o.valV, "Valor Empenhado": o.valE, Saldo: o.valV - o.valE }));
  body.innerHTML = `<div class="grid grid-2" style="margin-bottom:16px">${card("Top 10 órgãos — vencido", `<div class="chart-box lg"><canvas id="c-vorg"></canvas></div>`)}${card("Top 10 órgãos — empenhado", `<div class="chart-box lg"><canvas id="c-eorg"></canvas></div>`)}</div>
    ${card(`Detalhamento — ${d.rotulo}`, tabela(["Órgão", "UF", "UASG", "#Valor vencido", "#Valor empenhado", "#Saldo"], items.map((o) => `<tr>${td(`<strong>${esc(toTitleCase(o.nome))}</strong>`)}${td(esc(o.estado || "—"))}${td(esc(o.uasg))}${td(fmt(o.valV), 1)}${td(fmt(o.valE), 1)}${td(fmt(o.valV - o.valE), 1)}</tr>`)), btnExcel("xOrgaos"))}`;
  const t10 = items.slice(0, 10), lbl = t10.map((o) => toTitleCase(o.nome).slice(0, 28)); const opts = base({ indexAxis: "y", plugins: { legend: { display: false }, tooltip: tipMoeda }, scales: { x: { beginAtZero: true, ticks: { callback: short } }, y: { ticks: { autoSkip: false, font: { size: 10 } } } } });
  reg.chart("vorg", "c-vorg", { type: "bar", data: { labels: lbl, datasets: [{ label: "Vencido", data: t10.map((o) => o.valV), backgroundColor: "rgba(36,87,214,.8)", borderRadius: 4 }] }, options: opts });
  const t10e = items.slice().sort((a, b) => b.valE - a.valE).slice(0, 10);
  reg.chart("eorg", "c-eorg", { type: "bar", data: { labels: t10e.map((o) => toTitleCase(o.nome).slice(0, 28)), datasets: [{ label: "Empenhado", data: t10e.map((o) => o.valE), backgroundColor: "#1b8a5a", borderRadius: 4 }] }, options: base({ indexAxis: "y", plugins: { legend: { display: false }, tooltip: tipMoeda }, scales: { x: { beginAtZero: true, ticks: { callback: short } }, y: { ticks: { autoSkip: false, font: { size: 10 } } } } }) });
}

// ---------- Estados ----------
const GRID = [["", "", "RR", "", "", "AP", ""], ["", "", "AM", "", "", "PA", "MA"], ["AC", "RO", "", "TO", "", "", "PI", "CE", "RN", "PB"], ["", "", "MT", "", "", "", "", "PE", "AL"], ["", "", "", "GO", "DF", "", "BA", "", "SE"], ["", "MS", "", "", "MG", "", "ES"], ["", "", "SP", "", "", "RJ"], ["", "PR"], ["", "", "SC"], ["", "RS"]];
function estados(body, d) {
  const em = {}; UFS.forEach((u) => { em[u] = { vencido: 0, empenhado: 0, n: 0 }; });
  d.vend.forEach((p) => { const { o } = ctxProp(p); if (em[o.estado]) { em[o.estado].vencido += propTotal(p); em[o.estado].n++; } });
  d.empsF.forEach((e) => { const { o } = ctxEmp(e); if (em[o.estado]) em[o.estado].empenhado += e.valorRecebido || 0; });
  const max = Math.max(...UFS.map((u) => em[u].vencido), 1); const W = 34, H = 24, P = 2;
  const mix = (t) => `rgb(${Math.round(219 - t * 199)},${Math.round(230 - t * 190)},${Math.round(251 - t * 144)})`; // azul claro → navy
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${10 * (W + P) + P} ${10 * (H + P) + P}">`;
  GRID.forEach((row, ri) => row.forEach((uf, ci) => { if (!uf) return; const v = em[uf].vencido, t = v / max; const x = P + ci * (W + P), y = P + ri * (H + P);
    svg += `<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="4" fill="${v > 0 ? mix(t) : "#eef1f6"}"><title>${uf}: ${fmt(v)}</title></rect><text x="${x + W / 2}" y="${y + (v > 0 ? 11 : 15)}" font-size="8" font-weight="700" fill="${t > .45 ? "#fff" : "#1e3a8a"}" text-anchor="middle" font-family="IBM Plex Sans, sans-serif">${uf}</text>`;
    if (v > 0) svg += `<text x="${x + W / 2}" y="${y + 20}" font-size="7" fill="${t > .45 ? "rgba(255,255,255,.85)" : "#4b5670"}" text-anchor="middle" font-family="IBM Plex Sans, sans-serif">${short(v)}</text>`; }));
  svg += "</svg>";
  const com = UFS.filter((u) => em[u].vencido > 0 || em[u].empenhado > 0).sort((a, b) => em[b].vencido - em[a].vencido);
  ultimo.estados = com.map((u) => ({ UF: u, "Propostas vencidas": em[u].n, "Valor Vencido": em[u].vencido, "Valor Empenhado": em[u].empenhado }));
  body.innerHTML = `<div class="grid grid-2" style="margin-bottom:16px">${card(`Mapa por estado (vencido) — ${d.rotulo}`, `<div class="mapa-br">${svg}</div>`)}${card("Ranking por estado", `<div class="chart-box lg"><canvas id="c-uf"></canvas></div>`)}</div>
    ${card("Detalhamento", tabela(["UF", "#Propostas vencidas", "#Valor vencido", "#Valor empenhado", "#Saldo"], com.map((u) => `<tr>${td(tag(u, "tag-purple"))}${td(em[u].n, 1)}${td(fmt(em[u].vencido), 1)}${td(fmt(em[u].empenhado), 1)}${td(fmt(em[u].vencido - em[u].empenhado), 1)}</tr>`)), btnExcel("xEstados"))}`;
  reg.chart("uf", "c-uf", { type: "bar", data: { labels: com, datasets: [{ label: "Vencido", data: com.map((u) => em[u].vencido), backgroundColor: "rgba(36,87,214,.8)", borderRadius: 3 }, { label: "Empenhado", data: com.map((u) => em[u].empenhado), backgroundColor: "#1b8a5a", borderRadius: 3 }] }, options: base({ plugins: { tooltip: tipMoeda }, scales: { y: { beginAtZero: true, ticks: { callback: short } }, x: { ticks: { autoSkip: false } } } }) });
}

// ---------- ATAs ----------
function relAtas(body, d) {
  const hoje = new Date(hojeIso() + "T00:00:00"); const ufs = [...new Set(store.get("orgaos").map((o) => o.estado).filter(Boolean))].sort();
  let data = d.atasF.map((a) => { const p = getProp(a.propostaId); const { l, o } = ctxProp(p); const val = propTotal(p), emp = d.emps.filter((e) => e.propostaId === a.propostaId).reduce((s, e) => s + (e.valorRecebido || 0), 0); const dias = a.vencimento ? Math.round((new Date(a.vencimento + "T00:00:00") - hoje) / 864e5) : null; return { a, p, l, o, val, emp, dias }; });
  if (fAtaUF) data = data.filter((r) => r.o.estado === fAtaUF);
  if (fAtaV) data = data.filter((r) => { if (r.dias === null) return false; if (fAtaV === "vencida") return r.dias < 0; if (fAtaV === "vigente") return r.dias >= 0; return r.dias >= 0 && r.dias <= +fAtaV; });
  data.sort((x, y) => (x.a.vencimento || "9999").localeCompare(y.a.vencimento || "9999"));
  const totVal = data.reduce((s, r) => s + r.val, 0), totEmp = data.reduce((s, r) => s + r.emp, 0), v30 = data.filter((r) => r.dias !== null && r.dias >= 0 && r.dias <= 30).length;
  const stTag = (r) => r.dias === null ? tag("Sem data", "tag-gray") : r.dias < 0 ? tag("Vencida", "tag-red") : tag(`${r.dias} dias`, r.dias <= 30 ? "tag-orange" : r.dias <= 60 ? "tag-amber" : "tag-green");
  ultimo.atas = data.map((r) => ({ "Nº ATA": r.a.numero, "Pregão/Nº": r.l.numero || "", UASG: r.o.uasg || "", Órgão: r.o.nome || "", UF: r.o.estado || "", Assinatura: fmtD(r.a.assinatura), Vencimento: fmtD(r.a.vencimento), "Valor ATA": r.val, Empenhado: r.emp, Saldo: r.val - r.emp, Situação: r.dias === null ? "Sem data" : r.dias < 0 ? "Vencida" : `${r.dias} dias` }));
  body.innerHTML = `
    <div class="card" style="margin-bottom:16px"><div class="chip-filters"><span class="muted">Vencimento:</span><select class="input input-sm" name="fAtaV">${[["", "Todas"], ["30", "Em 30 dias"], ["60", "Em 60 dias"], ["90", "Em 90 dias"], ["vencida", "Vencidas"], ["vigente", "Vigentes"]].map(([v, t]) => `<option value="${v}" ${fAtaV === v ? "selected" : ""}>${t}</option>`).join("")}</select>
      <span class="muted" style="margin-left:10px">Estado:</span><select class="input input-sm" name="fAtaUF"><option value="">Todos</option>${ufs.map((u) => `<option ${fAtaUF === u ? "selected" : ""}>${u}</option>`).join("")}</select><span style="flex:1"></span>${btnExcel("xAtas")}</div></div>
    <div class="grid grid-3" style="margin-bottom:16px">${kpi("ATAs (filtrado)", data.length)}${kpi("Valor total das ATAs", fmt(totVal))}${kpi("Total empenhado", fmt(totEmp), `${v30} vence(m) em 30 dias`, "var(--green)")}</div>
    <div class="card"><div class="card-body flush">${tabela(["Nº ATA", "Pregão", "UASG", "Órgão", "UF", "Assinatura", "Vencimento", "#Valor ATA", "#Empenhado", "#Saldo", "Situação"], data.map((r) => `<tr>${td(`<strong>${esc(r.a.numero)}</strong>`)}${td(esc(r.l.numero || "—"))}${td(esc(r.o.uasg || "—"))}${td(esc(toTitleCase(r.o.nome || "—")))}${td(esc(r.o.estado || "—"))}${td(fmtD(r.a.assinatura))}${td(fmtD(r.a.vencimento))}${td(fmt(r.val), 1)}${td(fmt(r.emp), 1)}${td(fmt(r.val - r.emp), 1)}${td(stTag(r))}</tr>`))}</div></div>`;
}

// ---------- Propostas ----------
function propostas(body, d) {
  const rows = d.propsF.slice().sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));
  ultimo.propostas = rows.map((p) => { const { l, o } = ctxProp(p); return { Nº: p.num || "", "Pregão/Nº": l.numero || "", Tipo: l.tipo || "", UASG: o.uasg || "", Órgão: o.nome || "", Portal: getPortal(l.portalId).sigla || "", Total: propTotal(p), Status: p.status || "Em Andamento", "Data licitação": fmtD(l.data), "Criada em": p.criadoEm ? fmtD(p.criadoEm.slice(0, 10)) : "" }; });
  body.innerHTML = `<div class="card"><div class="card-head"><h2>Propostas — ${d.rotulo} (${rows.length})</h2>${btnExcel("xPropostas")}</div><div class="card-body flush">${tabela(["Nº", "Pregão", "Tipo", "UASG", "Órgão", "#Total", "Status", "Data"], rows.map((p) => { const { l, o } = ctxProp(p); const st = p.status || "Em Andamento"; return `<tr>${td("#" + (p.num || "?"))}${td(`<strong>${esc(l.numero || "—")}</strong>`)}${td(esc(l.tipo || "—"))}${td(esc(o.uasg || "—"))}${td(esc(toTitleCase(o.nome || "—")))}${td(fmt(propTotal(p)), 1)}${td(tag(st, STATUS_CLASS[st] || "tag-gray"))}${td(fmtD(l.data))}</tr>`; }))}</div></div>`;
}

// ---------- Empenhos ----------
function empenhos(body, d) {
  const rows = d.empsF.slice().sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const linha = (e) => { const { p, l, o } = ctxEmp(e); const emp = e.adesaoId ? d.emps.filter((x) => x.adesaoId === e.adesaoId).reduce((s, x) => s + (x.valorRecebido || 0), 0) : propEmpenhado(p?.id); const ref = e.adesaoId ? (store.find("adesoes", e.adesaoId)?.valorTotal || 0) : propTotal(p); return { p, l, o, emp, ref, saldo: ref - emp }; };
  ultimo.empenhos = rows.map((e) => { const r = linha(e); return { "Nº Empenho": e.numero, Origem: e.adesaoId ? "Adesão" : "Proposta", "Pregão/Nº": r.l?.numero || "", UASG: r.o.uasg || "", Órgão: r.o.nome || "", Portal: getPortal(r.l?.portalId).sigla || "", Data: fmtD(e.data), Valor: e.valorRecebido || 0, "Total empenhado": r.emp, Saldo: r.saldo }; });
  const tot = rows.reduce((s, e) => s + (e.valorRecebido || 0), 0);
  body.innerHTML = `<div class="card"><div class="card-head"><h2>Empenhos — ${d.rotulo} (${rows.length})</h2>${btnExcel("xEmpenhos")}</div><div class="card-body flush">${tabela(["Nº empenho", "Pregão", "UASG", "Órgão", "Portal", "Data", "#Valor", "#Total empenhado", "#Saldo"], rows.map((e) => { const r = linha(e); return `<tr>${td(`<strong>${esc(e.numero)}</strong>${e.adesaoId ? " " + tag("Adesão", "tag-purple") : ""}`)}${td(esc(r.l?.numero || "—"))}${td(esc(r.o.uasg || "—"))}${td(esc(toTitleCase(r.o.nome || "—")))}${td(esc(getPortal(r.l?.portalId).sigla || "—"))}${td(fmtD(e.data))}${td(fmt(e.valorRecebido), 1)}${td(fmt(r.emp), 1)}${td(fmt(r.saldo), 1)}</tr>`; }), `<tr class="tbl-total"><td colspan="6">Total</td>${td(fmt(tot), 1)}<td></td><td></td></tr>`)}</div></div>`;
}

const acoes = {
  xFunil: () => exportarExcel(ultimo.funil, "Funil", "funil"), xVsemp: () => exportarExcel(ultimo.vsemp, "VencidoXEmpenhado", "vencido_vs_empenhado"), xPortais: () => exportarExcel(ultimo.portais, "Portais", "por_portal"),
  xOrgaos: () => exportarExcel(ultimo.orgaos, "Órgãos", "por_orgao"), xEstados: () => exportarExcel(ultimo.estados, "Estados", "por_estado"), xAtas: () => exportarExcel(ultimo.atas, "ATAs", "relatorio_atas"),
  xPropostas: () => exportarExcel(ultimo.propostas, "Propostas", "relatorio_propostas"), xEmpenhos: () => exportarExcel(ultimo.empenhos, "Empenhos", "relatorio_empenhos"),
};

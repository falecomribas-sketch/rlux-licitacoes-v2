// Dashboard — visão geral. Cálculos portados da versão atual (renderDash).
// Inclui o bloco "Análise profissional" (Fase 6) e os contatos pendentes da régua (Fase 5).
import { store } from "../core/store.js?v=20261113-153534";
import { $, $$, fmt, fmtD, esc, raw, h, MESES_CURTOS, toTitleCase } from "../core/utils.js?v=20261113-153534";
import { icon, vazio, tag } from "../core/ui.js?v=20261113-153534";
import { registro, base, short, CORES as COR_PORTAIS, COR_STATUS, tipMoeda } from "../core/charts.js?v=20261113-153534";
import { navigate } from "../core/router.js?v=20261113-153534";
import { iniciarRegua, onRegua, pendentesHoje, situacaoRegua, TIPO_ROTULO } from "../core/regua.js?v=20261113-153534";
import { verEmail } from "./reguas.js?v=20261113-153534";
import {
  getLicit, getOrgao, getProp, getCat, isEspelho, isVencido, propTotal, STATUS_VENCIDO,
} from "../core/domain.js?v=20261113-153534";

const reg = registro();
let unsub = null, unsubRegua = null;
let anoSel = null;      // null = ainda não escolhido; "todos" | "2026"
let filtroStatus = "";


export default {
  id: "dashboard", titulo: "Dashboard", grupo: "Principal", icone: "dashboard",

  render(el) {
    el.innerHTML = `
      <div class="dash-toolbar">
        <label class="field field-inline"><span>Ano</span><select id="dash-ano"></select></label>
      </div>
      <div class="grid grid-6" id="dash-kpis"></div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h2>Contatos comerciais pendentes <span id="dash-regua-badge" class="tag tag-red" hidden></span></h2><button class="btn btn-ghost btn-sm" data-act="regua-todos">Ver régua completa</button></div><div class="card-body" id="dash-regua"></div></div>
      <div class="grid grid-2" style="margin-top:16px">
        <div class="card"><div class="card-head"><h2>Licitações por mês</h2></div><div class="card-body"><div class="chart-box"><canvas id="c-licit"></canvas></div></div></div>
        <div class="card"><div class="card-head"><h2>Resultado das propostas (R$)</h2>
          <select class="input input-sm" id="dash-status">
            <option value="">Todos os status</option>
            ${["Vencida", "Perdida", "Em Andamento", "Faturado Total", "Faturado Parcial"].map((s) => `<option>${s}</option>`).join("")}
          </select></div>
          <div class="card-body"><div class="chart-box"><canvas id="c-result"></canvas></div></div></div>
        <div class="card"><div class="card-head"><h2>Empenhos por mês</h2></div><div class="card-body"><div class="chart-box"><canvas id="c-emp"></canvas></div></div></div>
        <div class="card"><div class="card-head"><h2>Empenhos por estado (R$)</h2></div><div class="card-body"><div class="chart-box"><canvas id="c-estado"></canvas></div></div></div>
      </div>
      <div class="grid grid-3">
        <div class="card"><div class="card-head"><h2>Funil de conversão</h2></div><div class="card-body" id="dash-funil"></div></div>
        <div class="card"><div class="card-head"><h2>ATAs vencendo em 30 dias</h2></div><div class="card-body" id="dash-atas"></div></div>
        <div class="card"><div class="card-head"><h2>CRM — pendências</h2></div><div class="card-body" id="dash-crm"></div></div>
      </div>
      <div class="section-title">Análise profissional</div>
      <div class="grid grid-2">
        <div class="card"><div class="card-head"><h2>Vencido vs empenhado (acumulado)</h2></div><div class="card-body"><div class="chart-box"><canvas id="c-acum"></canvas></div></div></div>
        <div class="card"><div class="card-head"><h2>Receita vs custo por mês</h2></div><div class="card-body"><div class="chart-box"><canvas id="c-reccusto"></canvas></div></div></div>
      </div>
      <div class="grid grid-3">
        <div class="card"><div class="card-head"><h2>Margem por portal</h2></div><div class="card-body"><div class="chart-box sm"><canvas id="c-margem"></canvas></div></div></div>
        <div class="card"><div class="card-head"><h2>Mix de receita por categoria</h2></div><div class="card-body"><div class="chart-box sm"><canvas id="c-mix"></canvas></div></div></div>
        <div class="card"><div class="card-head"><h2>Win rate por modalidade</h2></div><div class="card-body" id="dash-winrate"></div></div>
      </div>
      <div class="grid grid-3">
        <div class="card"><div class="card-head"><h2>Sazonalidade das licitações</h2></div><div class="card-body" id="dash-saz"></div></div>
        <div class="card"><div class="card-head"><h2>Tempo médio por etapa</h2></div><div class="card-body" id="dash-ciclo"></div></div>
        <div class="card"><div class="card-head"><h2>Órgãos recorrentes</h2></div><div class="card-body flush" id="dash-recorr"></div></div>
      </div>
      <div class="grid grid-3">
        <div class="card"><div class="card-head"><h2>Top produtos vendidos</h2></div><div class="card-body flush" id="dash-topprod"></div></div>
        <div class="card"><div class="card-head"><h2>Atividades recentes</h2></div><div class="card-body" id="dash-ativ"></div></div>
        <div class="card"><div class="card-head"><h2>Órgãos que mais empenham</h2></div><div class="card-body flush" id="dash-top-org"></div></div>
      </div>`;

    $("#dash-ano").addEventListener("change", (e) => { anoSel = e.target.value; update(); });
    $("#dash-status").addEventListener("change", (e) => { filtroStatus = e.target.value; update(); });

    iniciarRegua();
    el.addEventListener("click", (e) => { const b = e.target.closest("[data-act]"); if (!b) return;
      if (b.dataset.act === "regua-todos") navigate("reguas");
      if (b.dataset.act === "regua-ver") { const [origem, refId] = b.dataset.id.split(":"); const li = pendentesHoje().find((l) => l.origem === origem && l.refId === refId); if (li) verEmail(li); } });
    store.ready().then(update);
    unsub = store.on("*", debounceUpdate);
    unsubRegua = onRegua(debounceUpdate);
  },

  destroy() {
    unsub?.(); unsub = null; unsubRegua?.(); unsubRegua = null;
    reg.destroy();
  },
};

let t;
function debounceUpdate() { clearTimeout(t); t = setTimeout(update, 150); }

function update() {
  if (!$("#dash-kpis")) return;
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const props = store.get("propostas").filter((p) => !isEspelho(p));
  const lics = store.get("licitacoes");
  const atas = store.get("atas");
  const emps = store.get("empenhos");
  const crms = store.get("crm");
  const adesoes = store.get("adesoes");
  const portais = store.get("portais");

  // ----- seletor de ano -----
  const anos = new Set([anoAtual]);
  lics.forEach((l) => l.data && anos.add(+l.data.slice(0, 4)));
  props.forEach((p) => p.criadoEm && anos.add(+p.criadoEm.slice(0, 4)));
  emps.forEach((e) => e.data && anos.add(+e.data.slice(0, 4)));
  adesoes.forEach((a) => a.solicitacao && anos.add(+a.solicitacao.slice(0, 4)));
  const sel = $("#dash-ano");
  if (anoSel === null) anoSel = String(anoAtual);
  sel.innerHTML = `<option value="todos">Todos os anos</option>` +
    [...anos].sort((a, b) => b - a).map((a) => `<option value="${a}">${a}</option>`).join("");
  sel.value = anoSel;
  const ano = anoSel === "todos" ? null : +anoSel;
  const noAno = (iso) => !ano || (iso && +iso.slice(0, 4) === ano);

  // ----- filtros por ano (mesma lógica do legado) -----
  const licsF = lics.filter((l) => noAno(l.data));
  const propsF = props.filter((p) => noAno(getLicit(p.licitacaoId).data));
  const empsF = emps.filter((e) => noAno(e.data));
  const atasF = atas.filter((a) => a.propostaId && noAno(getLicit(getProp(a.propostaId)?.licitacaoId).data));
  const adesoesF = adesoes.filter((a) => a.status === "Aprovada" && noAno(a.solicitacao));
  const atasRenov = atas.filter((a) => a.ataOrigemId && a.propostaId && noAno(a.assinatura));

  const vend = propsF.filter((p) => isVencido(p));
  const totalVPregoes = vend.reduce((s, p) => s + propTotal(p), 0);
  const totalRenovado = atasRenov.reduce((s, a) => s + propTotal(getProp(a.propostaId)), 0);
  const totalV = totalVPregoes + totalRenovado;
  const totalAdesoes = adesoesF.reduce((s, a) => s + (a.valorTotal || 0), 0);
  const totalE = empsF.reduce((s, e) => s + (e.valorRecebido || 0), 0);
  const atas30 = atasF.filter((a) => { if (!a.vencimento) return false; const d = (new Date(a.vencimento) - hoje) / 864e5; return d >= 0 && d <= 30; });
  const crmPend = crms.filter((c) => ["Agendado", "Em Contato", "Em Negociação", "Em Renovação"].includes(c.status));

  // ----- KPIs -----
  $("#dash-kpis").innerHTML = `
    ${kpi("Licitações", licsF.length)}
    ${kpi("Total vencido", fmt(totalV), totalRenovado > 0 ? `inclui ${fmt(totalRenovado)} renovado` : "", "accent")}
    ${kpi("Valor renovado", fmt(totalRenovado), `${atasRenov.length} renovação(ões)`)}
    ${kpi("Adesões aprovadas", fmt(totalAdesoes), `${adesoesF.length} adesão(ões)`)}
    ${kpi("Total empenhado", fmt(totalE))}
    ${kpi("ATAs", atasF.length, atas30.length ? `${atas30.length} vence(m) em 30 dias` : "nenhuma vencendo", "", atas30.length > 0)}`;

  // ----- ATAs vencendo -----
  $("#dash-atas").innerHTML = atas30.length ? `<div class="list">${atas30
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento)).slice(0, 6).map((a) => {
      const p = getProp(a.propostaId); const l = getLicit(p?.licitacaoId); const o = getOrgao(l?.orgaoId);
      const dias = Math.round((new Date(a.vencimento) - hoje) / 864e5);
      return h`<div class="list-item"><div class="list-main"><div class="list-title">${a.numero}</div><div class="list-sub">${toTitleCase(o.nome || "—")} · vence ${fmtD(a.vencimento)}</div></div>${raw(tag(`${dias} dias`, dias <= 10 ? "tag-red" : "tag-amber"))}</div>`;
    }).join("")}</div>` : vazio("Nenhuma ATA vence nos próximos 30 dias");

  // ----- CRM pendências -----
  $("#dash-crm").innerHTML = crmPend.length ? `<div class="list">${crmPend.slice(0, 6).map((c) => {
    const p = getProp(c.propostaId); const l = getLicit(p?.licitacaoId); const o = getOrgao(l?.orgaoId);
    return h`<div class="list-item"><div class="list-main"><div class="list-title">${l?.numero || "—"}</div><div class="list-sub">${toTitleCase(o.nome || "—")}${c.proxCont ? " · próx. " + fmtD(c.proxCont) : ""}</div></div>${raw(tag(c.status, "tag-purple"))}</div>`;
  }).join("")}</div>` : vazio("Sem pendências no CRM");

  // ----- régua: contatos comerciais pendentes -----
  const pend = pendentesHoje().sort((a, b) => situacaoRegua(a).ord - situacaoRegua(b).ord || (a.proximo || "").localeCompare(b.proximo || ""));
  const badge = $("#dash-regua-badge"); badge.hidden = !pend.length; badge.textContent = `${pend.length} pendente${pend.length > 1 ? "s" : ""}`;
  $("#dash-regua").innerHTML = pend.length ? `<div class="list">${pend.slice(0, 8).map((li) => { const s = situacaoRegua(li);
    return h`<div class="list-item"><div class="list-main"><div class="list-title">${li.titulo}${li.origem === "adesao" ? " · Adesão" : ""} — ${toTitleCase(li.orgaoNome || li.orgao?.nome || "—")}</div><div class="list-sub">${TIPO_ROTULO[li.tipoProx]} · saldo ${fmt(li.saldo)}${li.vencIso ? " · vence " + fmtD(li.vencIso) : ""}${li.ultimo ? " · último envio " + fmtD(li.ultimo) : " · nunca contatado"}</div></div>${raw(tag(s.txt, s.cls))}<button class="btn btn-primary btn-sm" data-act="regua-ver" data-id="${li.origem + ":" + li.refId}">${raw(icon("mail"))} E-mail</button></div>`; }).join("")}</div>${pend.length > 8 ? `<p class="muted" style="font-size:12px;margin-top:8px">+ ${pend.length - 8} na régua completa</p>` : ""}` : vazio("Nenhum contato pendente", "Todos os relacionamentos estão em dia.");

  // ----- atividades recentes -----
  const acts = [];
  lics.slice(-3).forEach((l) => acts.push({ t: `Licitação ${l.numero}`, s: fmtD(l.data) }));
  props.slice(-3).forEach((p) => acts.push({ t: `Proposta #${p.num || "?"}`, s: p.status || "Em Andamento" }));
  $("#dash-ativ").innerHTML = acts.length ? `<div class="list">${acts.reverse().map((a) =>
    h`<div class="list-item"><div class="list-main"><div class="list-title">${a.t}</div><div class="list-sub">${a.s}</div></div></div>`).join("")}</div>` : vazio("Nada registrado ainda");

  // ----- top órgãos por empenho -----
  const orgMap = {};
  emps.forEach((e) => {
    const p = getProp(e.propostaId); const l = getLicit(p?.licitacaoId); const o = getOrgao(l?.orgaoId);
    if (!o.nome) return;
    (orgMap[o.id] ||= { nome: o.nome, uasg: o.uasg || "", total: 0, qtd: 0 });
    orgMap[o.id].total += e.valorRecebido || 0; orgMap[o.id].qtd++;
  });
  const top5 = Object.values(orgMap).sort((a, b) => b.total - a.total).slice(0, 5);
  $("#dash-top-org").innerHTML = top5.length ? `<div class="table-wrap"><table>
    <thead><tr><th>Órgão</th><th>UASG</th><th class="num">Empenhos</th><th class="num">Total</th></tr></thead>
    <tbody>${top5.map((o) => h`<tr><td><strong>${toTitleCase(o.nome).slice(0, 34)}</strong></td><td>${o.uasg || "—"}</td><td class="num">${o.qtd}</td><td class="num"><strong>${fmt(o.total)}</strong></td></tr>`).join("")}</tbody>
  </table></div>` : vazio("Sem empenhos registrados");

  // ----- funil -----
  const nLics = licsF.length, nProps = propsF.length;
  const nVenc = propsF.filter((p) => STATUS_VENCIDO.includes(p.status)).length;
  const nEmp = new Set(empsF.map((e) => e.propostaId)).size;
  const max = nLics || 1;
  const steps = [["Licitações", nLics, "#2457d6"], ["Propostas", nProps, "#6d3fc9"], ["Vencidas", nVenc, "#1b8a5a"], ["Empenhadas", nEmp, "#0f7f8c"]];
  const ticket = nVenc ? propsF.filter((p) => STATUS_VENCIDO.includes(p.status)).reduce((s, p) => s + propTotal(p), 0) / nVenc : 0;
  $("#dash-funil").innerHTML = steps.map(([lbl, v, cor]) => `
    <div class="funnel-row"><div class="lbl">${lbl}</div>
      <div class="bar"><div class="fill" style="width:${Math.round(v / max * 100)}%;background:${cor}">${v}</div></div>
      <div class="val">${Math.round(v / max * 100)}%</div></div>`).join("") +
    `<p class="muted" style="font-size:12.5px;margin-top:10px">Conversão: <strong>${nLics ? Math.round(nVenc / nLics * 100) : 0}%</strong> · Ticket médio vencido: <strong>${nVenc ? fmt(ticket) : "—"}</strong></p>`;

  // ----- gráficos -----
  const portDatasets = portais.map((pt, i) => {
    const d = Array(12).fill(0);
    licsF.filter((l) => l.portalId === pt.id).forEach((l) => { if (l.data) d[+l.data.slice(5, 7) - 1]++; });
    return { label: pt.sigla, data: d, backgroundColor: COR_PORTAIS[i % COR_PORTAIS.length], borderRadius: 3, stack: "l" };
  });
  const semPortal = Array(12).fill(0);
  licsF.filter((l) => !l.portalId).forEach((l) => { if (l.data) semPortal[+l.data.slice(5, 7) - 1]++; });
  if (semPortal.some((v) => v)) portDatasets.push({ label: "Sem portal", data: semPortal, backgroundColor: "#a9b3c7", borderRadius: 3, stack: "l" });
  reg.chart("licit", "c-licit", { type: "bar", data: { labels: MESES_CURTOS, datasets: portDatasets },
    options: base({ scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } } } }) });

  const filtered = filtroStatus ? propsF.filter((p) => p.status === filtroStatus) : propsF;
  const stGroups = {};
  filtered.forEach((p) => { const st = p.status || "Em Andamento"; stGroups[st] = (stGroups[st] || 0) + propTotal(p); });
  const stKeys = Object.keys(stGroups);
  reg.chart("result", "c-result", { type: "doughnut",
    data: { labels: stKeys, datasets: [{ data: stKeys.map((k) => stGroups[k]), backgroundColor: stKeys.map((k) => COR_STATUS[k] || "#a9b3c7"), borderWidth: 0 }] },
    options: base({ cutout: "62%", plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (i) => `${i.label}: ${fmt(i.raw)}` } } } }) });

  const empMes = Array(12).fill(0);
  empsF.forEach((e) => { if (e.data) empMes[+e.data.slice(5, 7) - 1] += e.valorRecebido || 0; });
  reg.chart("emp", "c-emp", { type: "bar", data: { labels: MESES_CURTOS, datasets: [{ label: "Empenhos", data: empMes, backgroundColor: "#1b8a5a", borderRadius: 4 }] },
    options: base({ plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => fmt(i.raw) } } }, scales: { y: { beginAtZero: true, ticks: { callback: short } } } }) });

  const estMap = {};
  empsF.forEach((e) => {
    const p = getProp(e.propostaId); const l = getLicit(p?.licitacaoId); const o = getOrgao(l?.orgaoId);
    const uf = o.estado || "Sem UF"; estMap[uf] = (estMap[uf] || 0) + (e.valorRecebido || 0);
  });
  const est = Object.entries(estMap).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 12);
  reg.chart("estado", "c-estado", { type: "bar", data: { labels: est.map(([k]) => k), datasets: [{ data: est.map(([, v]) => v), backgroundColor: "#2457d6", borderRadius: 4 }] },
    options: base({ indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => fmt(i.raw) } } }, scales: { x: { beginAtZero: true, ticks: { callback: short } }, y: { ticks: { autoSkip: false } } } }) });
  // ===== Análise profissional (portado do legado) =====
  const vencF = propsF.filter((p) => STATUS_VENCIDO.includes(p.status));
  const mesDe = (iso) => +iso.slice(5, 7) - 1;
  const vAc = Array(12).fill(0), eAc = Array(12).fill(0), aAc = Array(12).fill(0);
  vencF.forEach((p) => { const l = getLicit(p.licitacaoId); if (l.data) vAc[mesDe(l.data)] += propTotal(p); });
  atasRenov.forEach((a) => { const pe = getProp(a.propostaId); if (a.assinatura && pe) vAc[mesDe(a.assinatura)] += propTotal(pe); });
  empsF.forEach((e) => { if (e.data) eAc[mesDe(e.data)] += e.valorRecebido || 0; });
  adesoesF.forEach((a) => { if (a.solicitacao) aAc[mesDe(a.solicitacao)] += a.valorTotal || 0; });
  const acum = (arr) => { let t = 0; return arr.map((v) => (t += v)); };
  reg.chart("acum", "c-acum", { type: "line", data: { labels: MESES_CURTOS, datasets: [
    { label: "Vencido", data: acum(vAc), borderColor: "#2457d6", backgroundColor: "rgba(36,87,214,.08)", fill: true, tension: .4, borderWidth: 2 },
    { label: "Adesões", data: acum(aAc), borderColor: "#6d3fc9", backgroundColor: "rgba(109,63,201,.06)", fill: true, tension: .4, borderWidth: 2, borderDash: [5, 3] },
    { label: "Empenhado", data: acum(eAc), borderColor: "#1b8a5a", backgroundColor: "rgba(27,138,90,.08)", fill: true, tension: .4, borderWidth: 2 }] },
    options: base({ plugins: { tooltip: tipMoeda }, scales: { y: { beginAtZero: true, ticks: { callback: short } } } }) });

  const recMes = Array(12).fill(0), custoMes = Array(12).fill(0);
  vencF.forEach((p) => { const l = getLicit(p.licitacaoId); if (!l.data) return; const m = mesDe(l.data); recMes[m] += propTotal(p); custoMes[m] += (p.itens || []).reduce((s, i) => s + (i.custo || 0) * (i.qtd || 0), 0); });
  const margemMes = recMes.map((r, i) => custoMes[i] > 0 ? +((r - custoMes[i]) / custoMes[i] * 100).toFixed(1) : null);
  reg.chart("reccusto", "c-reccusto", { type: "bar", data: { labels: MESES_CURTOS, datasets: [
    { label: "Receita", data: recMes, backgroundColor: "rgba(36,87,214,.75)", borderRadius: 4, yAxisID: "y" },
    { label: "Custo", data: custoMes, backgroundColor: "rgba(200,54,43,.5)", borderRadius: 4, yAxisID: "y" },
    { label: "Margem %", data: margemMes, type: "line", borderColor: "#1b8a5a", borderWidth: 2, borderDash: [4, 3], pointRadius: 3, yAxisID: "y2", tension: .3 }] },
    options: base({ plugins: { tooltip: { callbacks: { label: (i) => i.dataset.yAxisID === "y2" ? `Margem: ${i.raw ?? "—"}%` : `${i.dataset.label}: ${fmt(i.raw)}` } } },
      scales: { y: { beginAtZero: true, ticks: { callback: short } }, y2: { position: "right", grid: { drawOnChartArea: false }, ticks: { callback: (v) => v + "%" } } } }) });

  const pm = {}; portais.forEach((pt) => { pm[pt.id] = { sigla: pt.sigla, receita: 0, custo: 0 }; });
  vencF.forEach((p) => { const l = getLicit(p.licitacaoId); if (!pm[l.portalId]) return; (p.itens || []).forEach((i) => { pm[l.portalId].receita += i.total || 0; pm[l.portalId].custo += (i.custo || 0) * (i.qtd || 0); }); });
  const pmK = Object.keys(pm).filter((k) => pm[k].receita > 0); const pmM = pmK.map((k) => pm[k].custo > 0 ? (pm[k].receita - pm[k].custo) / pm[k].custo * 100 : 0);
  reg.chart("margem", "c-margem", { type: "bar", data: { labels: pmK.map((k) => pm[k].sigla), datasets: [{ data: pmM, backgroundColor: pmM.map((v) => v >= 25 ? "#1b8a5a" : v >= 10 ? "#d9641c" : "#c8362b"), borderRadius: 5 }] },
    options: base({ plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => `Margem: ${i.raw.toFixed(1)}%` } } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => v + "%" } } } }) });

  const prods = store.get("produtos"); const catMap = {};
  vencF.forEach((p) => (p.itens || []).forEach((i) => { const prod = prods.find((x) => x.id === i.produtoId); const cat = prod ? getCat(prod.catId) : {}; const k = cat.nome || "Sem categoria"; (catMap[k] ||= { val: 0, cor: cat.cor || "#a9b3c7" }).val += i.total || 0; }));
  const catK = Object.keys(catMap).sort((a, b) => catMap[b].val - catMap[a].val);
  reg.chart("mix", "c-mix", { type: "doughnut", data: { labels: catK, datasets: [{ data: catK.map((k) => catMap[k].val), backgroundColor: catK.map((k) => catMap[k].cor), borderWidth: 0 }] },
    options: base({ cutout: "60%", plugins: { legend: { position: "bottom", labels: { font: { size: 10 }, boxWidth: 10 } }, tooltip: tipMoeda } }) });

  const tipoMap = {};
  licsF.forEach((l) => { const t = l.tipo || "Outros"; (tipoMap[t] ||= { total: 0, venc: 0 }).total++; if (props.some((p) => p.licitacaoId === l.id && STATUS_VENCIDO.includes(p.status))) tipoMap[t].venc++; });
  const tipoK = Object.keys(tipoMap).sort((a, b) => tipoMap[b].total - tipoMap[a].total);
  $("#dash-winrate").innerHTML = tipoK.length ? tipoK.map((t) => { const wr = Math.round(tipoMap[t].venc / tipoMap[t].total * 100); const cor = wr >= 50 ? "var(--green)" : wr >= 25 ? "var(--orange)" : "var(--red)";
    return h`<div class="bar-row"><div class="bar-head"><span>${t}</span><strong style="color:${raw(cor)}">${wr}% <small class="muted">(${tipoMap[t].venc}/${tipoMap[t].total})</small></strong></div><div class="prog"><div class="prog-fill" style="width:${wr}%;background:${raw(cor)}"></div></div></div>`; }).join("") : vazio("Sem licitações no período");

  const saz = Array(12).fill(0); licsF.forEach((l) => { if (l.data) saz[mesDe(l.data)]++; }); const sazMax = Math.max(...saz, 1);
  const sazCor = ["#eef1f6", "#dbe6fb", "#b9cdf6", "#8cadef", "#4a7be0", "#1e3a8a"];
  $("#dash-saz").innerHTML = `<div class="heat-grid">${MESES_CURTOS.map((m, i) => { const k = Math.min(Math.floor(saz[i] / sazMax * 5), 5); return `<div class="heat-cell" style="background:${sazCor[k]};color:${k >= 3 ? "#fff" : "var(--navy-2)"}"><small>${m}</small><strong>${saz[i]}</strong></div>`; }).join("")}</div><p class="muted" style="font-size:11.5px;margin-top:8px">Cor mais escura = mais licitações no mês</p>`;

  const dd = (a, b) => Math.round((new Date(b.slice(0, 10)) - new Date(a.slice(0, 10))) / 864e5); const okd = (d) => d >= 0 && d < 365;
  const t1 = [], t2 = [], t3 = [];
  propsF.forEach((p) => { const l = getLicit(p.licitacaoId); if (l.data && p.criadoEm) { const d = dd(l.data, p.criadoEm); if (okd(d)) t1.push(d); } });
  atas.forEach((a) => { const p = getProp(a.propostaId); if (p?.criadoEm && a.assinatura) { const d = dd(p.criadoEm, a.assinatura); if (okd(d)) t2.push(d); }
    emps.filter((e) => e.propostaId === a.propostaId).forEach((e) => { if (a.assinatura && e.data) { const d = dd(a.assinatura, e.data); if (okd(d)) t3.push(d); } }); });
  const avg = (arr) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;
  const etapas = [["Licitação → Proposta", avg(t1), "#2457d6"], ["Proposta → ATA", avg(t2), "#6d3fc9"], ["ATA → Empenho", avg(t3), "#1b8a5a"]];
  const ciclo = etapas.reduce((s, e) => s + (e[1] || 0), 0);
  $("#dash-ciclo").innerHTML = `<div class="list">${etapas.map(([l, d, c]) => `<div class="list-item"><div class="list-main"><div class="list-title">${l}</div></div><strong style="color:${c}">${d != null ? d + (d === 1 ? " dia" : " dias") : "—"}</strong></div>`).join("")}</div>${ciclo ? `<p class="muted" style="font-size:12.5px;margin-top:10px">Ciclo total médio: <strong>${ciclo} dias</strong></p>` : ""}`;

  const orgRec = {}; licsF.forEach((l) => { const o = getOrgao(l.orgaoId); if (!o.id) return; (orgRec[o.id] ||= { nome: o.nome, uasg: o.uasg, n: 0 }).n++; });
  const recs = Object.values(orgRec).filter((o) => o.n > 1).sort((a, b) => b.n - a.n).slice(0, 6);
  $("#dash-recorr").innerHTML = recs.length ? `<div class="table-wrap"><table><thead><tr><th>Órgão</th><th class="num">Licitações</th></tr></thead><tbody>${recs.map((o) => h`<tr><td><strong>${toTitleCase(o.nome).slice(0, 34)}</strong><div class="muted" style="font-size:11px">UASG ${o.uasg || "—"}</div></td><td class="num">${raw(tag(o.n + "×", "tag-blue"))}</td></tr>`).join("")}</tbody></table></div>` : vazio("Sem órgãos recorrentes ainda");

  const pv = {}; vencF.forEach((p) => (p.itens || []).forEach((i) => { const k = i.produtoId || i.codigo || i.nome; const r = (pv[k] ||= { nome: i.nome, codigo: i.codigo, qtd: 0, receita: 0, n: 0 }); r.qtd += i.qtd || 0; r.receita += i.total || 0; r.n++; }));
  const topP = Object.values(pv).sort((a, b) => b.receita - a.receita).slice(0, 6);
  $("#dash-topprod").innerHTML = topP.length ? `<div class="table-wrap"><table><thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Receita</th></tr></thead><tbody>${topP.map((x) => h`<tr><td><strong>${(x.nome || "").slice(0, 30)}</strong><div class="muted" style="font-size:11px">${x.codigo || ""} · ${x.n} proposta${x.n > 1 ? "s" : ""}</div></td><td class="num">${x.qtd.toLocaleString("pt-BR")}</td><td class="num"><strong style="color:var(--green)">${fmt(x.receita)}</strong></td></tr>`).join("")}</tbody></table></div>` : vazio("Sem produtos vendidos no período");
}

function kpi(label, value, note = "", cls = "", warn = false) {
  return `<div class="kpi ${cls}"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(value)}</div>${note ? `<div class="kpi-note ${warn ? "warn" : ""}">${esc(note)}</div>` : ""}</div>`;
}





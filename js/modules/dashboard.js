// Dashboard — visão geral. Cálculos portados da versão atual (renderDash).
// Os blocos "Análise profissional" e "Régua de relacionamento" entram com
// seus módulos (Fases 5 e 6).
import { store } from "../core/store.js";
import { $, $$, fmt, fmtD, esc, raw, h, MESES_CURTOS, toTitleCase } from "../core/utils.js";
import { icon, vazio, tag } from "../core/ui.js";
import { navigate } from "../core/router.js";
import { iniciarRegua, onRegua, pendentesHoje, situacaoRegua, TIPO_ROTULO } from "../core/regua.js";
import { verEmail } from "./reguas.js";
import {
  getLicit, getOrgao, getProp, isEspelho, isVencido, propTotal, STATUS_VENCIDO,
} from "../core/domain.js";

let charts = {};
let unsub = null, unsubRegua = null;
let anoSel = null;      // null = ainda não escolhido; "todos" | "2026"
let filtroStatus = "";

const COR_PORTAIS = ["#2457d6", "#1b8a5a", "#d9641c", "#6d3fc9", "#c8362b", "#0f7f8c"];
const COR_STATUS = {
  "Vencida": "#1b8a5a", "Perdida": "#c8362b", "Em Andamento": "#2457d6", "Faturado Total": "#0f7f8c",
  "Faturado Parcial": "#d9641c", "Ag. Solic. Docs": "#b58200", "Enviei Docs": "#6d3fc9",
};

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
      <div class="grid grid-2">
        <div class="card"><div class="card-head"><h2>Funil de conversão</h2></div><div class="card-body" id="dash-funil"></div></div>
        <div class="card"><div class="card-head"><h2>ATAs vencendo em 30 dias</h2></div><div class="card-body" id="dash-atas"></div></div>
      </div>
      <div class="grid grid-3">
        <div class="card"><div class="card-head"><h2>Atividades recentes</h2></div><div class="card-body" id="dash-ativ"></div></div>
        <div class="card"><div class="card-head"><h2>Órgãos que mais empenham</h2></div><div class="card-body flush" id="dash-top-org"></div></div>
        <div class="card"><div class="card-head"><h2>CRM — pendências</h2></div><div class="card-body" id="dash-crm"></div></div>
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
    Object.values(charts).forEach((c) => c.destroy());
    charts = {};
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
  chart("licit", "c-licit", { type: "bar", data: { labels: MESES_CURTOS, datasets: portDatasets },
    options: base({ scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } } } }) });

  const filtered = filtroStatus ? propsF.filter((p) => p.status === filtroStatus) : propsF;
  const stGroups = {};
  filtered.forEach((p) => { const st = p.status || "Em Andamento"; stGroups[st] = (stGroups[st] || 0) + propTotal(p); });
  const stKeys = Object.keys(stGroups);
  chart("result", "c-result", { type: "doughnut",
    data: { labels: stKeys, datasets: [{ data: stKeys.map((k) => stGroups[k]), backgroundColor: stKeys.map((k) => COR_STATUS[k] || "#a9b3c7"), borderWidth: 0 }] },
    options: base({ cutout: "62%", plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (i) => `${i.label}: ${fmt(i.raw)}` } } } }) });

  const empMes = Array(12).fill(0);
  empsF.forEach((e) => { if (e.data) empMes[+e.data.slice(5, 7) - 1] += e.valorRecebido || 0; });
  chart("emp", "c-emp", { type: "bar", data: { labels: MESES_CURTOS, datasets: [{ label: "Empenhos", data: empMes, backgroundColor: "#1b8a5a", borderRadius: 4 }] },
    options: base({ plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => fmt(i.raw) } } }, scales: { y: { beginAtZero: true, ticks: { callback: short } } } }) });

  const estMap = {};
  empsF.forEach((e) => {
    const p = getProp(e.propostaId); const l = getLicit(p?.licitacaoId); const o = getOrgao(l?.orgaoId);
    const uf = o.estado || "Sem UF"; estMap[uf] = (estMap[uf] || 0) + (e.valorRecebido || 0);
  });
  const est = Object.entries(estMap).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 12);
  chart("estado", "c-estado", { type: "bar", data: { labels: est.map(([k]) => k), datasets: [{ data: est.map(([, v]) => v), backgroundColor: "#2457d6", borderRadius: 4 }] },
    options: base({ indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => fmt(i.raw) } } }, scales: { x: { beginAtZero: true, ticks: { callback: short } }, y: { ticks: { autoSkip: false } } } }) });
}

function kpi(label, value, note = "", cls = "", warn = false) {
  return `<div class="kpi ${cls}"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(value)}</div>${note ? `<div class="kpi-note ${warn ? "warn" : ""}">${esc(note)}</div>` : ""}</div>`;
}

const short = (v) => v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? Math.round(v / 1e3) + "k" : v;

function base(extra = {}) {
  const o = { responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: "top", labels: { font: { size: 11, family: "IBM Plex Sans" }, boxWidth: 10 } } },
    scales: {} };
  return deepMerge(o, extra);
}
function deepMerge(a, b) {
  for (const k of Object.keys(b)) a[k] = b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) ? deepMerge(a[k] || {}, b[k]) : b[k];
  return a;
}

// Atualiza um gráfico existente em vez de recriar (sem piscar)
function chart(key, canvasId, cfg) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (charts[key] && charts[key].canvas === canvas) {
    charts[key].data = cfg.data; charts[key].options = cfg.options; charts[key].update("none");
  } else {
    charts[key]?.destroy();
    charts[key] = new Chart(canvas.getContext("2d"), cfg);
  }
}

Chart.defaults.font.family = "IBM Plex Sans";
Chart.defaults.color = "#4b5670";

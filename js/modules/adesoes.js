// Adesões de ATA ("carona"). Limites do art. 86 da Lei 14.133/2021:
// 50% da quantidade da ATA por órgão aderente e 200% somando todos os aderentes.
import { store, newId } from "../core/store.js?v=20261113-235511";
import { dataTable, acoes, btnEditar, btnExcluir, onAction } from "../core/table.js?v=20261113-235511";
import { formModal, lerForm, campo, inputTxt, inputData, select, textarea, linha, exportarExcel } from "../core/forms.js?v=20261113-235511";
import { toast, confirmar, closeModal, icon, tag } from "../core/ui.js?v=20261113-235511";
import { esc, h, raw, fmt, fmtD, fmtNum, toTitleCase, diasAte } from "../core/utils.js?v=20261113-235511";
import { podeEditar } from "../core/auth.js?v=20261113-235511";
import { getLicit, getOrgao, getProp, getAta } from "../core/domain.js?v=20261113-235511";
import { ssel } from "../core/ssel.js?v=20261113-235511";
import { opcoesOrgaos } from "./licitacoes.js?v=20261113-235511";
import { gerarTermoAceite } from "../pdf/adesao.js?v=20261113-235511";

export const STATUS_ADESAO = ["Em Análise", "Aprovada", "Negada", "Cancelada"];
const COR_ST = { Aprovada: "tag-green", "Em Análise": "tag-amber", Negada: "tag-red", Cancelada: "tag-gray" };
let unsub = null, stFiltro = "";

// Quantidades já aderidas de um item da ATA (excluindo a adesão em edição)
function jaAderido(ataId, item, idx, orgaoId, excluirId) {
  const ads = store.get("adesoes").filter((a) => a.ataId === ataId && a.id !== excluirId && !["Negada", "Cancelada"].includes(a.status));
  let porOrgao = 0, total = 0;
  for (const a of ads) {
    const ai = (a.itens || []).find((x) => x.num === (item.num || idx + 1) || x.nome === item.nome);
    const q = ai?.qtdAdesao || 0; total += q;
    if (orgaoId && a.orgaoId === orgaoId) porOrgao += q;
  }
  return { porOrgao, total };
}
export function limitesItem(ataId, item, idx, orgaoId, excluirId) {
  const qtdAta = item.qtd || 0;
  const limiteIndividual = Math.floor(qtdAta * 50) / 100, limiteColetivo = Math.floor(qtdAta * 200) / 100;
  const { porOrgao, total } = jaAderido(ataId, item, idx, orgaoId, excluirId);
  const dispInd = Math.max(0, Math.round((limiteIndividual - porOrgao) * 100) / 100), dispCol = Math.max(0, Math.round((limiteColetivo - total) * 100) / 100);
  const disponivel = Math.min(dispInd, dispCol);
  return { qtdAta, limiteIndividual, limiteColetivo, porOrgao, total, disponivel, motivo: disponivel <= 0 ? (dispCol <= dispInd ? "coletivo" : "individual") : null };
}

const opcoesAtas = () => store.get("atas").filter((a) => a.permiteAdesao === "sim" && (!a.vencimento || diasAte(a.vencimento) >= 0)).map((a) => {
  const p = getProp(a.propostaId), l = getLicit(p?.licitacaoId), o = getOrgao(l?.orgaoId);
  return { id: a.id, label: `${a.numero} — ${toTitleCase(o.nome || "?")}`, sub: `Pregão ${l?.numero || "?"} · UASG ${o.uasg || "?"} · vence ${fmtD(a.vencimento)}`, extra: o.cnpj };
});

export default {
  id: "adesoes", titulo: "Adesão de ATA", grupo: "Pós-licitação", icone: "handshake",

  render(el) {
    el.innerHTML = `
      <div class="grid grid-4" id="kpis" style="margin-bottom:16px"></div>
      <div class="page-head"><h2>Adesões de ATA</h2>
        <div class="actions"><button class="btn btn-ghost" data-act="excel">${icon("download")} Excel</button>
          ${podeEditar() ? `<button class="btn btn-primary" data-act="novo">${icon("plus")} Nova adesão</button>` : ""}</div></div>
      <div class="card"><div class="chip-filters"><span class="muted">Status:</span>
        <button class="chip ${!stFiltro ? "active" : ""}" data-act="st" data-id="">Todas</button>
        ${STATUS_ADESAO.map((s) => `<button class="chip ${stFiltro === s ? "active" : ""}" data-act="st" data-id="${s}">${s}</button>`).join("")}</div>
        <div class="card-body flush" id="tbl"></div></div>`;

    const kpis = () => { const d = store.get("adesoes"); const ap = d.filter((a) => a.status === "Aprovada");
      el.querySelector("#kpis").innerHTML = `
        <div class="kpi"><div class="kpi-label">Adesões</div><div class="kpi-value">${d.length}</div></div>
        <div class="kpi"><div class="kpi-label">Aprovadas</div><div class="kpi-value" style="color:var(--green)">${ap.length}</div></div>
        <div class="kpi"><div class="kpi-label">Em análise</div><div class="kpi-value" style="color:var(--amber-txt)">${d.filter((a) => a.status === "Em Análise").length}</div></div>
        <div class="kpi"><div class="kpi-label">Valor aprovado</div><div class="kpi-value">${fmt(ap.reduce((s, a) => s + (a.valorTotal || 0), 0))}</div></div>`; };

    const tabela = dataTable({
      el: el.querySelector("#tbl"), rows: () => store.get("adesoes").filter((a) => !stFiltro || a.status === stFiltro),
      search: (a, q) => { const ata = getAta(a.ataId); const l = getLicit(getProp(ata?.propostaId)?.licitacaoId); return [a.numero, ata?.numero, a.orgaoAderente, a.uasgAderente, a.cnpjAderente, l?.numero].some((x) => (x || "").toLowerCase().includes(q)); },
      placeholder: "Buscar nº adesão, ATA, órgão aderente, UASG…", sort: { key: "solicitacao", dir: "desc" }, empty: "Nenhuma adesão cadastrada",
      columns: [
        { key: "numero", label: "Nº adesão", render: (a) => tag(a.numero || "—", "tag-blue") },
        { key: "ata", label: "ATA origem", sort: (a) => getAta(a.ataId)?.numero || "", render: (a) => { const ata = getAta(a.ataId); const l = getLicit(getProp(ata?.propostaId)?.licitacaoId); return `<strong style="color:var(--purple)">${esc(ata?.numero || "—")}</strong><div class="muted" style="font-size:11px">${esc(l?.numero || "")}</div>`; } },
        { key: "orgaoAderente", label: "Órgão aderente", render: (a) => `<strong>${esc(toTitleCase(a.orgaoAderente || "—"))}</strong><div class="muted" style="font-size:11px">${esc(a.municipioAderente || "")}</div>` },
        { key: "uasgAderente", label: "UASG", render: (a) => esc(a.uasgAderente || "—") },
        { key: "solicitacao", label: "Solicitação", render: (a) => fmtD(a.solicitacao) },
        { key: "aprovacao", label: "Aprovação", render: (a) => a.aprovacao ? fmtD(a.aprovacao) : '<span class="muted">—</span>' },
        { key: "vencimento", label: "Vencimento", render: (a) => { if (!a.vencimento) return '<span class="muted">—</span>'; const d = diasAte(a.vencimento); return tag(d < 0 ? "Vencida" : d <= 30 ? `${d} dias` : fmtD(a.vencimento), d < 0 ? "tag-red" : d <= 30 ? "tag-orange" : "tag-green"); } },
        { key: "valorTotal", label: "Valor", num: true, sort: (a) => a.valorTotal || 0, render: (a) => `<strong>${fmt(a.valorTotal)}</strong>` },
        { key: "status", label: "Status", render: (a) => tag(a.status || "—", COR_ST[a.status] || "tag-gray") },
        { key: "acoes", label: "", sort: false, width: "120px", render: (a) => acoes(`<button class="icon-btn sm" data-act="termo" data-id="${esc(a.id)}" title="Termo de aceite (PDF)" style="color:var(--purple)">${icon("print")}</button>`, ...(podeEditar() ? [btnEditar(a.id), btnExcluir(a.id, store.get("empenhos").some((e) => e.adesaoId === a.id) ? "Tem empenhos vinculados" : "")] : [])) },
      ],
    });

    onAction(el, {
      st: (id) => { stFiltro = id; el.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.id === id)); tabela.refresh(); },
      novo: () => abrirForm(), editar: (id) => abrirForm(store.find("adesoes", id)),
      termo: (id) => gerarTermoAceite(store.find("adesoes", id)),
      excluir: async (id) => { if (!await confirmar("Excluir esta adesão?", { ok: "Excluir", perigo: true })) return; await store.remove("adesoes", id); toast("Adesão excluída."); },
      excel: () => exportarExcel(store.get("adesoes").map((a) => { const ata = getAta(a.ataId); const p = getProp(ata?.propostaId); const l = getLicit(p?.licitacaoId); const o = getOrgao(l?.orgaoId);
        return { "Nº Adesão": a.numero, ATA: ata?.numero || "", Pregão: l?.numero || "", "Órgão gerenciador": o.nome || "", "Órgão aderente": a.orgaoAderente, "UASG aderente": a.uasgAderente, CNPJ: a.cnpjAderente, Município: a.municipioAderente, Responsável: a.responsavel, "E-mail": a.email, Processo: a.processo, Solicitação: fmtD(a.solicitacao), Aprovação: a.aprovacao ? fmtD(a.aprovacao) : "", Vencimento: a.vencimento ? fmtD(a.vencimento) : "", "Valor total": a.valorTotal || 0, Status: a.status, Observações: a.obs || "" }; }), "Adesões", "adesoes"),
    });
    kpis(); unsub = store.on("*", () => { kpis(); tabela.refresh(); });
  },
  destroy() { unsub?.(); stFiltro = ""; },
};

function abrirForm(a = null) {
  let ataSel, orgSel;
  const prevSel = {}; (a?.itens || []).forEach((it) => { prevSel[it.num] = it.qtdAdesao; });
  formModal({
    titulo: a ? `Editar adesão ${a.numero}` : "Nova adesão de ATA", largura: "xl",
    extra: a ? `<button type="button" class="btn btn-ghost" data-termo>${icon("print")} Termo de aceite</button>` : "",
    corpo: `
      <div class="form-section">ATA de origem (gerenciadora)</div>
      ${linha(`<div class="field"><span>ATA</span><div id="ata-ssel"></div><span class="help">Só aparecem ATAs vigentes que permitem adesão.</span></div>`, campo("Nº da adesão", inputTxt("numero", a?.numero || "", 'required placeholder="ADESAO-001/2026"')))}
      <div id="ata-info" class="info-box" hidden></div>
      <div class="form-section" style="color:var(--green)">Órgão aderente (solicitante)</div>
      ${linha(`<div class="field"><span>Órgão aderente</span><div id="org-ssel"></div><span class="help">Precisa estar cadastrado em Órgãos. O limite individual de 50% é calculado por órgão.</span></div>`)}
      <div id="org-info" class="info-box" hidden></div>
      <div class="form-section">Itens para adesão</div>
      <div id="itens" class="subcard" style="padding:0;overflow:hidden"><div class="empty">Selecione a ATA e o órgão aderente para carregar os itens</div></div>
      <div class="totais"><div class="total-geral"><span class="muted">Valor total da adesão</span><strong id="t-total">R$ 0,00</strong></div></div>
      <div class="form-section" style="color:var(--purple)">Processo e vigência</div>
      ${linha(campo("Nº processo SEI / interno", inputTxt("processo", a?.processo || "")), campo("Data da solicitação", inputData("solicitacao", a?.solicitacao || "")), campo("Data de aprovação", inputData("aprovacao", a?.aprovacao || "")))}
      ${linha(campo("Status", select("status", STATUS_ADESAO, a?.status || "Em Análise")), campo("Vencimento da adesão", `<input type="date" name="vencimento" value="${esc(a?.vencimento || "")}" readonly style="background:var(--surface-2)">`))}
      ${linha(campo("Observações", textarea("obs", a?.obs || "")))}`,
    onAberto(form, m) {
      const orgInfo = (id) => { const o = getOrgao(id); const box = form.querySelector("#org-info"); box.hidden = !o.id; if (!o.id) return;
        const c = (o.contatos || []).find((x) => x.nome || x.email) || {};
        box.innerHTML = `<div><div class="k">Nome</div>${esc(toTitleCase(o.nome))}</div><div><div class="k">UASG / CNPJ</div>${esc(o.uasg || "—")} · ${esc(o.cnpj || "—")}</div><div><div class="k">Município</div>${esc(o.municipio || "—")}${o.estado ? "/" + esc(o.estado) : ""}</div><div><div class="k">Responsável</div>${esc(c.nome || "—")} ${c.email ? "· " + esc(c.email) : ""}</div>`; };
      const render = () => renderItens(form, ataSel.value, orgSel.value, a?.id, prevSel);
      ataSel = ssel(form.querySelector("#ata-ssel"), { placeholder: "Nº da ATA, órgão, pregão, UASG ou CNPJ…", itens: opcoesAtas(), value: a?.ataId || "", onSelect: (id) => {
        const ata = getAta(id); const box = form.querySelector("#ata-info"); box.hidden = !ata;
        if (ata) { const p = getProp(ata.propostaId), l = getLicit(p?.licitacaoId), o = getOrgao(l?.orgaoId); form.vencimento.value = ata.vencimento || "";
          box.innerHTML = `<div><div class="k">ATA</div>${esc(ata.numero)}</div><div><div class="k">Órgão gerenciador</div>${esc(toTitleCase(o.nome || "—"))}</div><div><div class="k">Pregão</div>${esc(l?.numero || "—")}</div><div><div class="k">Vencimento</div>${fmtD(ata.vencimento)}</div>`; }
        render(); } });
      if (a?.ataId && !opcoesAtas().some((x) => x.id === a.ataId)) { const ata = getAta(a.ataId); if (ata) { ataSel.setItens([...opcoesAtas(), { id: ata.id, label: `${ata.numero} (fora da lista: vencida ou sem adesão)`, sub: "" }]); ataSel.setValue(ata.id); } }
      orgSel = ssel(form.querySelector("#org-ssel"), { placeholder: "UASG, nome ou CNPJ do órgão aderente…", itens: opcoesOrgaos(), value: a?.orgaoId || "", onSelect: (id) => { orgInfo(id); render(); } });
      if (a?.ataId) { const ata = getAta(a.ataId); if (ata) { form.querySelector("#ata-info").hidden = false; const p = getProp(ata.propostaId), l = getLicit(p?.licitacaoId), o = getOrgao(l?.orgaoId);
        form.querySelector("#ata-info").innerHTML = `<div><div class="k">ATA</div>${esc(ata.numero)}</div><div><div class="k">Órgão gerenciador</div>${esc(toTitleCase(o.nome || "—"))}</div><div><div class="k">Pregão</div>${esc(l?.numero || "—")}</div><div><div class="k">Vencimento</div>${fmtD(ata.vencimento)}</div>`; } }
      if (a?.orgaoId) orgInfo(a.orgaoId);
      render();
      m.querySelector("[data-termo]")?.addEventListener("click", () => gerarTermoAceite(a));
    },
    async onSalvar(form) {
      const v = lerForm(form);
      if (!ataSel.value) throw new Error("Selecione a ATA de origem.");
      if (!v.numero.trim()) throw new Error("Informe o número da adesão.");
      if (!orgSel.value) throw new Error("Selecione o órgão aderente (cadastre-o em Órgãos se necessário).");
      if (!v.solicitacao) throw new Error("Informe a data da solicitação.");
      const itens = coletarItens(form, ataSel.value, orgSel.value, a?.id);
      if (!itens.length) throw new Error("Selecione ao menos um item e informe a quantidade.");
      const o = getOrgao(orgSel.value); const c = (o.contatos || []).find((x) => x.nome || x.email) || {};
      await store.setItem("adesoes", { ...(a || {}), id: a?.id || newId(), ataId: ataSel.value, numero: v.numero.trim(), orgaoId: orgSel.value, orgaoAderente: o.nome || "", uasgAderente: o.uasg || "", cnpjAderente: o.cnpj || "",
        municipioAderente: `${o.municipio || ""}${o.municipio && o.estado ? " / " : ""}${o.estado || ""}`, responsavel: c.nome || "", email: c.email || "", processo: v.processo.trim(), solicitacao: v.solicitacao, aprovacao: v.aprovacao || "",
        status: v.status, vencimento: v.vencimento || "", obs: v.obs.trim(), itens, valorTotal: itens.reduce((s, i) => s + i.total, 0), criadoEm: a?.criadoEm || new Date().toISOString() });
      closeModal(); toast(a ? "Adesão atualizada." : "Adesão criada.");
    },
  });
}

function renderItens(form, ataId, orgaoId, excluirId, prevSel) {
  const cont = form.querySelector("#itens");
  const ata = getAta(ataId); const p = getProp(ata?.propostaId); const itens = p?.itens || [];
  if (!ata || !itens.length) { cont.innerHTML = `<div class="empty">${ata ? "A proposta desta ATA não tem itens" : "Selecione a ATA para carregar os itens"}</div>`; form.querySelector("#t-total").textContent = fmt(0); return; }
  const atual = {}; cont.querySelectorAll("[data-idx]").forEach((r) => { atual[r.dataset.idx] = { sel: r.querySelector("[data-sel]").checked, q: r.querySelector("[data-q]").value }; });
  cont.innerHTML = `<div class="table-wrap"><table><thead><tr><th style="width:30px"><input type="checkbox" data-all></th><th>Item</th><th>Limites</th><th style="width:140px">Qtd. adesão</th><th class="num">Subtotal</th></tr></thead><tbody>
    ${itens.map((it, idx) => { const lim = limitesItem(ataId, it, idx, orgaoId, excluirId); const esg = lim.disponivel <= 0;
      const prev = atual[idx] ?? (prevSel[it.num || idx + 1] !== undefined ? { sel: true, q: prevSel[it.num || idx + 1] } : { sel: false, q: "" });
      return `<tr data-idx="${idx}" ${esg ? 'style="opacity:.6"' : ""}>
        <td><input type="checkbox" data-sel ${prev.sel && !esg ? "checked" : ""} ${esg ? "disabled" : ""}></td>
        <td><strong>${esc(it.nome || "—")}</strong><div class="muted" style="font-size:11px">Item ${it.num || idx + 1}${it.codigo ? " · " + esc(it.codigo) : ""} · un. ${fmt(it.preco)}</div></td>
        <td style="font-size:11.5px"><div>Qtd ATA <strong>${fmtNum(lim.qtdAta)}</strong> · 50%: <strong style="color:var(--purple)">${fmtNum(lim.limiteIndividual)}</strong> · 200%: <strong style="color:var(--teal)">${fmtNum(lim.limiteColetivo)}</strong></div>
          <div class="muted">${lim.porOrgao ? `já aderido por este órgão: ${fmtNum(lim.porOrgao)} · ` : ""}${lim.total ? `já aderido no total: ${fmtNum(lim.total)} · ` : ""}disponível: <strong style="color:${esg ? "var(--red)" : "var(--green)"}">${fmtNum(lim.disponivel)}</strong></div>
          ${esg ? `<div style="color:var(--red);font-weight:600">Limite ${lim.motivo === "coletivo" ? "coletivo de 200%" : "individual de 50%"} atingido</div>` : ""}</td>
        <td><input type="number" class="input input-sm" data-q value="${esc(prev.q)}" min="0.01" step="0.01" max="${lim.disponivel}" ${esg ? "disabled" : ""} style="width:120px"><div class="help">máx. ${fmtNum(lim.disponivel)}</div></td>
        <td class="num" data-sub>—</td></tr>`; }).join("")}</tbody></table></div>`;
  const calc = () => { let t = 0; cont.querySelectorAll("[data-idx]").forEach((r) => { const it = itens[+r.dataset.idx]; const q = r.querySelector("[data-q]"); const max = +q.max;
    if (+q.value > max) { q.value = max; toast(`Máximo permitido para este item: ${fmtNum(max)}`, "erro"); }
    const sel = r.querySelector("[data-sel]").checked; const sub = sel ? (+q.value || 0) * (it.preco || 0) : 0; r.querySelector("[data-sub]").textContent = sel && +q.value ? fmt(sub) : "—"; t += sub; });
    form.querySelector("#t-total").textContent = fmt(t); };
  cont.querySelector("[data-all]").addEventListener("change", (e) => { cont.querySelectorAll("[data-sel]:not(:disabled)").forEach((c) => { c.checked = e.target.checked; }); calc(); });
  cont.addEventListener("input", calc); cont.addEventListener("change", calc); calc();
}

function coletarItens(form, ataId, orgaoId, excluirId) {
  const ata = getAta(ataId); const p = getProp(ata?.propostaId); const itens = p?.itens || []; const out = [];
  form.querySelectorAll("#itens [data-idx]").forEach((r) => {
    if (!r.querySelector("[data-sel]").checked) return;
    const idx = +r.dataset.idx, it = itens[idx]; const q = +r.querySelector("[data-q]").value || 0; if (q <= 0) return;
    const lim = limitesItem(ataId, it, idx, orgaoId, excluirId); const qf = Math.min(q, lim.disponivel);
    out.push({ num: it.num || idx + 1, nome: it.nome, codigo: it.codigo || "", marca: it.marca || "", qtdAta: lim.qtdAta, limite50: lim.limiteIndividual, limiteColetivo: lim.limiteColetivo, qtdAdesao: qf, precoUnit: it.preco || 0, total: qf * (it.preco || 0) });
  });
  return out;
}

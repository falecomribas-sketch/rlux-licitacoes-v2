// Cobrança financeira (notas fiscais a receber). Campos (iguais ao legado):
// id, empenhoId | avulsa + avEmpenho/avOrgao/avOrgaoId/avPregao/avUasg, nf, emissao, valor,
// vencimento, status, pagamento, obs, ultimaCobranca, qtdCobrancas, _atualizado
import { store, newId } from "../core/store.js?v=20261113-203913";
import { dataTable, acoes, btnEditar, btnExcluir, onAction } from "../core/table.js?v=20261113-203913";
import { formModal, lerForm, campo, inputTxt, inputNum, inputData, textarea, select, linha, exportarExcel } from "../core/forms.js?v=20261113-203913";
import { toast, confirmar, closeModal, icon, tag } from "../core/ui.js?v=20261113-203913";
import { esc, fmt, fmtD, hojeIso, toTitleCase } from "../core/utils.js?v=20261113-203913";
import { podeEditar } from "../core/auth.js?v=20261113-203913";
import { getLicit, getOrgao, getProp, getAta } from "../core/domain.js?v=20261113-203913";
import { ssel } from "../core/ssel.js?v=20261113-203913";
import { opcoesOrgaos } from "./licitacoes.js?v=20261113-203913";
import { abrirClienteEmail } from "../core/regua.js?v=20261113-203913";
import { EMPRESA } from "../core/pdf.js?v=20261113-203913";

export const STATUS_COB = ["Aguardando NF", "NF Emitida", "Material Enviado", "Aguardando Pagamento", "Pago", "Inadimplente"];
const ST_CLS = { "Aguardando NF": "tag-gray", "NF Emitida": "tag-teal", "Material Enviado": "tag-purple", "Aguardando Pagamento": "tag-amber", Pago: "tag-green", Inadimplente: "tag-red" };
let unsub = null, filtro = "";

// Contexto do empenho (proposta ou adesão) — mesmo do legado (cobEmpCtx)
function empCtx(e) {
  if (!e) return { uasg: "—", pregao: "—", orgaoNome: "—", valor: 0, emails: [], empNumero: null };
  if (e.adesaoId) { const a = store.find("adesoes", e.adesaoId) || {}, ata = getAta(a.ataId) || {}, p = getProp(ata.propostaId) || {}, l = getLicit(p.licitacaoId), o = getOrgao(a.orgaoId);
    const emails = (o.contatos || []).filter((c) => c.email).map((c) => c.email); if (a.email && !emails.includes(a.email)) emails.unshift(a.email);
    return { uasg: a.uasgAderente || "—", pregao: l.numero || "—", orgaoNome: a.orgaoAderente || "—", valor: e.valorRecebido || 0, emails, empNumero: e.numero || null }; }
  const p = getProp(e.propostaId) || {}, l = getLicit(p.licitacaoId), o = getOrgao(l.orgaoId);
  return { uasg: o.uasg || "—", pregao: l.numero || "—", orgaoNome: o.nome || "—", valor: e.valorRecebido || 0, emails: (o.contatos || []).filter((c) => c.email).map((c) => c.email), empNumero: e.numero || null };
}
export function cobCtx(c) {
  if (c?.avulsa) { let orgaoNome = c.avOrgao || "—", uasg = c.avUasg || "—", emails = [];
    if (c.avOrgaoId) { const o = store.find("orgaos", c.avOrgaoId); if (o) { orgaoNome = o.nome || orgaoNome; if (!c.avUasg && o.uasg) uasg = o.uasg; emails = (o.contatos || []).filter((x) => x.email).map((x) => x.email); } }
    return { uasg, pregao: c.avPregao || "—", orgaoNome, valor: c.valor || 0, emails, empNumero: c.avEmpenho || "—", avulsa: true }; }
  const e = store.find("empenhos", c.empenhoId); const ctx = empCtx(e); ctx.removido = !e; return ctx;
}
// Dias de atraso: >0 vencida; 0 em dia; null pago/sem vencimento
export function cobAtraso(c) { if (!c.vencimento || c.status === "Pago") return null; const d = Math.floor((new Date(hojeIso() + "T00:00:00") - new Date(c.vencimento + "T00:00:00")) / 864e5); return d > 0 ? d : 0; }

export default {
  id: "cobrancas", titulo: "Cobrança Financeira", grupo: "Financeiro", icone: "wallet",
  render(el) {
    el.innerHTML = `
      <div class="grid grid-4" id="kpis" style="margin-bottom:16px"></div>
      <div class="page-head"><h2>Cobrança Financeira</h2><div class="actions"><button class="btn btn-ghost" data-act="excel">${icon("download")} Excel</button>
        ${podeEditar() ? `<button class="btn btn-primary" data-act="novo">${icon("plus")} Nova cobrança</button>` : ""}</div></div>
      <div class="card"><div class="chip-filters" id="chips"></div><div class="card-body flush" id="tbl"></div></div>`;
    const todas = () => store.get("cobrancas");
    const chips = () => { const all = todas(); el.querySelector("#chips").innerHTML = `<span class="muted">Status:</span><button class="chip ${!filtro ? "active" : ""}" data-act="filtro" data-id="">Todas (${all.length})</button>` + STATUS_COB.map((s) => `<button class="chip ${filtro === s ? "active" : ""}" data-act="filtro" data-id="${esc(s)}">${esc(s)} (${all.filter((c) => c.status === s).length})</button>`).join(""); };
    const kpis = () => { const all = todas(); const receber = all.filter((c) => c.status !== "Pago"); const inad = receber.filter((c) => (cobAtraso(c) || 0) > 0);
      el.querySelector("#kpis").innerHTML = `
        <div class="kpi"><div class="kpi-label">Total de cobranças</div><div class="kpi-value">${all.length}</div></div>
        <div class="kpi"><div class="kpi-label">A receber</div><div class="kpi-value" style="color:var(--amber-txt)">${fmt(receber.reduce((s, c) => s + (c.valor || 0), 0))}</div></div>
        <div class="kpi"><div class="kpi-label">Recebido</div><div class="kpi-value" style="color:var(--green)">${fmt(all.filter((c) => c.status === "Pago").reduce((s, c) => s + (c.valor || 0), 0))}</div></div>
        <div class="kpi"><div class="kpi-label">Vencidas (${inad.length})</div><div class="kpi-value" style="color:var(--red)">${fmt(inad.reduce((s, c) => s + (c.valor || 0), 0))}</div></div>`; };
    const tabela = dataTable({
      el: el.querySelector("#tbl"), rows: () => todas().filter((c) => !filtro || c.status === filtro),
      search: (c, q) => { const x = cobCtx(c); return [c.nf, x.empNumero, x.orgaoNome, x.pregao, x.uasg].some((v) => String(v || "").toLowerCase().includes(q)); },
      placeholder: "Buscar NF, empenho, órgão, pregão, UASG…", sort: { key: "vencimento", dir: "asc" }, empty: "Nenhuma cobrança", emptySub: "Clique em “Nova cobrança” para registrar uma NF a receber.",
      columns: [
        { key: "empenho", label: "Empenho", sort: (c) => cobCtx(c).empNumero || "", render: (c) => { const x = cobCtx(c); return `<strong>${esc(x.empNumero && x.empNumero !== "—" ? x.empNumero : "")}</strong>${x.avulsa ? ` ${tag("Avulsa", "tag-amber")}` : x.removido ? tag("Empenho removido", "tag-red") : ""}`; } },
        { key: "orgao", label: "Órgão", sort: (c) => cobCtx(c).orgaoNome, render: (c) => { const x = cobCtx(c); return `${esc(toTitleCase(x.orgaoNome))}<div class="muted" style="font-size:11px">${esc(x.pregao)}${x.uasg !== "—" ? " · UASG " + esc(x.uasg) : ""}</div>`; } },
        { key: "nf", label: "NF", render: (c) => `${esc(c.nf || "—")}${c.emissao ? `<div class="muted" style="font-size:11px">${fmtD(c.emissao)}</div>` : ""}` },
        { key: "valor", label: "Valor", num: true, sort: (c) => c.valor || 0, render: (c) => `<strong>${fmt(c.valor)}</strong>` },
        { key: "vencimento", label: "Vencimento", render: (c) => fmtD(c.vencimento) },
        { key: "atraso", label: "Atraso", sort: (c) => cobAtraso(c) ?? -1, render: (c) => { const a = cobAtraso(c); if (c.status === "Pago") return `<span style="color:var(--green)">Pago ${c.pagamento ? fmtD(c.pagamento) : ""}</span>`; if (a === null) return "—"; return a === 0 ? `<span style="color:var(--green)">Em dia</span>` : `<strong style="color:var(--red)">${a} dia(s)</strong>`; } },
        { key: "status", label: "Status", render: (c) => `${tag(c.status || "—", ST_CLS[c.status] || "tag-gray")}${(cobAtraso(c) || 0) > 0 && !["Pago", "Inadimplente"].includes(c.status) ? ` <span style="color:var(--red);font-size:10px;font-weight:700">VENCIDA</span>` : ""}` },
        { key: "ultcob", label: "Últ. cobrança", sort: (c) => c.ultimaCobranca || "", render: (c) => { if (!c.ultimaCobranca) return `<span class="muted">Nunca</span>`; const d = Math.floor((new Date(hojeIso() + "T00:00:00") - new Date(c.ultimaCobranca + "T00:00:00")) / 864e5); return `${fmtD(c.ultimaCobranca)}<div class="muted" style="font-size:11px">${d === 0 ? "hoje" : d === 1 ? "há 1 dia" : `há ${d} dias`}${c.qtdCobrancas > 1 ? ` · ${c.qtdCobrancas}ª` : ""}</div>`; } },
        { key: "acoes", label: "", sort: false, width: "150px", render: (c) => acoes(...(podeEditar() ? [
          ...(c.status !== "Pago" ? [`<button class="icon-btn sm" data-act="email" data-id="${esc(c.id)}" title="Enviar e-mail de cobrança">${icon("mail")}</button>`, `<button class="icon-btn sm" data-act="pago" data-id="${esc(c.id)}" title="Marcar como pago" style="color:var(--green)">${icon("check")}</button>`] : []),
          btnEditar(c.id), btnExcluir(c.id)] : [])) },
      ],
    });
    onAction(el, {
      filtro: (id) => { filtro = id; chips(); tabela.refresh(); },
      novo: () => abrirForm(), editar: (id) => abrirForm(store.find("cobrancas", id)),
      excluir: async (id) => { if (!await confirmar("Excluir esta cobrança?", { ok: "Excluir", perigo: true })) return; await store.remove("cobrancas", id); toast("Cobrança excluída."); },
      pago: async (id) => { const c = store.find("cobrancas", id); if (!c || !await confirmar(`Confirmar recebimento de ${fmt(c.valor)}?`, { ok: "Recebido" })) return; await store.setItem("cobrancas", { ...c, status: "Pago", pagamento: hojeIso(), _atualizado: new Date().toISOString() }); toast("Pagamento registrado."); },
      email: (id) => enviarCobranca(store.find("cobrancas", id)),
      excel: () => exportarExcel(todas().map((c) => { const x = cobCtx(c); return { "Nº Empenho": x.avulsa ? `${x.empNumero !== "—" ? x.empNumero : ""} (avulsa)` : x.empNumero || "(removido)", Órgão: x.orgaoNome, Pregão: x.pregao, UASG: x.uasg, "Nº NF": c.nf || "", "Emissão NF": fmtD(c.emissao), Valor: c.valor || 0, Vencimento: fmtD(c.vencimento), "Dias Atraso": c.status === "Pago" ? 0 : cobAtraso(c) || 0, Status: c.status || "", "Última Cobrança": fmtD(c.ultimaCobranca), "Qtd. Cobranças": c.qtdCobrancas || 0, "Data Pagamento": fmtD(c.pagamento), Observações: c.obs || "" }; }), "Cobranças", "cobrancas_financeiras"),
    });
    chips(); kpis(); unsub = store.on("*", () => { chips(); kpis(); tabela.refresh(); });
  },
  destroy() { unsub?.(); filtro = ""; },
};

function abrirForm(c = null) {
  let empSel, orgSel; let avulsa = !!c?.avulsa;
  const opcoesEmp = () => store.get("empenhos").map((e) => { const x = empCtx(e); return { id: e.id, label: `Nº ${e.numero || "?"} — ${toTitleCase(x.orgaoNome)}`, sub: `Pregão ${x.pregao} · UASG ${x.uasg} · ${fmt(x.valor)}`, extra: [x.uasg, x.pregao].join(" ") }; }).sort((a, b) => b.label.localeCompare(a.label, undefined, { numeric: true }));
  formModal({
    titulo: c ? "Editar cobrança" : "Nova cobrança", largura: "lg",
    corpo: `
      <label class="switch"><input type="checkbox" name="avulsa" ${avulsa ? "checked" : ""}> Cobrança avulsa (empenho antigo, não cadastrado no sistema)</label>
      <div id="sec-emp">${linha(`<div class="field"><span>Empenho de origem</span><div id="emp-ssel"></div></div>`)}<div id="emp-info" class="info-box" hidden></div></div>
      <div id="sec-av" hidden>
        ${linha(`<div class="field"><span>Órgão (cadastrado ou nome livre)</span><div id="org-ssel"></div><input type="hidden" name="avOrgaoId" value="${esc(c?.avOrgaoId || "")}"></div>`, campo("Nome do órgão", inputTxt("avOrgao", c?.avOrgao || "", 'placeholder="Como aparecerá no e-mail"')))}
        ${linha(campo("Nº do empenho", inputTxt("avEmpenho", c?.avEmpenho || "")), campo("Pregão / processo", inputTxt("avPregao", c?.avPregao || "")), campo("UASG", inputTxt("avUasg", c?.avUasg || "")))}
      </div>
      ${linha(campo("Nº da nota fiscal", inputTxt("nf", c?.nf || "")), campo("Emissão da NF", inputData("emissao", c?.emissao || "")), campo("Valor (R$)", inputNum("valor", c?.valor ?? "", 'step="0.01" min="0" required')))}
      ${linha(campo("Vencimento", inputData("vencimento", c?.vencimento || "")), campo("Status", select("status", STATUS_COB, c?.status || "Aguardando NF")), campo("Data do pagamento", inputData("pagamento", c?.pagamento || ""), "f-pagto"))}
      ${campo("Observações", textarea("obs", c?.obs || "", 'rows="2"'))}`,
    onAberto(form) {
      const secE = form.querySelector("#sec-emp"), secA = form.querySelector("#sec-av"), chk = form.querySelector("[name=avulsa]");
      const modo = () => { avulsa = chk.checked; secE.hidden = avulsa; secA.hidden = !avulsa; };
      chk.addEventListener("change", modo); modo();
      const pagto = () => { form.querySelector(".f-pagto").style.visibility = form.querySelector("[name=status]").value === "Pago" ? "visible" : "hidden"; if (form.querySelector("[name=status]").value === "Pago" && !form.querySelector("[name=pagamento]").value) form.querySelector("[name=pagamento]").value = hojeIso(); };
      form.querySelector("[name=status]").addEventListener("change", pagto); pagto();
      const info = (id) => { const e = store.find("empenhos", id); const box = form.querySelector("#emp-info"); if (!e) { box.hidden = true; return; } const x = empCtx(e);
        box.hidden = false; box.innerHTML = `<div><div class="k">Órgão</div>${esc(toTitleCase(x.orgaoNome))}</div><div><div class="k">Pregão / UASG</div>${esc(x.pregao)} · ${esc(x.uasg)}</div><div><div class="k">Valor do empenho</div><strong style="color:var(--green)">${fmt(x.valor)}</strong></div>`;
        const v = form.querySelector("[name=valor]"); if (!v.value) v.value = (x.valor || 0).toFixed(2); };
      empSel = ssel(form.querySelector("#emp-ssel"), { placeholder: "Nº do empenho, órgão, pregão ou UASG…", itens: opcoesEmp(), value: c?.empenhoId || "", onSelect: info }); if (c?.empenhoId) info(c.empenhoId);
      orgSel = ssel(form.querySelector("#org-ssel"), { placeholder: "Buscar órgão cadastrado…", itens: opcoesOrgaos(), value: c?.avOrgaoId || "", onSelect: (id) => { form.querySelector("[name=avOrgaoId]").value = id || ""; const o = store.find("orgaos", id); if (o) { form.querySelector("[name=avOrgao]").value = o.nome || ""; const u = form.querySelector("[name=avUasg]"); if (!u.value) u.value = o.uasg || ""; } } });
      form._emp = () => empSel.value;
    },
    async onSalvar(form) {
      const v = lerForm(form); const valor = parseFloat(v.valor) || 0; const empenhoId = form._emp();
      if (avulsa && !v.avOrgao.trim()) throw new Error("Informe o órgão da cobrança avulsa.");
      if (!avulsa && !empenhoId) throw new Error("Selecione o empenho de origem.");
      if (valor <= 0) throw new Error("Informe o valor da cobrança."); if (!v.vencimento) throw new Error("Informe a data de vencimento.");
      if (v.status === "Pago" && !v.pagamento) throw new Error("Informe a data do pagamento.");
      const item = { ...(c || {}), id: c?.id || newId(), empenhoId: avulsa ? "" : empenhoId, avulsa, avEmpenho: avulsa ? v.avEmpenho.trim() : "", avOrgao: avulsa ? v.avOrgao.trim() : "", avOrgaoId: avulsa ? v.avOrgaoId : "", avPregao: avulsa ? v.avPregao.trim() : "", avUasg: avulsa ? v.avUasg.trim() : "",
        nf: v.nf.trim(), emissao: v.emissao, valor, vencimento: v.vencimento, status: v.status, pagamento: v.status === "Pago" ? v.pagamento : "", obs: v.obs.trim(), _atualizado: new Date().toISOString() };
      await store.setItem("cobrancas", item); closeModal(); toast(c ? "Cobrança atualizada." : "Cobrança registrada.");
    },
  });
}

// E-mail de cobrança (texto idêntico ao legado) — abre o cliente de e-mail e registra a data
async function enviarCobranca(c) {
  if (!c) return; const x = cobCtx(c); const emails = x.emails || [];
  if (!emails.length) { toast(c.avulsa ? "Cobrança avulsa sem e-mails cadastrados — preencha o destinatário no e-mail." : "Nenhum e-mail cadastrado nos contatos deste órgão.", "erro", 5000); if (!c.avulsa) return; }
  if (!c.nf && !await confirmar("Esta cobrança ainda não tem nota fiscal informada. Enviar o e-mail mesmo assim?", { ok: "Enviar" })) return;
  const atr = cobAtraso(c), vencido = (atr || 0) > 0, empNum = x.empNumero || "—", nCob = (c.qtdCobrancas || 0) + 1, ord = nCob > 1 ? ` (${nCob}ª cobrança)` : "";
  const assunto = `Cobrança${ord} - NF ${c.nf || "s/nº"}${vencido ? " VENCIDA" : ""} - Empenho ${empNum}`;
  const nomeOrg = toTitleCase(x.orgaoNome);
  const fato = (k, v) => v ? `  ${k}: ${v}` : null;
  const corpo = [
    `${nomeOrg}\nSetor Financeiro`, ``, `Prezados(as),`, ``,
    `A RLUX Iluminação Ltda. (CNPJ ${EMPRESA.cnpj}) informa a pendência de pagamento referente ao fornecimento abaixo${nCob > 1 && c.ultimaCobranca ? `. Reiteramos a cobrança enviada em ${fmtD(c.ultimaCobranca)} — esta é a ${nCob}ª comunicação sobre este débito.` : "."}`, ``,
    `DADOS DA COBRANÇA`,
    fato("Nota de Empenho", empNum), fato("Pregão / Processo", x.pregao !== "—" ? x.pregao : ""), fato("UASG", x.uasg !== "—" ? x.uasg : ""),
    fato("Nota Fiscal", c.nf ? `nº ${c.nf}${c.emissao ? ` (emitida em ${fmtD(c.emissao)})` : ""}` : "(a informar)"),
    fato("Valor", fmt(c.valor)), fato("Vencimento", c.vencimento ? fmtD(c.vencimento) : "—"),
    fato("Situação", vencido ? `VENCIDA há ${atr} dia(s)` : "a vencer"), ``,
    vencido ? `Como o prazo de pagamento já expirou, solicitamos a gentileza de verificar a regularização do débito com a maior brevidade possível e nos informar a data prevista para quitação.` : `Solicitamos a gentileza de confirmar o processamento e a data prevista para o pagamento.`, ``,
    `Permanecemos à disposição para quaisquer esclarecimentos.`, ``,
    `Atenciosamente,`, `${EMPRESA.representante} · RLUX Iluminação Ltda.`, `CNPJ ${EMPRESA.cnpj}`, EMPRESA.tel, `financeiro@rlux.com.br | www.rlux.com.br`,
  ].filter((l, i, arr) => l !== null && !(l === "" && arr[i - 1] === "")).join("\r\n");
  const inteiro = abrirClienteEmail({ para: emails[0] || "", assunto, corpo }, [...emails.slice(1), "financeiro@rlux.com.br"]);
  await store.setItem("cobrancas", { ...c, ultimaCobranca: hojeIso(), qtdCobrancas: nCob, _atualizado: new Date().toISOString() });
  toast(inteiro ? `E-mail de cobrança aberto${emails[0] ? ` para ${toTitleCase(x.orgaoNome)}` : " (preencha o destinatário)"}.` : "Texto longo: corpo copiado — cole com Ctrl+V no e-mail que abriu.", inteiro ? "ok" : "info", 6000);
}

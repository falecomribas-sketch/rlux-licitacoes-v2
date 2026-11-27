// Cobrança financeira (notas fiscais a receber). Campos (iguais ao legado):
// id, empenhoId | avulsa + avEmpenho/avOrgao/avOrgaoId/avPregao/avUasg, nf, emissao, valor,
// vencimento, status, pagamento, obs, ultimaCobranca, qtdCobrancas, _atualizado
import { store, newId } from "../core/store.js?v=20261127-175536";
import { dataTable, acoes, btnEditar, btnExcluir, onAction } from "../core/table.js?v=20261127-175536";
import { formModal, lerForm, campo, inputTxt, inputNum, inputData, textarea, select, linha, exportarExcel, exportarExcelFormatado } from "../core/forms.js?v=20261127-175536";
import { toast, confirmar, closeModal, openModal, icon, tag } from "../core/ui.js?v=20261127-175536";
import { esc, fmt, fmtD, hojeIso, toTitleCase } from "../core/utils.js?v=20261127-175536";
import { podeEditar } from "../core/auth.js?v=20261127-175536";
import { getLicit, getOrgao, getProp, getAta, deduzirPapel, papelNome } from "../core/domain.js?v=20261127-175536";
import { ssel } from "../core/ssel.js?v=20261127-175536";
import { opcoesOrgaos } from "./licitacoes.js?v=20261127-175536";
import { abrirClienteEmail, copiarTextoFormatado } from "../core/regua.js?v=20261127-175536";
import { EMPRESA } from "../core/pdf.js?v=20261127-175536";

export const STATUS_COB = ["Aguardando NF", "NF Emitida", "Material Enviado", "Aguardando Pagamento", "Pago", "Inadimplente"];
const ST_CLS = { "Aguardando NF": "tag-gray", "NF Emitida": "tag-teal", "Material Enviado": "tag-purple", "Aguardando Pagamento": "tag-amber", Pago: "tag-green", Inadimplente: "tag-red" };
let unsub = null, filtro = "";

// Contexto do empenho (proposta ou adesão) — mesmo do legado (cobEmpCtx)
function empCtx(e) {
  if (!e) return { uasg: "—", pregao: "—", orgaoNome: "—", valor: 0, emails: [], empNumero: null };
  if (e.adesaoId) { const a = store.find("adesoes", e.adesaoId) || {}, ata = getAta(a.ataId) || {}, p = getProp(ata.propostaId) || {}, l = getLicit(p.licitacaoId), o = getOrgao(a.orgaoId);
    const contatos = (o.contatos || []).filter((c) => c.email); if (a.email && !contatos.some((c) => c.email === a.email)) contatos.unshift({ nome: a.contato || "", cargo: "Contato da adesão", email: a.email, papel: "compras" });
    return { uasg: a.uasgAderente || "—", pregao: l.numero || "—", orgaoNome: a.orgaoAderente || "—", valor: e.valorRecebido || 0, emails: contatos.map((c) => c.email), contatos, orgaoId: o.id || "", solicitanteEmail: e.solicitanteEmail || a.email || "", financeiroEmail: e.financeiroEmail || "", empNumero: e.numero || null }; }
  const p = getProp(e.propostaId) || {}, l = getLicit(p.licitacaoId), o = getOrgao(l.orgaoId);
  const contatos = (o.contatos || []).filter((c) => c.email);
  return { uasg: o.uasg || "—", pregao: l.numero || "—", orgaoNome: o.nome || "—", valor: e.valorRecebido || 0, emails: contatos.map((c) => c.email), contatos, orgaoId: o.id || "", solicitanteEmail: e.solicitanteEmail || "", financeiroEmail: e.financeiroEmail || "", empNumero: e.numero || null };
}
export function cobCtx(c) {
  if (c?.avulsa) { let orgaoNome = c.avOrgao || "—", uasg = c.avUasg || "—", emails = [];
    let contatos = [], orgaoId = "";
    if (c.avOrgaoId) { const o = store.find("orgaos", c.avOrgaoId); if (o) { orgaoNome = o.nome || orgaoNome; if (!c.avUasg && o.uasg) uasg = o.uasg; contatos = (o.contatos || []).filter((x) => x.email); emails = contatos.map((x) => x.email); orgaoId = o.id; } }
    return { uasg, pregao: c.avPregao || "—", orgaoNome, valor: c.valor || 0, emails, contatos, orgaoId, empNumero: c.avEmpenho || "—", avulsa: true }; }
  const e = store.find("empenhos", c.empenhoId); const ctx = empCtx(e); ctx.removido = !e; return ctx;
}
// Dias de atraso: >0 vencida; 0 em dia; null pago/sem vencimento
export function cobAtraso(c) { if (!c.vencimento || c.status === "Pago") return null; const d = Math.floor((new Date(hojeIso() + "T00:00:00") - new Date(c.vencimento + "T00:00:00")) / 864e5); return d > 0 ? d : 0; }

export default {
  id: "cobrancas", titulo: "Cobrança Financeira", grupo: "Financeiro", icone: "wallet",
  render(el) {
    el.innerHTML = `
      <div class="grid grid-4" id="kpis" style="margin-bottom:16px"></div>
      <div class="page-head"><h2>Cobrança Financeira</h2><div class="actions"><button class="btn btn-ghost" data-act="relatorio" title="Em aberto, por órgão, com subtotais — respeita o filtro de status">${icon("download")} Relatório de cobrança</button><button class="btn btn-ghost" data-act="excel">${icon("download")} Excel</button>
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
      relatorio: () => relatorioCobranca(todas().filter((c) => filtro ? c.status === filtro : c.status !== "Pago")),
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
  if (!emails.length) toast(c.avulsa ? "Cobrança avulsa sem e-mails cadastrados — informe o destinatário." : "Nenhum e-mail cadastrado nos contatos deste órgão — informe o destinatário ou cadastre em Órgãos.", "aviso", 6000);
  if (!c.nf && !await confirmar("Esta cobrança ainda não tem nota fiscal informada. Enviar o e-mail mesmo assim?", { ok: "Enviar" })) return;
  const atr = cobAtraso(c), vencido = (atr || 0) > 0, empNum = x.empNumero || "—", nCob = (c.qtdCobrancas || 0) + 1, ord = nCob > 1 ? ` (${nCob}ª cobrança)` : "";
  const assunto = `Cobrança${ord} - NF ${c.nf || "s/nº"}${vencido ? " VENCIDA" : ""} - Empenho ${empNum}`;
  const nomeOrg = toTitleCase(x.orgaoNome);
  const fato = (k, v) => v ? `  ${k}: ${v}` : null;
  const corpo = [
    `${nomeOrg}\nSetor Financeiro`, ``, `Prezados(as),`, ``,
    `A RLUX Iluminação Ltda. (CNPJ ${EMPRESA.cnpj}) informa a pendência de pagamento referente ao fornecimento abaixo${nCob > 1 && c.ultimaCobranca ? `. Reiteramos a cobrança enviada em ${fmtD(c.ultimaCobranca)} — esta é a ${nCob}ª comunicação sobre este débito.` : "."}`, ``,
    `DADOS DA COBRANÇA`,
    fato("Nota de Empenho", empNum), fato("Solicitante do empenho", (() => { const s = (x.contatos || []).find((k) => k.email === x.solicitanteEmail); return s ? `${s.nome || s.email}${s.cargo ? ` (${s.cargo})` : ""}` : ""; })()), fato("Pregão / Processo", x.pregao !== "—" ? x.pregao : ""), fato("UASG", x.uasg !== "—" ? x.uasg : ""),
    fato("Nota Fiscal", c.nf ? `nº ${c.nf}${c.emissao ? ` (emitida em ${fmtD(c.emissao)})` : ""}` : "(a informar)"),
    fato("Valor", fmt(c.valor)), fato("Vencimento", c.vencimento ? fmtD(c.vencimento) : "—"),
    fato("Situação", vencido ? `VENCIDA há ${atr} dia(s)` : "a vencer"), ``,
    vencido ? `Como o prazo de pagamento já expirou, solicitamos a gentileza de verificar a regularização do débito com a maior brevidade possível e nos informar a data prevista para quitação.` : `Solicitamos a gentileza de confirmar o processamento e a data prevista para o pagamento.`, ``,
    `Permanecemos à disposição para quaisquer esclarecimentos.`, ``,
    `Atenciosamente,`, `${EMPRESA.representante} · RLUX Iluminação Ltda.`, `CNPJ ${EMPRESA.cnpj}`, EMPRESA.tel, `financeiro@rlux.com.br | www.rlux.com.br`,
  ].filter((l, i, arr) => l !== null && !(l === "" && arr[i - 1] === "")).join("\r\n");
  abrirDestinatarios({ c, x, assunto, corpo, nCob });
}

// Destinatários da cobrança: financeiro do órgão + solicitante do empenho pré-marcados; demais desmarcados; escolha lembrada por órgão
const chaveMem = (x) => `rlux.cob.dest.${x.orgaoId || "avulsa"}`;
function abrirDestinatarios({ c, x, assunto, corpo, nCob }) {
  const contatos = x.contatos || []; const papel = (k) => deduzirPapel(k);
  let lembrados = null; try { const v = localStorage.getItem(chaveMem(x)); lembrados = v ? JSON.parse(v) : null; } catch { lembrados = null; }
  const motivo = (k) => k.email === x.solicitanteEmail ? "solicitou o empenho" : k.email === x.financeiroEmail ? "financeiro do empenho" : papel(k) === "financeiro" ? "financeiro" : "";
  const regra = contatos.map((k) => !!motivo(k)); const temRegra = regra.some(Boolean);
  const marcado = (k, i) => Array.isArray(lembrados) && lembrados.length ? lembrados.includes(k.email) : temRegra ? regra[i] : true;
  const m = openModal({ titulo: `E-mail de cobrança — NF ${c.nf || "s/nº"} · Empenho ${x.empNumero || "—"}`, largura: "lg",
    corpo: `
      <div class="info-box" style="margin-bottom:10px"><div><div class="k">Órgão</div>${esc(toTitleCase(x.orgaoNome))}</div><div><div class="k">Valor</div>${fmt(c.valor)}</div><div><div class="k">Vencimento</div>${c.vencimento ? fmtD(c.vencimento) : "—"}</div><div><div class="k">Cobrança</div>${nCob}ª</div></div>
      <div class="field" style="margin-bottom:10px"><span style="display:flex;justify-content:space-between"><span>Para — ${temRegra ? "financeiro do órgão e solicitante do empenho pré-selecionados" : "órgão sem financeiro/solicitante identificados: todos marcados"}</span><a href="#orgaos" style="font-weight:400;font-size:12px">+ cadastrar contato em Órgãos</a></span>
        ${contatos.length ? `<div class="dest-lista"><div class="dest-cab"><label><input type="checkbox" data-dest-todos> todos</label><span>Nome</span><span>Papel</span><span>E-mail</span></div>
          ${contatos.map((k, i) => { const nome = /^(n\/?a|-+|—)$/i.test(String(k.nome || "").trim()) ? "" : (k.nome || ""); const mo = motivo(k); return `<label class="dest-row ${mo ? "dest-pre" : ""}"><input type="checkbox" data-dest="${i}" ${marcado(k, i) ? "checked" : ""}><span>${nome ? `<strong>${esc(nome)}</strong>` : '<span class="muted">sem nome</span>'}</span><span class="muted">${esc(papelNome(papel(k)) || k.cargo || "—")}${mo ? ` <span class="tag ${mo.includes("solicit") ? "tag-blue" : "tag-green"}" style="margin-left:4px">${esc(mo)}</span>` : ""}</span><span class="dest-mail" title="${esc(k.email)}">${esc(k.email)}</span></label>`; }).join("")}</div>` : `<div class="info-box" style="border-color:var(--amber)"><div>Nenhum contato com e-mail neste órgão. Digite o destinatário abaixo.</div></div>`}
        <input type="text" class="input" id="cob-extra" placeholder="Outros e-mails (separe por ;)" style="margin-top:8px"></div>
      <label class="field" style="margin-bottom:10px"><span>Assunto</span><input type="text" class="input" id="cob-assunto" value="${esc(assunto)}"></label>
      <label class="field"><span>Mensagem <span class="muted" style="font-weight:400">(editável)</span></span><textarea class="input" id="cob-corpo" rows="12" style="font-size:13px;line-height:1.5">${esc(corpo)}</textarea></label>`,
    rodape: `<span class="muted" style="font-size:12px;margin-right:auto">Sua seleção de destinatários fica lembrada para este órgão.</span><button class="btn btn-ghost" data-close>Fechar</button><button class="btn btn-ghost" data-cob="copiar">${icon("file")} Copiar e registrar</button><button class="btn btn-primary" data-cob="enviar">${icon("mail")} Abrir no e-mail e registrar</button>` });
  const todosCb = m.querySelector("[data-dest-todos]"); const syncTodos = () => { if (!todosCb) return; const cbs = [...m.querySelectorAll("[data-dest]")]; todosCb.checked = cbs.length > 0 && cbs.every((k) => k.checked); todosCb.indeterminate = cbs.some((k) => k.checked) && !todosCb.checked; };
  todosCb?.addEventListener("change", () => { m.querySelectorAll("[data-dest]").forEach((k) => { k.checked = todosCb.checked; }); }); m.querySelectorAll("[data-dest]").forEach((k) => k.addEventListener("change", syncTodos)); syncTodos();
  m.addEventListener("click", async (e) => { const b = e.target.closest("[data-cob]"); if (!b) return;
    const sel = [...m.querySelectorAll("[data-dest]:checked")].map((k) => contatos[+k.dataset.dest].email); const extra = m.querySelector("#cob-extra").value.split(/[;,]/).map((t) => t.trim()).filter(Boolean);
    const para = [...new Set([...sel, ...extra])]; if (!para.length) return toast("Selecione ou informe ao menos um destinatário.", "erro");
    try { localStorage.setItem(chaveMem(x), JSON.stringify(sel)); } catch {}
    const email = { para: para[0], assunto: m.querySelector("#cob-assunto").value, corpo: m.querySelector("#cob-corpo").value };
    if (b.dataset.cob === "copiar") { await copiarTextoFormatado(`Para: ${para.join("; ")}\nAssunto: ${email.assunto}\n\n${email.corpo}`); toast("Cobrança copiada e registrada."); }
    else { const inteiro = abrirClienteEmail(email, [...para.slice(1), "financeiro@rlux.com.br"]); toast(inteiro ? `E-mail de cobrança aberto para ${para.length} destinatário(s).` : "Texto longo: corpo copiado — cole com Ctrl+V no e-mail que abriu.", inteiro ? "ok" : "info", 6000); }
    await store.setItem("cobrancas", { ...c, ultimaCobranca: hojeIso(), qtdCobrancas: nCob, ultimosDestinatarios: para, _atualizado: new Date().toISOString() }); closeModal(); });
}

// Relatório de cobrança: Órgão · Empenho · Pregão · NF · Vencimento · Valor · Dias · Qtde. cobranças, por órgão com subtotais
async function relatorioCobranca(lista) {
  if (!lista.length) return toast("Nenhuma cobrança para o relatório com o filtro atual.", "aviso");
  const linhas = lista.map((c) => { const x = cobCtx(c); return { orgao: toTitleCase(x.orgaoNome || "—"), empenho: x.empNumero && x.empNumero !== "—" ? x.empNumero : "", pregao: x.pregao !== "—" ? x.pregao : "", nf: c.nf || "", venc: c.vencimento || "", valor: +c.valor || 0, dias: c.status === "Pago" ? 0 : (cobAtraso(c) || 0), cobr: c.qtdCobrancas || 0, status: c.status || "" }; })
    .sort((a, b) => a.orgao.localeCompare(b.orgao, "pt-BR") || String(a.venc).localeCompare(String(b.venc)));
  const dataXl = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : (iso || ""); }; // meio-dia evita deslocar o dia ao gravar no Excel
  const rows = []; let orgAtual = null, sub = 0, total = 0;
  const fechaSub = () => { if (orgAtual !== null) rows.push({ orgao: `Subtotal ${orgAtual}`, valor: +sub.toFixed(2), _sub: true }); };
  linhas.forEach((l) => { if (l.orgao !== orgAtual) { fechaSub(); orgAtual = l.orgao; sub = 0; } rows.push({ ...l, venc: dataXl(l.venc) }); sub += l.valor; total += l.valor; });
  fechaSub(); rows.push({ orgao: "TOTAL GERAL", valor: +total.toFixed(2), _sub: true, cobr: "", dias: "" });
  const colunas = [{ chave: "orgao", titulo: "Nome do Órgão", largura: 42 }, { chave: "empenho", titulo: "Nota de Empenho", largura: 18 }, { chave: "pregao", titulo: "Pregão", largura: 14 }, { chave: "nf", titulo: "Nota Fiscal", largura: 12 }, { chave: "venc", titulo: "Data Vencimento", largura: 16, data: true }, { chave: "valor", titulo: "Valor", largura: 14, moeda: true }, { chave: "dias", titulo: "Qtde. Dias", largura: 11 }, { chave: "cobr", titulo: "Qtde. de Cobrança", largura: 17 }];
  await exportarExcelFormatado([{ nome: "Cobrança", colunas, rows, titulo: `Relatório de cobrança — ${filtro || "em aberto"} — emitido em ${fmtD(hojeIso())}`, subtotais: true }], `relatorio_cobranca_${hojeIso()}`);
}

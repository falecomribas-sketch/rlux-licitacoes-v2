// CRM — cobranças comerciais (ordem de compra / empenho / acompanhamento). Campos iguais ao legado:
// id, propostaId, status, tipo, contato, contatoInfo, ultContato, proxCont, vencimento, obs,
// historico[{data,canal,desc}], criadoEm
import { store, newId } from "../core/store.js?v=20261113-235511";
import { dataTable, acoes, btnEditar, btnExcluir, onAction } from "../core/table.js?v=20261113-235511";
import { formModal, lerForm, campo, inputTxt, inputData, textarea, select, linha, exportarExcel } from "../core/forms.js?v=20261113-235511";
import { toast, confirmar, closeModal, icon, tag } from "../core/ui.js?v=20261113-235511";
import { esc, fmt, fmtD, fmtNum, hojeIso, toTitleCase } from "../core/utils.js?v=20261113-235511";
import { podeEditar } from "../core/auth.js?v=20261113-235511";
import { getLicit, getOrgao, getProp, getPortal, propTotal, propEmpenhado, propSaldo } from "../core/domain.js?v=20261113-235511";
import { ssel } from "../core/ssel.js?v=20261113-235511";
import { opcoesOrgaos } from "./licitacoes.js?v=20261113-235511";
import { opcoesPropostas } from "./atas.js?v=20261113-235511";
import { novoDoc, cabecalho, rodape, tabelaPadrao } from "../core/pdf.js?v=20261113-235511";

export const STATUS_CRM = ["Agendado", "Em Contato", "Em Renovação", "Em Negociação", "Sem Sucesso", "Finalizado"];
export const TIPOS_CRM = ["Ordem de Compra", "Nota de Empenho", "Acompanhamento", "Cobrança Financeira"];
const CANAIS = ["E-mail", "Telefone", "WhatsApp", "Presencial", "Outro"];
const ST_CLS = { Agendado: "tag-amber", "Em Contato": "tag-blue", "Em Renovação": "tag-purple", "Em Negociação": "tag-teal", "Sem Sucesso": "tag-red", Finalizado: "tag-green" };
let unsub = null, filtro = "";

export function crmCtx(c) { const p = getProp(c.propostaId) || {}, l = getLicit(p.licitacaoId), o = getOrgao(l.orgaoId), ata = store.get("atas").find((a) => a.propostaId === c.propostaId); return { p, l, o, ata, saldo: propSaldo(p) }; }
const ataTag = (ata) => { if (!ata?.vencimento) return "—"; const d = Math.round((new Date(ata.vencimento + "T00:00:00") - new Date(hojeIso() + "T00:00:00")) / 864e5); return d < 0 ? tag("Vencida", "tag-red") : d <= 30 ? tag(`${fmtD(ata.vencimento)} · ${d}d`, "tag-orange") : tag(fmtD(ata.vencimento), "tag-green"); };

export default {
  id: "crm", titulo: "CRM — Cobranças", grupo: "CRM e análise", icone: "phone",
  render(el) {
    el.innerHTML = `
      <div class="grid grid-4" id="kpis" style="margin-bottom:16px"></div>
      <div class="page-head"><h2>CRM — Cobranças de empenho / OC</h2><div class="actions"><button class="btn btn-ghost" data-act="pdf">${icon("print")} PDF</button><button class="btn btn-ghost" data-act="excel">${icon("download")} Excel</button>
        ${podeEditar() ? `<button class="btn btn-primary" data-act="novo">${icon("plus")} Nova cobrança</button>` : ""}</div></div>
      <div class="card"><div class="chip-filters" id="chips"></div><div class="card-body flush" id="tbl"></div></div>`;
    const todas = () => store.get("crm"); const visiveis = () => todas().filter((c) => !filtro || c.status === filtro);
    const chips = () => { const all = todas(); el.querySelector("#chips").innerHTML = `<span class="muted">Status:</span><button class="chip ${!filtro ? "active" : ""}" data-act="filtro" data-id="">Todas (${all.length})</button>` + STATUS_CRM.map((s) => `<button class="chip ${filtro === s ? "active" : ""}" data-act="filtro" data-id="${esc(s)}">${esc(s)} (${all.filter((c) => c.status === s).length})</button>`).join(""); };
    const kpis = () => { const all = todas(); const n = (...s) => all.filter((c) => s.includes(c.status)).length;
      el.querySelector("#kpis").innerHTML = `
        <div class="kpi"><div class="kpi-label">Agendado / Em contato</div><div class="kpi-value" style="color:var(--amber-txt)">${n("Agendado", "Em Contato")}</div></div>
        <div class="kpi"><div class="kpi-label">Em negociação / renovação</div><div class="kpi-value" style="color:var(--blue)">${n("Em Negociação", "Em Renovação")}</div></div>
        <div class="kpi"><div class="kpi-label">Finalizados</div><div class="kpi-value" style="color:var(--green)">${n("Finalizado")}</div></div>
        <div class="kpi"><div class="kpi-label">Sem sucesso</div><div class="kpi-value" style="color:var(--red)">${n("Sem Sucesso")}</div></div>`; };
    const tabela = dataTable({
      el: el.querySelector("#tbl"), rows: visiveis,
      search: (c, q) => { const x = crmCtx(c); return [x.l.numero, x.o.uasg, x.o.nome, x.l.tipo, x.o.cnpj, c.contato, c.obs, ...(x.o.contatos || []).map((k) => k.email)].some((v) => String(v || "").toLowerCase().includes(q)); },
      placeholder: "Buscar pregão, UASG, órgão, contato…", sort: { key: "prox", dir: "asc" }, empty: "Nenhuma cobrança no CRM", emptySub: "Registre aqui os contatos comerciais para cobrar ordens de compra e empenhos.",
      columns: [
        { key: "uasg", label: "UASG", width: "85px", sort: (c) => crmCtx(c).o.uasg || "", render: (c) => { const u = crmCtx(c).o.uasg; return u ? tag(u, "tag-purple") : "—"; } },
        { key: "pregao", label: "Pregão", sort: (c) => crmCtx(c).l.numero || "", render: (c) => { const x = crmCtx(c); return `<strong>${esc(x.l.numero || "—")}</strong><div class="muted" style="font-size:11px">${esc(x.l.tipo || "")}</div>`; } },
        { key: "orgao", label: "Órgão", sort: (c) => crmCtx(c).o.nome || "", render: (c) => esc(toTitleCase(crmCtx(c).o.nome || "—")) },
        { key: "saldo", label: "Saldo", num: true, sort: (c) => crmCtx(c).saldo, render: (c) => `<strong style="color:var(--navy-2)">${fmt(crmCtx(c).saldo)}</strong>` },
        { key: "ata", label: "Venc. ATA", sort: (c) => crmCtx(c).ata?.vencimento || "", render: (c) => ataTag(crmCtx(c).ata) },
        { key: "tipo", label: "Tipo", render: (c) => tag(c.tipo || "—", "tag-blue") },
        { key: "ult", label: "Últ. contato", sort: (c) => c.ultContato || "", render: (c) => `${fmtD(c.ultContato)}<div class="muted" style="font-size:11px">${esc(c.contato || "")}</div>` },
        { key: "prox", label: "Próx. contato", sort: (c) => c.proxCont || "9999", render: (c) => c.proxCont ? tag(fmtD(c.proxCont), c.proxCont < hojeIso() ? "tag-red" : "tag-amber") : "—" },
        { key: "status", label: "Status", render: (c) => tag(c.status || "—", ST_CLS[c.status] || "tag-gray") },
        { key: "obs", label: "Resumo", sort: false, render: (c) => `<span class="muted" style="font-size:12px">${esc((c.obs || "").slice(0, 80))}${(c.obs || "").length > 80 ? "…" : ""}</span>` },
        { key: "acoes", label: "", sort: false, width: "120px", render: (c) => acoes(...(podeEditar() ? [`<button class="icon-btn sm" data-act="interacao" data-id="${esc(c.id)}" title="Registrar interação">${icon("phone")}</button>`, btnEditar(c.id), btnExcluir(c.id)] : [])) },
      ],
    });
    onAction(el, {
      filtro: (id) => { filtro = id; chips(); tabela.refresh(); },
      novo: () => abrirForm(), editar: (id) => abrirForm(store.find("crm", id)), interacao: (id) => abrirForm(store.find("crm", id), true),
      excluir: async (id) => { if (!await confirmar("Excluir esta cobrança do CRM?", { ok: "Excluir", perigo: true })) return; await store.remove("crm", id); toast("Excluída."); },
      excel: () => exportarExcel(todas().map((c) => { const x = crmCtx(c); return { UASG: x.o.uasg || "—", "Pregão/Nº": x.l.numero || "—", Tipo: x.l.tipo || "—", Órgão: x.o.nome || "—", Portal: getPortal(x.l.portalId).sigla || "—", "Saldo Disponível": x.saldo, "Venc. ATA": fmtD(x.ata?.vencimento), "Tipo Cobrança": c.tipo || "—", Contato: c.contato || "—", "Tel/Email": c.contatoInfo || "—", "Últ. Contato": fmtD(c.ultContato), "Próx. Contato": fmtD(c.proxCont), Vencimento: fmtD(c.vencimento), Status: c.status || "—", Resumo: c.obs || "—" }; }), "CRM", "crm_cobrancas"),
      pdf: async () => { const doc = await novoDoc("landscape"); const y = cabecalho(doc, "CRM — Cobranças de empenhos / OC", `Emitido em ${fmtD(hojeIso())}${filtro ? " · Status: " + filtro : ""}`);
        doc.autoTable(tabelaPadrao({ startY: y + 2, head: [["UASG", "Pregão", "Órgão", "Saldo", "Venc. ATA", "Tipo", "Próx. contato", "Status", "Resumo"]],
          body: visiveis().map((c) => { const x = crmCtx(c); return [x.o.uasg || "—", x.l.numero || "—", toTitleCase(x.o.nome || "—").slice(0, 30), fmt(x.saldo), fmtD(x.ata?.vencimento), c.tipo || "—", fmtD(c.proxCont), c.status || "—", (c.obs || "").slice(0, 40)]; }) }));
        rodape(doc); doc.save("crm_cobrancas.pdf"); toast("PDF do CRM gerado."); },
    });
    chips(); kpis(); unsub = store.on("*", () => { chips(); kpis(); tabela.refresh(); });
  },
  destroy() { unsub?.(); filtro = ""; },
};

function abrirForm(c = null, novaInteracao = false) {
  let orgSel, propSel, contSel; const x = c ? crmCtx(c) : null; let historico = (c?.historico || []).slice();
  formModal({
    titulo: c ? `Editar cobrança — ${x.l.numero || "?"}` : "Nova cobrança (CRM)", largura: "xl",
    corpo: `
      ${linha(`<div class="field"><span>Órgão</span><div id="org-ssel"></div></div>`, `<div class="field"><span>Proposta / pregão</span><div id="prop-ssel"></div></div>`)}
      <div id="painel" hidden></div>
      ${linha(campo("Tipo de cobrança", select("tipo", TIPOS_CRM, c?.tipo || "Ordem de Compra")), campo("Status", select("status", STATUS_CRM, c?.status || "Agendado")))}
      ${linha(`<div class="field"><span>Contato (dos contatos do órgão)</span><div id="cont-ssel"></div><input type="hidden" name="contato" value="${esc(c?.contato || "")}"></div>`, campo("Telefone / e-mail", inputTxt("contatoInfo", c?.contatoInfo || "")))}
      ${linha(campo("Último contato", inputData("ultContato", c?.ultContato || "")), campo("Próximo contato", inputData("proxCont", c?.proxCont || "")), campo("Vencimento / prazo", inputData("vencimento", c?.vencimento || "")))}
      ${campo("Resumo / observações", textarea("obs", c?.obs || "", 'rows="3"'))}
      <div class="form-section" style="display:flex;justify-content:space-between;align-items:center">Histórico de interações <button type="button" class="btn btn-ghost btn-sm" data-act="nova-int">${icon("plus")} Nova interação</button></div>
      <div id="nova-int" class="subcard" hidden>${linha(campo("Data", inputData("intData", hojeIso())), campo("Canal", select("intCanal", CANAIS, "E-mail")), campo("Descrição", inputTxt("intDesc", "", 'placeholder="O que foi tratado"')))}
        <div style="text-align:right"><button type="button" class="btn btn-primary btn-sm" data-act="add-int">Adicionar ao histórico</button></div></div>
      <div id="hist"></div>`,
    onAberto(form) {
      const painel = form.querySelector("#painel");
      const renderHist = () => { form.querySelector("#hist").innerHTML = historico.length ? historico.slice().reverse().map((h, i) => `<div class="list-item"><div style="flex:1"><strong style="font-size:12.5px">${fmtD(h.data)} — ${esc(h.canal)}</strong><div style="font-size:12.5px">${esc(h.desc)}</div></div><button type="button" class="icon-btn sm danger" data-act="del-int" data-id="${historico.length - 1 - i}" title="Remover">${icon("trash")}</button></div>`).join("") : `<p class="muted" style="font-size:12.5px">Nenhuma interação registrada.</p>`; };
      const mostrar = (pid) => { const p = getProp(pid); if (!p) { painel.hidden = true; contSel.setItens([]); return; } const l = getLicit(p.licitacaoId), o = getOrgao(l.orgaoId), saldo = propSaldo(p), emps = store.get("empenhos").filter((e) => e.propostaId === p.id);
        painel.hidden = false; painel.innerHTML = `<div class="info-box"><div><div class="k">Proposta</div>#${esc(p.num || "?")} · ${esc(l.numero || "?")}</div><div><div class="k">Valor da proposta</div>${fmt(propTotal(p))}</div><div><div class="k">Empenhado</div><span style="color:var(--green)">${fmt(propEmpenhado(p.id))}</span></div><div><div class="k">Saldo disponível</div><strong style="color:${saldo <= 0 ? "var(--green)" : "var(--amber-txt)"}">${fmt(saldo)}</strong></div></div>
          <div class="subcard" style="max-height:150px;overflow:auto;margin-top:8px"><strong style="font-size:12px">Itens com saldo</strong>${(p.itens || []).map((it, idx) => { const emp = emps.reduce((s, e) => s + (e.itensRecebidos?.[idx] || 0), 0); const sal = (it.qtd || 0) - emp; return sal > 0 ? `<div class="list-item" style="font-size:12px"><span style="flex:1">${esc(it.nome)}</span><span style="color:var(--navy-2)">${fmtNum(sal)} un = ${fmt(sal * (it.preco || 0))}</span></div>` : ""; }).join("") || `<div class="muted" style="font-size:12px">Sem saldo em aberto</div>`}</div>`;
        contSel.setItens((o.contatos || []).map((k) => ({ id: k.nome, label: k.nome + (k.cargo ? ` — ${k.cargo}` : ""), sub: [k.email, k.telefone].filter(Boolean).join(" | "), extra: k.email }))); };
      orgSel = ssel(form.querySelector("#org-ssel"), { placeholder: "Nome, UASG ou CNPJ do órgão…", itens: opcoesOrgaos(), value: x?.l.orgaoId || "", onSelect: (id) => { propSel.setItens(opcoesPropostas(id, true)); propSel.setValue(""); id ? propSel.enable("Selecione a proposta…") : propSel.disable("Selecione um órgão primeiro…"); mostrar(""); } });
      propSel = ssel(form.querySelector("#prop-ssel"), { placeholder: "Selecione um órgão primeiro…", itens: x?.l.orgaoId ? opcoesPropostas(x.l.orgaoId, true) : [], value: c?.propostaId || "", disabled: !x?.l.orgaoId, onSelect: mostrar });
      contSel = ssel(form.querySelector("#cont-ssel"), { placeholder: "Selecione o contato…", itens: [], value: "", onSelect: (id, it) => { form.querySelector("[name=contato]").value = id || ""; const o = getOrgao(getLicit(getProp(propSel.value)?.licitacaoId).orgaoId); const k = (o.contatos || []).find((z) => z.nome === id); if (k && (k.telefone || k.email)) form.querySelector("[name=contatoInfo]").value = [k.telefone, k.email].filter(Boolean).join(" | "); } });
      if (c?.propostaId) { mostrar(c.propostaId); if (c.contato) contSel.setValue(c.contato); }
      form.addEventListener("click", (e) => { const b = e.target.closest("[data-act]"); if (!b) return;
        if (b.dataset.act === "nova-int") { form.querySelector("#nova-int").hidden = false; form.querySelector("[name=intDesc]").focus(); }
        if (b.dataset.act === "add-int") { const d = form.querySelector("[name=intData]").value, canal = form.querySelector("[name=intCanal]").value, desc = form.querySelector("[name=intDesc]").value.trim(); if (!d || !desc) return toast("Preencha data e descrição da interação.", "erro");
          historico.push({ data: d, canal, desc }); form.querySelector("[name=intDesc]").value = ""; form.querySelector("#nova-int").hidden = true; const u = form.querySelector("[name=ultContato]"); if (!u.value || u.value < d) u.value = d; renderHist(); }
        if (b.dataset.act === "del-int") { historico.splice(+b.dataset.id, 1); renderHist(); } });
      renderHist(); if (novaInteracao) { form.querySelector("#nova-int").hidden = false; setTimeout(() => form.querySelector("[name=intDesc]").focus(), 50); }
      form._prop = () => propSel.value;
    },
    async onSalvar(form) {
      const v = lerForm(form); const propostaId = form._prop(); if (!propostaId) throw new Error("Selecione a proposta.");
      const item = { id: c?.id || newId(), propostaId, status: v.status, tipo: v.tipo, contato: v.contato, contatoInfo: v.contatoInfo.trim(), ultContato: v.ultContato, proxCont: v.proxCont, vencimento: v.vencimento, obs: v.obs.trim(), historico, criadoEm: c?.criadoEm || new Date().toISOString() };
      await store.setItem("crm", item); closeModal(); toast("Cobrança salva.");
    },
  });
}

// Empenhos. Campos: id, propostaId | adesaoId, numero, data, valorRecebido (valor do empenho),
// itensRecebidos[] (qtd por item, na ordem dos itens da proposta/adesão), arqData
import { store, newId } from "../core/store.js?v=20261113-111928";
import { dataTable, acoes, btnEditar, btnExcluir, onAction } from "../core/table.js?v=20261113-111928";
import { formModal, lerForm, campo, inputTxt, inputData, linha, exportarExcel } from "../core/forms.js?v=20261113-111928";
import { toast, confirmar, closeModal, icon, tag } from "../core/ui.js?v=20261113-111928";
import { esc, fmt, fmtD, fmtNum, toTitleCase } from "../core/utils.js?v=20261113-111928";
import { podeEditar } from "../core/auth.js?v=20261113-111928";
import { getLicit, getOrgao, getProp, getPortal, getAta, propTotal } from "../core/domain.js?v=20261113-111928";
import { ssel } from "../core/ssel.js?v=20261113-111928";
import { opcoesOrgaos } from "./licitacoes.js?v=20261113-111928";
import { opcoesPropostas } from "./atas.js?v=20261113-111928";
import { uploadAnexo, anexoBotoes, campoAnexo, ligarDropzones } from "../core/files.js?v=20261113-111928";
import { gerarPdfEmpenho } from "../pdf/empenho.js?v=20261113-111928";

let unsub = null, periodo = "mes";

// Contexto de um empenho (proposta ou adesão)
export function empCtx(e) {
  if (e.adesaoId) {
    const a = store.find("adesoes", e.adesaoId) || {}, ata = getAta(a.ataId) || {}, p = getProp(ata.propostaId) || {}, l = getLicit(p.licitacaoId), o = getOrgao(l.orgaoId);
    return { tipo: "adesao", a, p, l, o, uasg: a.uasgAderente || "—", pregao: l.numero || "—", orgaoNome: a.orgaoAderente || "—", dataPregao: l.data || "", chave: "a:" + e.adesaoId, rotulo: `Adesão ${a.numero || "?"} · ${toTitleCase(a.orgaoAderente || "—")}`, totalRef: a.valorTotal || 0, itens: (a.itens || []).map((it) => ({ ...it, qtd: it.qtdAdesao, preco: it.precoUnit })) };
  }
  const p = getProp(e.propostaId) || {}, l = getLicit(p.licitacaoId), o = getOrgao(l.orgaoId);
  return { tipo: "proposta", p, l, o, uasg: o.uasg || "—", pregao: l.numero || "—", orgaoNome: o.nome || "—", dataPregao: l.data || "", chave: "p:" + e.propostaId, rotulo: `${l.numero || "?"} · ${toTitleCase(o.nome || "—")}`, totalRef: propTotal(p), itens: p.itens || [] };
}
const empsDoMesmoGrupo = (e) => store.get("empenhos").filter((x) => e.adesaoId ? x.adesaoId === e.adesaoId : (x.propostaId === e.propostaId && !x.adesaoId));
const totalGrupo = (e) => empsDoMesmoGrupo(e).reduce((s, x) => s + (x.valorRecebido || 0), 0);

export default {
  id: "empenhos", titulo: "Empenhos", grupo: "Pós-licitação", icone: "coins",

  render(el) {
    el.innerHTML = `
      <div class="grid grid-4" id="kpis" style="margin-bottom:16px"></div>
      <div class="page-head"><h2>Empenhos</h2><div class="actions"><button class="btn btn-ghost" data-act="excel">${icon("download")} Excel</button>
        ${podeEditar() ? `<button class="btn btn-primary" data-act="novo">${icon("plus")} Novo empenho</button>` : ""}</div></div>
      <div class="card"><div class="chip-filters"><span class="muted">Período:</span>
        ${[["mes", "Este mês"], ["trim", "Últimos 3 meses"], ["ano", "Este ano"], ["todos", "Todos"]].map(([v, t]) => `<button class="chip ${periodo === v ? "active" : ""}" data-act="per" data-id="${v}">${t}</button>`).join("")}</div>
        <div class="card-body flush" id="tbl"></div></div>`;

    const hoje = new Date();
    const linhas = () => store.get("empenhos").filter((e) => {
      if (periodo === "todos") return true; if (!e.data) return false; const d = new Date(e.data + "T00:00:00");
      if (periodo === "mes") return d.getFullYear() === hoje.getFullYear() && d.getMonth() === hoje.getMonth();
      if (periodo === "trim") { const t = new Date(hoje); t.setMonth(t.getMonth() - 3); return d >= t; }
      return d.getFullYear() === hoje.getFullYear();
    });
    const kpis = () => { const d = linhas(); const val = d.reduce((s, e) => s + (e.valorRecebido || 0), 0);
      const grupos = new Map(); d.forEach((e) => { const c = empCtx(e); if (!grupos.has(c.chave)) grupos.set(c.chave, c.totalRef - totalGrupo(e)); });
      const saldo = [...grupos.values()].reduce((s, v) => s + v, 0);
      const mes = store.get("empenhos").filter((e) => e.data && new Date(e.data + "T00:00:00").getMonth() === hoje.getMonth() && new Date(e.data + "T00:00:00").getFullYear() === hoje.getFullYear()).length;
      el.querySelector("#kpis").innerHTML = `
        <div class="kpi"><div class="kpi-label">Empenhos no período</div><div class="kpi-value">${d.length}</div></div>
        <div class="kpi"><div class="kpi-label">Valor empenhado</div><div class="kpi-value" style="color:var(--green)">${fmt(val)}</div></div>
        <div class="kpi"><div class="kpi-label">Saldo a empenhar (nos contratos do período)</div><div class="kpi-value" style="color:${saldo > 0 ? "var(--amber-txt)" : "inherit"}">${fmt(saldo)}</div></div>
        <div class="kpi"><div class="kpi-label">Empenhos este mês</div><div class="kpi-value">${mes}</div></div>`; };

    const tabela = dataTable({
      el: el.querySelector("#tbl"), rows: linhas,
      search: (e, q) => { const c = empCtx(e); return [e.numero, c.uasg, c.pregao, c.orgaoNome, c.a?.numero, c.a?.cnpjAderente, c.o?.cnpj, ...(c.o?.contatos || []).map((x) => x.email)].some((x) => (x || "").toLowerCase().includes(q)); },
      placeholder: "Buscar nº empenho, UASG, pregão, órgão…", sort: { key: "data", dir: "desc" }, empty: "Nenhum empenho no período",
      columns: [
        { key: "dataPregao", label: "Dt. pregão", width: "95px", sort: (e) => empCtx(e).dataPregao, render: (e) => fmtD(empCtx(e).dataPregao) },
        { key: "uasg", label: "UASG", width: "85px", sort: (e) => empCtx(e).uasg, render: (e) => { const c = empCtx(e); return `${c.uasg !== "—" ? tag(c.uasg, "tag-purple") : "—"}${c.tipo === "adesao" ? `<div style="margin-top:3px">${tag("Adesão", "tag-purple")}</div>` : ""}`; } },
        { key: "pregao", label: "Pregão", sort: (e) => empCtx(e).pregao, render: (e) => `<strong>${esc(empCtx(e).pregao)}</strong>` },
        { key: "orgao", label: "Órgão", sort: (e) => empCtx(e).orgaoNome, render: (e) => esc(toTitleCase(empCtx(e).orgaoNome)) },
        { key: "data", label: "Data", render: (e) => fmtD(e.data) },
        { key: "valor", label: "Este empenho", num: true, sort: (e) => e.valorRecebido || 0, render: (e) => `<strong>${fmt(e.valorRecebido)}</strong>` },
        { key: "tot", label: "Total empenhado", num: true, sort: (e) => totalGrupo(e), render: (e) => `<span class="muted">${fmt(totalGrupo(e))}</span>` },
        { key: "saldo", label: "Saldo", num: true, sort: (e) => empCtx(e).totalRef - totalGrupo(e), render: (e) => { const c = empCtx(e), t = totalGrupo(e), s = c.totalRef - t, pct = c.totalRef ? Math.round(t / c.totalRef * 100) : 0;
          return `${tag(fmt(s), s <= 0 ? "tag-green" : "tag-amber")}<div class="prog"><div class="prog-fill ${pct >= 100 ? "full" : ""}" style="width:${Math.min(pct, 100)}%"></div></div><span class="muted" style="font-size:11px">${pct}% empenhado</span>`; } },
        { key: "numero", label: "Nº empenho", render: (e) => `<strong>${esc(e.numero)}</strong><div style="margin-top:3px">${anexoBotoes(e.arqData, "Ordem")}</div>` },
        { key: "acoes", label: "", sort: false, width: "120px", render: (e) => acoes(`<button class="icon-btn sm" data-act="pdf" data-id="${esc(e.id)}" title="PDF">${icon("print")}</button>`, ...(podeEditar() ? [btnEditar(e.id), btnExcluir(e.id, store.get("cobrancas").some((c) => c.empenhoId === e.id) ? "Tem cobrança vinculada" : "")] : [])) },
      ],
    });

    onAction(el, {
      per: (id) => { periodo = id; el.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.id === id)); kpis(); tabela.refresh(); },
      novo: () => abrirForm(), editar: (id) => abrirForm(store.find("empenhos", id)), pdf: (id) => gerarPdfEmpenho(store.find("empenhos", id)),
      excluir: async (id) => { if (!await confirmar("Excluir este empenho?", { ok: "Excluir", perigo: true })) return; await store.remove("empenhos", id); toast("Empenho excluído."); },
      excel: () => exportarExcel(store.get("empenhos").map((e) => { const c = empCtx(e); return { "Nº Empenho": e.numero, Origem: c.tipo === "adesao" ? "Adesão " + (c.a.numero || "") : "Proposta #" + (c.p.num || "?"), UASG: c.uasg, "Pregão/Nº": c.pregao, Tipo: c.l?.tipo || "", Portal: getPortal(c.l?.portalId).sigla || "", Órgão: c.orgaoNome, Data: fmtD(e.data), "Valor empenhado": e.valorRecebido || 0, "Total empenhado": totalGrupo(e), Saldo: c.totalRef - totalGrupo(e) }; }), "Empenhos", "empenhos"),
    });
    kpis(); unsub = store.on("*", () => { kpis(); tabela.refresh(); });
  },
  destroy() { unsub?.(); periodo = "mes"; },
};

function abrirForm(e = null) {
  let orgSel, propSel, adSel; let origem = e?.adesaoId ? "adesao" : "proposta";
  const cOld = e ? empCtx(e) : null;
  const opcoesAdesoes = () => store.get("adesoes").filter((a) => a.status === "Aprovada").map((a) => { const ata = getAta(a.ataId); const l = getLicit(getProp(ata?.propostaId)?.licitacaoId);
    return { id: a.id, label: `${a.numero} — ${toTitleCase(a.orgaoAderente || "?")}`, sub: `ATA ${ata?.numero || "?"} · Pregão ${l?.numero || "—"} · UASG ${a.uasgAderente || "—"} · ${fmt(a.valorTotal)}`, extra: [a.cnpjAderente, a.email].join(" ") }; });

  formModal({
    titulo: e ? `Editar empenho ${e.numero}` : "Novo empenho", largura: "xl",
    corpo: `
      <div class="field"><span>Origem do empenho</span><div style="display:flex;gap:16px;margin-top:4px">
        <label class="switch"><input type="radio" name="origem" value="proposta" ${origem === "proposta" ? "checked" : ""}> Proposta / ATA</label>
        <label class="switch"><input type="radio" name="origem" value="adesao" ${origem === "adesao" ? "checked" : ""}> Adesão de ATA</label></div></div>
      <div id="sec-prop">${linha(`<div class="field"><span>Órgão</span><div id="org-ssel"></div></div>`, `<div class="field"><span>Proposta vencedora</span><div id="prop-ssel"></div></div>`)}</div>
      <div id="sec-ad" hidden>${linha(`<div class="field"><span>Adesão aprovada</span><div id="ad-ssel"></div></div>`)}</div>
      <div id="ref-info" class="info-box" hidden></div>
      ${linha(campo("Nº do empenho", inputTxt("numero", e?.numero || "", "required")), campo("Data", inputData("data", e?.data || "")))}
      <div class="form-section">Itens — informe as quantidades a empenhar</div>
      <div id="itens"><div class="empty">Selecione a origem para carregar os itens</div></div>
      <div class="totais"><div class="total-geral"><span class="muted">Valor a empenhar</span><strong id="t-total">R$ 0,00</strong></div></div>
      ${linha(campoAnexo("Ordem de empenho (anexo)", "arq", e?.arqData))}`,
    onAberto(form) {
      const secP = form.querySelector("#sec-prop"), secA = form.querySelector("#sec-ad");
      const refId = () => origem === "adesao" ? adSel.value : propSel.value;
      const renderItens = () => { const id = refId(); const box = form.querySelector("#ref-info"); const cont = form.querySelector("#itens");
        if (!id) { box.hidden = true; cont.innerHTML = `<div class="empty">Selecione a origem para carregar os itens</div>`; form.querySelector("#t-total").textContent = fmt(0); return; }
        const fake = origem === "adesao" ? { adesaoId: id } : { propostaId: id }; const c = empCtx(fake);
        const outros = empsDoMesmoGrupo(fake).filter((x) => x.id !== e?.id); const jaTot = outros.reduce((s, x) => s + (x.valorRecebido || 0), 0);
        box.hidden = false; box.innerHTML = `<div><div class="k">${c.tipo === "adesao" ? "Adesão" : "Proposta"}</div>${c.tipo === "adesao" ? esc(c.a.numero) : "#" + (c.p.num || "?") + " · " + esc(c.pregao)}</div><div><div class="k">Órgão</div>${esc(toTitleCase(c.orgaoNome))}</div><div><div class="k">Total / já empenhado</div>${fmt(c.totalRef)} · <span style="color:var(--green)">${fmt(jaTot)}</span></div><div><div class="k">Saldo disponível</div><strong>${fmt(c.totalRef - jaTot)}</strong></div>`;
        cont.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Nº</th><th>Produto</th><th class="num">Vl. unit.</th><th class="num">Qtd ${c.tipo === "adesao" ? "adesão" : "proposta"}</th><th class="num">Já emp.</th><th class="num">Saldo</th><th style="width:120px">Qtd a empenhar</th></tr></thead><tbody>
          ${c.itens.map((it, idx) => { const ja = outros.reduce((s, x) => s + (x.itensRecebidos?.[idx] || 0), 0); const saldo = Math.max(0, (it.qtd || 0) - ja); const val = e?.itensRecebidos?.[idx] ?? 0;
            return `<tr data-idx="${idx}" data-preco="${it.preco || 0}" data-max="${saldo}"><td>${esc(it.num || idx + 1)}</td><td><strong>${esc(it.nome || "")}</strong><div class="muted" style="font-size:11px">${esc(it.codigo || "")}${it.marca ? " · " + esc(it.marca) : ""}</div></td><td class="num">${fmt(it.preco)}</td><td class="num">${fmtNum(it.qtd)}</td><td class="num" style="color:var(--amber-txt)">${fmtNum(ja)}</td><td class="num" style="font-weight:600;color:${saldo > 0 ? "var(--green)" : "var(--red)"}">${fmtNum(saldo)}</td><td><input type="number" class="input input-sm" data-q value="${val}" min="0" max="${saldo}" step="0.01" ${saldo <= 0 ? "disabled" : ""} style="width:110px"></td></tr>`; }).join("")}</tbody></table></div>`;
        calc(); };
      const calc = () => { let t = 0; form.querySelectorAll("#itens [data-idx]").forEach((r) => { const q = r.querySelector("[data-q]"); const max = +r.dataset.max; if (+q.value > max) { q.value = max; toast(`Máximo disponível para este item: ${fmtNum(max)}`, "erro"); } t += (+q.value || 0) * +r.dataset.preco; }); form.querySelector("#t-total").textContent = fmt(t); };
      form.querySelector("#itens").addEventListener("input", calc);
      form.querySelectorAll("[name=origem]").forEach((r) => r.addEventListener("change", () => { origem = r.value; secP.hidden = origem !== "proposta"; secA.hidden = origem !== "adesao"; renderItens(); }));
      secP.hidden = origem !== "proposta"; secA.hidden = origem !== "adesao";
      orgSel = ssel(form.querySelector("#org-ssel"), { placeholder: "Nome, UASG ou CNPJ do órgão…", itens: opcoesOrgaos(), value: cOld?.tipo === "proposta" ? cOld.l?.orgaoId || "" : "",
        onSelect: (id) => { propSel.setItens(opcoesPropostas(id, true)); propSel.setValue(""); id ? propSel.enable("Selecione a proposta…") : propSel.disable("Selecione um órgão primeiro…"); renderItens(); } });
      propSel = ssel(form.querySelector("#prop-ssel"), { placeholder: "Selecione um órgão primeiro…", itens: cOld?.tipo === "proposta" && cOld.l?.orgaoId ? opcoesPropostas(cOld.l.orgaoId, true) : [], value: e?.propostaId || "", disabled: !(cOld?.tipo === "proposta"), onSelect: renderItens });
      adSel = ssel(form.querySelector("#ad-ssel"), { placeholder: "Nº adesão, órgão, CNPJ, UASG ou pregão…", itens: opcoesAdesoes(), value: e?.adesaoId || "", onSelect: renderItens });
      ligarDropzones(form); renderItens();
      form._refId = refId;
    },
    async onSalvar(form) {
      const v = lerForm(form); const id = form._refId();
      if (!id) throw new Error(origem === "adesao" ? "Selecione a adesão." : "Selecione a proposta.");
      if (!v.numero.trim() || !v.data) throw new Error("Preencha número e data do empenho.");
      const itensRecebidos = []; let valor = 0;
      form.querySelectorAll("#itens [data-idx]").forEach((r) => { const q = +r.querySelector("[data-q]").value || 0; if (q > +r.dataset.max) throw new Error("Quantidade acima do saldo disponível em um dos itens."); itensRecebidos.push(q); valor += q * +r.dataset.preco; });
      if (valor <= 0) throw new Error("Informe ao menos uma quantidade a empenhar.");
      const eid = e?.id || newId();
      const item = { ...(e || {}), id: eid, propostaId: origem === "proposta" ? id : "", adesaoId: origem === "adesao" ? id : "", numero: v.numero.trim(), data: v.data, valorRecebido: valor, itensRecebidos, arqData: e?.arqData || "" };
      const f = form.arq.files[0]; if (f) { toast("Enviando anexo…", "info"); item.arqData = await uploadAnexo("empenhos", eid, "arqData", f); }
      await store.setItem("empenhos", item); closeModal(); toast(e ? "Empenho atualizado." : "Empenho registrado.");
    },
  });
}

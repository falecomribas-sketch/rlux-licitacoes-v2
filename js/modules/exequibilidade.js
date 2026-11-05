// Exequibilidade. Campos: id, propostaId, uasg, pregao, orgaoNome, imposto, frete, obs, criadoEm,
// itens[{numItem, item, qtde, custo, precoUnit, lucro, margem, statusCalc, impostoVal, freteVal, lucroTotal, receita}]
// Fórmula: Lucro = Preço − Custo − Preço×Imposto% − Preço×Frete%  |  Margem = Lucro ÷ Preço
import { store, newId } from "../core/store.js";
import { dataTable, acoes, btnEditar, btnExcluir, onAction } from "../core/table.js";
import { formModal, lerForm, campo, inputTxt, inputNum, textarea, linha, exportarExcel } from "../core/forms.js";
import { toast, confirmar, closeModal, icon, tag } from "../core/ui.js";
import { esc, fmt, fmtNum, toTitleCase } from "../core/utils.js";
import { podeEditar } from "../core/auth.js";
import { getLicit, getOrgao, getProp } from "../core/domain.js";
import { ssel } from "../core/ssel.js";
import { opcoesOrgaos } from "./licitacoes.js";
import { opcoesPropostas } from "./atas.js";
import { novoDoc, cabecalho, rodape, tituloSecao, assinatura, tabelaPadrao, AZUL, VERDE } from "../core/pdf.js";

export const OBS_PADRAO = "Declaramos, para os devidos fins, que a formação dos preços desta proposta observou a seguinte metodologia: (i) apuração do valor de custo do item; (ii) aplicação de percentual de imposto estimado incidente sobre o custo; (iii) inclusão do valor de frete e demais despesas acessórias; (iv) definição do preço de venda; e (v) apuração do lucro real em moeda corrente (R$) e em percentual sobre a venda. A composição assegura a cobertura de custos diretos e indiretos, demonstrando a exequibilidade da proposta, em conformidade com as condições usuais de mercado e princípios da economicidade.";
export function calcExeq(custo, imposto, frete, preco, qtde) {
  const impostoVal = preco * (imposto / 100), freteVal = preco * (frete / 100), lucro = preco - custo - impostoVal - freteVal, margem = preco > 0 ? lucro / preco * 100 : 0;
  return { impostoVal, freteVal, lucro, margem, statusCalc: margem >= 15 ? "exequivel" : margem >= 5 ? "atencao" : "inexequivel", lucroTotal: lucro * qtde, receita: preco * qtde };
}
const ST = { exequivel: ["Exequível", "tag-green"], atencao: ["Atenção", "tag-amber"], inexequivel: ["Inexequível", "tag-red"] };
const stTag = (s) => tag(ST[s]?.[0] || "—", ST[s]?.[1] || "tag-gray");
let unsub = null, stFiltro = "";

export default {
  id: "exequibilidade", titulo: "Exequibilidade", grupo: "Pós-licitação", icone: "scale",

  render(el) {
    el.innerHTML = `
      <div class="grid grid-6" id="kpis" style="margin-bottom:16px"></div>
      <div class="page-head"><h2>Análises de exequibilidade</h2><div class="actions">
        <button class="btn btn-ghost" data-act="pdf-todas">${icon("print")} PDF geral</button><button class="btn btn-ghost" data-act="excel">${icon("download")} Excel</button>
        ${podeEditar() ? `<button class="btn btn-primary" data-act="novo">${icon("plus")} Nova análise</button>` : ""}</div></div>
      <div class="card"><div class="chip-filters"><span class="muted">Resultado:</span>
        ${[["", "Todos"], ["exequivel", "Exequível"], ["atencao", "Atenção"], ["inexequivel", "Inexequível"]].map(([v, t]) => `<button class="chip ${stFiltro === v ? "active" : ""}" data-act="st" data-id="${v}">${t}</button>`).join("")}</div>
        <div class="card-body flush" id="tbl"></div></div>`;

    const linhas = () => store.get("exequibilidade").filter((e) => !stFiltro || (e.itens || []).some((i) => i.statusCalc === stFiltro));
    const kpis = () => { const d = linhas(); const it = d.flatMap((e) => e.itens || []); const mm = it.length ? it.reduce((s, i) => s + (+i.margem || 0), 0) / it.length : 0;
      el.querySelector("#kpis").innerHTML = `
        <div class="kpi"><div class="kpi-label">Análises</div><div class="kpi-value">${d.length}</div></div>
        <div class="kpi"><div class="kpi-label">Itens</div><div class="kpi-value">${it.length}</div></div>
        <div class="kpi"><div class="kpi-label">Exequíveis</div><div class="kpi-value" style="color:var(--green)">${it.filter((i) => i.statusCalc === "exequivel").length}</div></div>
        <div class="kpi"><div class="kpi-label">Atenção</div><div class="kpi-value" style="color:var(--amber-txt)">${it.filter((i) => i.statusCalc === "atencao").length}</div></div>
        <div class="kpi"><div class="kpi-label">Inexequíveis</div><div class="kpi-value" style="color:var(--red)">${it.filter((i) => i.statusCalc === "inexequivel").length}</div></div>
        <div class="kpi"><div class="kpi-label">Margem média</div><div class="kpi-value" style="color:${mm >= 15 ? "var(--green)" : mm >= 5 ? "var(--amber-txt)" : "var(--red)"}">${mm.toFixed(1)}%</div></div>`; };

    const tabela = dataTable({
      el: el.querySelector("#tbl"), rows: linhas,
      search: (e, q) => [e.uasg, e.pregao, e.orgaoNome, ...(e.itens || []).map((i) => i.item)].some((x) => (x || "").toLowerCase().includes(q)),
      placeholder: "Buscar UASG, pregão, órgão ou item…", sort: { key: "criadoEm", dir: "desc" }, empty: "Nenhuma análise cadastrada",
      columns: [
        { key: "pregao", label: "Pregão", render: (e) => `<strong>${esc(e.pregao || "—")}</strong><div class="muted" style="font-size:11px">UASG ${esc(e.uasg || "—")}</div>` },
        { key: "orgaoNome", label: "Órgão", render: (e) => esc(toTitleCase(e.orgaoNome || "—")) },
        { key: "itens", label: "Itens", num: true, sort: (e) => (e.itens || []).length, render: (e) => String((e.itens || []).length) },
        { key: "imposto", label: "Imposto / frete", render: (e) => `${(+e.imposto || 0).toFixed(2)}% / ${(+e.frete || 0).toFixed(2)}%` },
        { key: "receita", label: "Receita", num: true, sort: (e) => (e.itens || []).reduce((s, i) => s + (i.receita || 0), 0), render: (e) => fmt((e.itens || []).reduce((s, i) => s + (i.receita || 0), 0)) },
        { key: "lucro", label: "Lucro", num: true, sort: (e) => (e.itens || []).reduce((s, i) => s + (i.lucroTotal || 0), 0), render: (e) => { const l = (e.itens || []).reduce((s, i) => s + (i.lucroTotal || 0), 0); return `<strong style="color:${l >= 0 ? "var(--green)" : "var(--red)"}">${fmt(l)}</strong>`; } },
        { key: "margem", label: "Margem média", num: true, sort: (e) => media(e), render: (e) => { const m = media(e); return `<strong style="color:${m >= 15 ? "var(--green)" : m >= 5 ? "var(--amber-txt)" : "var(--red)"}">${m.toFixed(1)}%</strong>`; } },
        { key: "status", label: "Resultado", sort: false, render: (e) => { const it = e.itens || []; const n = (s) => it.filter((i) => i.statusCalc === s).length; return [n("exequivel") ? tag(`${n("exequivel")} ok`, "tag-green") : "", n("atencao") ? tag(`${n("atencao")} atenção`, "tag-amber") : "", n("inexequivel") ? tag(`${n("inexequivel")} inexeq.`, "tag-red") : ""].filter(Boolean).join(" "); } },
        { key: "criadoEm", label: "", sort: (e) => e.criadoEm || "", width: "120px", render: (e) => acoes(`<button class="icon-btn sm" data-act="pdf" data-id="${esc(e.id)}" title="Declaração PDF">${icon("print")}</button>`, ...(podeEditar() ? [btnEditar(e.id), btnExcluir(e.id)] : [])) },
      ],
    });
    onAction(el, {
      st: (id) => { stFiltro = id; el.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.id === id)); kpis(); tabela.refresh(); },
      novo: () => abrirForm(), editar: (id) => abrirForm(store.find("exequibilidade", id)),
      pdf: (id) => pdfDeclaracao(store.find("exequibilidade", id)), "pdf-todas": () => pdfGeral(linhas()),
      excluir: async (id) => { if (!await confirmar("Excluir esta análise?", { ok: "Excluir", perigo: true })) return; await store.remove("exequibilidade", id); toast("Análise excluída."); },
      excel: () => exportarExcel(store.get("exequibilidade").flatMap((e) => (e.itens || []).map((it) => ({ UASG: e.uasg || "", Pregão: e.pregao || "", Órgão: e.orgaoNome || "", "Nº Item": it.numItem || "", Descrição: it.item || "", Qtde: it.qtde || 0, "Custo Un.": it.custo || 0, "Preço Un.": it.precoUnit || 0, "Imposto %": e.imposto || 0, "Frete %": e.frete || 0, "Imposto (R$)": it.impostoVal || 0, "Frete (R$)": it.freteVal || 0, "Lucro Un.": it.lucro || 0, "Margem %": (+it.margem || 0).toFixed(2), Status: ST[it.statusCalc]?.[0] || "" }))), "Exequibilidade", "exequibilidade"),
    });
    kpis(); unsub = store.on("*", () => { kpis(); tabela.refresh(); });
  },
  destroy() { unsub?.(); stFiltro = ""; },
};
const media = (e) => { const it = e.itens || []; return it.length ? it.reduce((s, i) => s + (+i.margem || 0), 0) / it.length : 0; };

function linhaItem(it = {}) {
  return `<tr class="ex-item"><td><input type="number" class="input input-sm" name="n" value="${esc(it.numItem ?? "")}" min="1" style="width:60px"></td>
    <td><input type="text" class="input input-sm" name="d" value="${esc(it.item || "")}" placeholder="Descrição do item" style="width:100%"></td>
    <td><input type="number" class="input input-sm" name="q" value="${esc(it.qtde ?? "")}" min="0" style="width:80px"></td>
    <td><input type="number" class="input input-sm" name="c" value="${esc(it.custo ?? "")}" min="0" step="0.01" style="width:100px"></td>
    <td><input type="number" class="input input-sm" name="p" value="${esc(it.precoUnit ?? "")}" min="0" step="0.01" style="width:100px"></td>
    <td class="num" data-l>—</td><td class="num" data-m>—</td><td data-s>—</td><td><button type="button" class="icon-btn sm danger" data-rm>${icon("x")}</button></td></tr>`;
}

function abrirForm(e = null) {
  let orgSel, propSel; let origem = e && !e.propostaId && (e.uasg || e.pregao) ? "avulso" : "proposta";
  const pOld = e?.propostaId ? getProp(e.propostaId) : null; const lOld = pOld ? getLicit(pOld.licitacaoId) : null;
  formModal({
    titulo: e ? "Editar análise de exequibilidade" : "Nova análise de exequibilidade", largura: "xl",
    extra: `<button type="button" class="btn btn-ghost" data-pdf>${icon("print")} Declaração PDF</button>`,
    corpo: `
      <div class="field"><span>Origem</span><div style="display:flex;gap:16px;margin-top:4px"><label class="switch"><input type="radio" name="origem" value="proposta" ${origem === "proposta" ? "checked" : ""}> Proposta existente</label><label class="switch"><input type="radio" name="origem" value="avulso" ${origem === "avulso" ? "checked" : ""}> Avulso (manual)</label></div></div>
      <div id="sec-prop">${linha(`<div class="field"><span>Órgão</span><div id="org-ssel"></div></div>`, `<div class="field"><span>Pregão / proposta</span><div id="prop-ssel"></div></div>`)}</div>
      <div id="sec-av" hidden>${linha(campo("UASG", inputTxt("uasg", e?.uasg || "")), campo("Pregão / nº", inputTxt("pregao", e?.pregao || "")), campo("Órgão", inputTxt("orgaoNome", e?.orgaoNome || "")))}</div>
      ${linha(campo("Imposto % (sobre o preço de venda)", inputNum("imposto", e?.imposto ?? "", 'step="0.01" min="0" max="100"')), campo("Frete % (sobre o preço de venda)", inputNum("frete", e?.frete ?? "", 'step="0.01" min="0"')))}
      <p class="help">Lucro = Preço − Custo − (Preço × Imposto%) − (Preço × Frete%) &nbsp;|&nbsp; Margem = Lucro ÷ Preço × 100 &nbsp;|&nbsp; ≥ 15% exequível · 5–15% atenção · &lt; 5% inexequível</p>
      <div class="table-wrap"><table><thead><tr><th>Nº</th><th>Descrição</th><th>Qtde</th><th>Custo un.</th><th>Preço un.</th><th class="num">Lucro un.</th><th class="num">Margem</th><th>Status</th><th></th></tr></thead><tbody id="ex-itens"></tbody></table></div>
      <div><button type="button" class="btn btn-ghost btn-sm" data-add>${icon("plus")} Adicionar item</button></div>
      <div class="totais" id="ex-tot" hidden><div><span class="muted">Receita total</span><strong id="t-rec"></strong></div><div><span class="muted">Lucro total</span><strong id="t-luc"></strong></div><div><span class="muted">Margem média</span><strong id="t-mar"></strong></div><div class="total-geral"><span class="muted">Itens</span><strong id="t-n"></strong></div></div>
      ${linha(campo("Declaração (texto padrão pré-preenchido)", textarea("obs", e?.obs ?? OBS_PADRAO, 'style="min-height:90px;font-size:12.5px"')))}`,
    onAberto(form, m) {
      const tb = form.querySelector("#ex-itens"); const secP = form.querySelector("#sec-prop"), secA = form.querySelector("#sec-av");
      const add = (it) => { tb.insertAdjacentHTML("beforeend", linhaItem(it)); calc(); };
      const calc = () => { const imp = +form.imposto.value || 0, fr = +form.frete.value || 0; let rec = 0, luc = 0, ms = [];
        tb.querySelectorAll(".ex-item").forEach((r) => { const c = +r.querySelector("[name=c]").value || 0, p = +r.querySelector("[name=p]").value || 0, q = +r.querySelector("[name=q]").value || 0;
          const L = r.querySelector("[data-l]"), M = r.querySelector("[data-m]"), S = r.querySelector("[data-s]");
          if (!p) { L.textContent = "—"; M.textContent = "—"; S.innerHTML = "—"; return; }
          const v = calcExeq(c, imp, fr, p, q); L.textContent = fmt(v.lucro); L.style.color = v.lucro >= 0 ? "var(--green)" : "var(--red)"; M.textContent = v.margem.toFixed(2) + "%"; M.style.color = v.margem >= 15 ? "var(--green)" : v.margem >= 5 ? "var(--amber-txt)" : "var(--red)"; S.innerHTML = stTag(v.statusCalc);
          rec += v.receita; luc += v.lucroTotal; ms.push(v.margem); });
        const tot = form.querySelector("#ex-tot"); tot.hidden = !ms.length; if (ms.length) { const mm = ms.reduce((s, x) => s + x, 0) / ms.length; form.querySelector("#t-rec").textContent = fmt(rec); form.querySelector("#t-luc").textContent = fmt(luc); form.querySelector("#t-mar").textContent = mm.toFixed(2) + "%"; form.querySelector("#t-n").textContent = ms.length; } };
      form.addEventListener("input", calc);
      tb.addEventListener("click", (ev) => { const b = ev.target.closest("[data-rm]"); if (b) { b.closest("tr").remove(); calc(); } });
      form.querySelector("[data-add]").addEventListener("click", () => add());
      const carregarDaProposta = (pid) => { const p = getProp(pid); if (!p) return; tb.innerHTML = ""; (p.itens || []).forEach((it) => add({ numItem: it.num || "", item: it.nome || "", qtde: it.qtd || "", custo: it.custo || "", precoUnit: it.preco || "" })); if (!(p.itens || []).length) add(); };
      form.querySelectorAll("[name=origem]").forEach((r) => r.addEventListener("change", () => { origem = r.value; secP.hidden = origem !== "proposta"; secA.hidden = origem !== "avulso"; }));
      secP.hidden = origem !== "proposta"; secA.hidden = origem !== "avulso";
      orgSel = ssel(form.querySelector("#org-ssel"), { placeholder: "Nome, UASG ou CNPJ do órgão…", itens: opcoesOrgaos(), value: lOld?.orgaoId || "", onSelect: (id) => { propSel.setItens(opcoesPropostas(id)); propSel.setValue(""); id ? propSel.enable("Selecione a proposta…") : propSel.disable("Selecione um órgão primeiro…"); } });
      propSel = ssel(form.querySelector("#prop-ssel"), { placeholder: "Selecione um órgão primeiro…", itens: lOld ? opcoesPropostas(lOld.orgaoId) : [], value: e?.propostaId || "", disabled: !lOld, onSelect: carregarDaProposta });
      (e?.itens?.length ? e.itens : [{}]).forEach(add);
      m.querySelector("[data-pdf]").addEventListener("click", () => { try { pdfDeclaracao(montar(form)); } catch (err) { toast(err.message, "erro"); } });
      form._montar = () => montar(form);
      function montar(form) {
        const imp = +form.imposto.value || 0, fr = +form.frete.value || 0; const itens = [];
        tb.querySelectorAll(".ex-item").forEach((r) => { const d = r.querySelector("[name=d]").value.trim(), p = +r.querySelector("[name=p]").value || 0, c = +r.querySelector("[name=c]").value || 0, q = +r.querySelector("[name=q]").value || 0, n = r.querySelector("[name=n]").value.trim();
          if (!d && !p) return; if (!d) throw new Error("Informe a descrição do item."); if (!p) throw new Error("Informe o preço unitário do item.");
          itens.push({ numItem: n, item: d, qtde: q, custo: c, precoUnit: p, ...calcExeq(c, imp, fr, p, q) }); });
        if (!itens.length) throw new Error("Adicione ao menos um item.");
        let uasg = "", pregao = "", orgaoNome = "", propostaId = "";
        if (origem === "proposta") { propostaId = propSel.value; const p = getProp(propostaId); const l = getLicit(p?.licitacaoId); const o = getOrgao(l?.orgaoId || orgSel.value); uasg = o.uasg || ""; pregao = l?.numero || ""; orgaoNome = o.nome || ""; }
        else { uasg = form.uasg.value.trim(); pregao = form.pregao.value.trim(); orgaoNome = form.orgaoNome.value.trim(); }
        return { ...(e || {}), id: e?.id || "exeq_" + Date.now(), propostaId, uasg, pregao, orgaoNome, imposto: imp, frete: fr, itens, obs: form.obs.value, criadoEm: e?.criadoEm || new Date().toISOString() };
      }
    },
    async onSalvar(form) { const reg = form._montar(); await store.setItem("exequibilidade", reg); closeModal(); toast(`${reg.itens.length} item(ns) salvos.`); },
  });
}

async function pdfDeclaracao(e) {
  if (!e) return; const doc = await novoDoc("landscape"); const { _W: W, _ML: ML, _MR: MR, _CW: CW } = doc;
  const imp = +e.imposto || 0, fr = +e.frete || 0, itens = e.itens || [];
  const o = e.propostaId ? getOrgao(getLicit(getProp(e.propostaId)?.licitacaoId)?.orgaoId) : {};
  let y = cabecalho(doc, "DECLARAÇÃO DE EXEQUIBILIDADE"); y = tituloSecao(doc, y, "DADOS DA LICITAÇÃO") - 2;
  doc.autoTable({ ...tabelaPadrao({ styles: { fontSize: 8, cellPadding: 3.5, textColor: [30, 41, 59] } }), startY: y, margin: { left: ML, right: MR }, head: [["Órgão", "UASG", "Pregão / Nº", "CNPJ"]], body: [[toTitleCase(e.orgaoNome || "—"), e.uasg || "—", e.pregao || "—", o.cnpj || "—"]], columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 25 }, 2: { cellWidth: 40 }, 3: { cellWidth: 50 } } });
  y = doc.lastAutoTable.finalY + 5; y = tituloSecao(doc, y, `COMPOSIÇÃO DE PREÇOS — Imposto: ${imp.toFixed(2)}%  |  Frete: ${fr.toFixed(2)}%`) - 2;
  const vals = itens.map((it) => calcExeq(+it.custo || 0, imp, fr, +it.precoUnit || 0, +it.qtde || 0));
  doc.autoTable({ ...tabelaPadrao({ styles: { fontSize: 8, cellPadding: 4, valign: "middle", textColor: [30, 41, 59] }, headStyles: { fillColor: AZUL, textColor: 255, fontStyle: "bold", fontSize: 7, cellPadding: 3.5, halign: "center" } }), startY: y, margin: { left: ML, right: MR },
    head: [["Nº", "Descrição do Item", "Qtde", "Custo Un. (R$)", "Preço Venda Un. (R$)", "Imposto (R$)", "Frete (R$)", "Lucro Un. (R$)", "Margem %"]],
    body: itens.map((it, i) => [String(it.numItem || "—"), it.item, fmtNum(it.qtde), fmt(it.custo), fmt(it.precoUnit), fmt(vals[i].impostoVal), fmt(vals[i].freteVal), fmt(vals[i].lucro), vals[i].margem.toFixed(2) + "%"]),
    columnStyles: { 0: { cellWidth: 14, halign: "center" }, 1: { cellWidth: 90 }, 2: { cellWidth: 16, halign: "right" }, 3: { cellWidth: 26, halign: "right" }, 4: { cellWidth: 30, halign: "right" }, 5: { cellWidth: 26, halign: "right" }, 6: { cellWidth: 26, halign: "right" }, 7: { cellWidth: 26, halign: "right" }, 8: { cellWidth: 20, halign: "center" } } });
  y = doc.lastAutoTable.finalY + 5;
  const rec = vals.reduce((s, v) => s + v.receita, 0), luc = vals.reduce((s, v) => s + v.lucroTotal, 0), mm = vals.length ? vals.reduce((s, v) => s + v.margem, 0) / vals.length : 0;
  doc.autoTable({ ...tabelaPadrao({ styles: { fontSize: 8.5, cellPadding: 4, fontStyle: "bold", halign: "right", textColor: [30, 41, 59] }, headStyles: { fillColor: VERDE, textColor: 255, fontStyle: "bold", fontSize: 7, cellPadding: 3.5, halign: "center" } }), startY: y, margin: { left: ML, right: MR }, head: [["Receita Total (R$)", "Lucro Total (R$)", "Margem Média %", "Qtde de Itens"]], body: [[fmt(rec), fmt(luc), mm.toFixed(2) + "%", itens.length]] });
  y = doc.lastAutoTable.finalY + 6;
  if (e.obs) { y = tituloSecao(doc, y, "DECLARAÇÃO"); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(50, 50, 50); const ls = doc.splitTextToSize(e.obs, CW); doc.text(ls, ML, y); y += ls.length * 3.8 + 8; }
  if (y > doc._H - 30) { doc.addPage(); cabecalho(doc, "DECLARAÇÃO DE EXEQUIBILIDADE"); y = 30; }
  assinatura(doc, y); rodape(doc, "Declaração de exequibilidade"); doc.save(`exequibilidade_${(e.pregao || e.id).replace(/\//g, "-")}.pdf`); toast("PDF gerado.");
}

async function pdfGeral(lista) {
  if (!lista.length) return toast("Nenhuma análise para imprimir.", "info");
  const doc = await novoDoc("landscape"); let y = cabecalho(doc, "ANÁLISE DE EXEQUIBILIDADE");
  const body = lista.flatMap((e) => (e.itens || []).map((it) => { const v = calcExeq(+it.custo || 0, +e.imposto || 0, +e.frete || 0, +it.precoUnit || 0, +it.qtde || 0);
    return [e.uasg || "—", e.pregao || "—", (e.orgaoNome || "—").slice(0, 22), String(it.numItem || "—"), (it.item || "—").slice(0, 30), fmtNum(it.qtde), fmt(it.custo), fmt(it.precoUnit), (+e.imposto || 0).toFixed(2) + "%", (+e.frete || 0).toFixed(2) + "%", fmt(v.lucro), v.margem.toFixed(2) + "%", ST[v.statusCalc][0]]; }));
  doc.autoTable({ ...tabelaPadrao({ styles: { fontSize: 7, cellPadding: 3 }, headStyles: { fillColor: AZUL, textColor: 255, fontStyle: "bold", fontSize: 6.5 } }), startY: y, margin: { left: doc._ML, right: doc._MR },
    head: [["UASG", "Pregão", "Órgão", "Nº", "Descrição", "Qtde", "Custo Un.", "Preço Un.", "Imp %", "Frete %", "Lucro Un.", "Margem %", "Status"]], body,
    columnStyles: { 0: { cellWidth: 16 }, 1: { cellWidth: 22 }, 2: { cellWidth: 28 }, 3: { cellWidth: 8, halign: "center" }, 4: { cellWidth: 35 }, 5: { cellWidth: 12, halign: "right" }, 6: { cellWidth: 18, halign: "right" }, 7: { cellWidth: 18, halign: "right" }, 8: { cellWidth: 11, halign: "right" }, 9: { cellWidth: 11, halign: "right" }, 10: { cellWidth: 18, halign: "right" }, 11: { cellWidth: 16, halign: "right" }, 12: { cellWidth: 18, halign: "center" } } });
  rodape(doc, "Análise de exequibilidade"); doc.save("exequibilidade_rlux.pdf"); toast("PDF gerado.");
}

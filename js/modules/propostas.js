// Propostas. Campos: id, num, licitacaoId, status, criadoEm, itens[], espelhoDeAtaId?, geracao?
// item: { num, produtoId, nome, codigo, marca, qtd, custo, preco, total }
import { store, newId } from "../core/store.js";
import { dataTable, acoes, btnEditar, btnExcluir, onAction } from "../core/table.js";
import { formModal, lerForm, campo, select, linha, exportarExcel } from "../core/forms.js";
import { toast, confirmar, closeModal, openModal, icon, tag } from "../core/ui.js";
import { esc, h, raw, fmt, fmtD, fmtNum, toTitleCase, diasAte } from "../core/utils.js";
import { podeEditar } from "../core/auth.js";
import { getLicit, getOrgao, getPortal, getCat, propTotal, propEmpenhado, propMargem, isEspelho, ataDaProposta, STATUS_CLASS, STATUS_VENCIDO } from "../core/domain.js";
import { ssel } from "../core/ssel.js";
import { opcoesOrgaos } from "./licitacoes.js";
import { gerarPdfProposta } from "../pdf/proposta.js";

export const STATUS = ["Em Andamento", "Ag. Solic. Docs", "Enviei Docs", "Faturado Parcial", "Faturado Total", "Vencida", "Perdida"];
let unsub = null;
let stFiltro = "", verEspelhos = false;

export const opcoesLicitacoes = (orgaoId) => store.get("licitacoes").filter((l) => l.orgaoId === orgaoId)
  .sort((a, b) => (b.data || "").localeCompare(a.data || ""))
  .map((l) => ({ id: l.id, label: `${l.numero} — ${l.tipo || "?"}`, sub: `${fmtD(l.data)} · Portal ${getPortal(l.portalId).sigla || "—"}` }));

export default {
  id: "propostas", titulo: "Propostas", grupo: "Licitações", icone: "file",

  render(el) {
    el.innerHTML = `
      <div class="grid grid-4" id="kpis" style="margin-bottom:16px"></div>
      <div class="page-head"><h2>Propostas</h2>
        <div class="actions">
          <button class="btn btn-ghost" data-act="excel">${icon("download")} Excel</button>
          ${podeEditar() ? `<button class="btn btn-primary" data-act="novo">${icon("plus")} Nova proposta</button>` : ""}
        </div></div>
      <div class="card">
        <div class="chip-filters">
          <span class="muted">Status:</span>
          <button class="chip ${!stFiltro ? "active" : ""}" data-act="st" data-id="">Todos</button>
          ${STATUS.map((s) => `<button class="chip ${stFiltro === s ? "active" : ""}" data-act="st" data-id="${s}">${s}</button>`).join("")}
          <label class="switch" style="margin-left:auto"><input type="checkbox" id="chk-esp" ${verEspelhos ? "checked" : ""}> Mostrar renovações de ATA</label>
        </div>
        <div class="card-body flush" id="tbl"></div></div>`;

    const hoje = new Date();
    const linhas = () => store.get("propostas").filter((p) => (verEspelhos || !isEspelho(p)) && (!stFiltro || (p.status || "Em Andamento") === stFiltro));

    const kpis = () => {
      const data = linhas();
      const venc = data.filter((p) => STATUS_VENCIDO.includes(p.status)).reduce((s, p) => s + propTotal(p), 0);
      const emp = data.reduce((s, p) => s + propEmpenhado(p.id), 0);
      const v30 = data.filter((p) => { const a = ataDaProposta(p.id); const d = a?.vencimento ? diasAte(a.vencimento) : null; return d !== null && d >= 0 && d <= 30; }).length;
      el.querySelector("#kpis").innerHTML = `
        <div class="kpi"><div class="kpi-label">Propostas</div><div class="kpi-value">${data.length}</div></div>
        <div class="kpi"><div class="kpi-label">Valor vencido</div><div class="kpi-value" style="color:var(--green)">${fmt(venc)}</div></div>
        <div class="kpi"><div class="kpi-label">Total empenhado</div><div class="kpi-value">${fmt(emp)}</div></div>
        <div class="kpi"><div class="kpi-label">ATAs vencendo em 30 dias</div><div class="kpi-value" style="color:${v30 ? "var(--amber-txt)" : "inherit"}">${v30}</div></div>`;
    };

    const tabela = dataTable({
      el: el.querySelector("#tbl"), rows: linhas,
      search: (p, q) => { const l = getLicit(p.licitacaoId), o = getOrgao(l.orgaoId); return [String(p.num), l.numero, l.tipo, o.nome, o.uasg, o.cnpj, p.status, fmtD(l.data), ...(o.contatos || []).map((c) => c.email)].some((x) => (x || "").toLowerCase().includes(q)); },
      placeholder: "Buscar nº, pregão, órgão, UASG, status…",
      sort: { key: "data", dir: "desc" }, empty: "Nenhuma proposta",
      columns: [
        { key: "data", label: "Data lic.", width: "95px", sort: (p) => getLicit(p.licitacaoId).data || "", render: (p) => fmtD(getLicit(p.licitacaoId).data) },
        { key: "numero", label: "Pregão / Nº", sort: (p) => getLicit(p.licitacaoId).numero || "", render: (p) => { const l = getLicit(p.licitacaoId);
          return `<strong>${esc(l.numero || "?")}</strong>${isEspelho(p) ? ` ${tag(`${p.geracao || 2}ª vig.`, "tag-purple")}` : ""}${p.origemIA ? ` ${tag("IA", "tag-teal")}` : ""}<div class="muted" style="font-size:11px">${esc(l.tipo || "")} · #${p.num || "?"}</div>`; } },
        { key: "uasg", label: "UASG", width: "85px", sort: (p) => getOrgao(getLicit(p.licitacaoId).orgaoId).uasg || "", render: (p) => { const u = getOrgao(getLicit(p.licitacaoId).orgaoId).uasg; return u ? tag(u, "tag-purple") : "—"; } },
        { key: "orgao", label: "Órgão", sort: (p) => getOrgao(getLicit(p.licitacaoId).orgaoId).nome || "", render: (p) => esc(toTitleCase(getOrgao(getLicit(p.licitacaoId).orgaoId).nome || "—")) },
        { key: "itens", label: "Itens", num: true, sort: (p) => (p.itens || []).length, render: (p) => String((p.itens || []).length) },
        { key: "total", label: "Total / empenho", num: true, sort: (p) => propTotal(p), render: (p) => { const t = propTotal(p), e = propEmpenhado(p.id), pct = t ? Math.round(e / t * 100) : 0;
          return `<strong>${fmt(t)}</strong><div class="prog"><div class="prog-fill ${pct >= 100 ? "full" : ""}" style="width:${Math.min(pct, 100)}%"></div></div><span class="muted" style="font-size:11px">${pct}% empenhado</span>`; } },
        { key: "emp", label: "Empenhado", num: true, sort: (p) => propEmpenhado(p.id), render: (p) => `<span style="color:var(--green)">${fmt(propEmpenhado(p.id))}</span>` },
        { key: "margem", label: "Margem", num: true, sort: (p) => propMargem(p) ?? -Infinity, render: (p) => { const m = propMargem(p); if (m === null) return '<span class="muted">—</span>';
          return `<strong style="color:${m >= 15 ? "var(--green)" : m >= 0 ? "var(--amber-txt)" : "var(--red)"}">${m.toFixed(1)}%</strong>`; } },
        { key: "venc", label: "Venc. ATA", sort: (p) => ataDaProposta(p.id)?.vencimento || "", render: (p) => { const a = ataDaProposta(p.id); if (!a?.vencimento) return '<span class="muted">—</span>'; const d = diasAte(a.vencimento);
          return tag(`${fmtD(a.vencimento)} (${d}d)`, d < 0 ? "tag-red" : d <= 30 ? "tag-orange" : d <= 60 ? "tag-amber" : "tag-green"); } },
        { key: "status", label: "Status", render: (p) => tag(p.status || "Em Andamento", STATUS_CLASS[p.status || "Em Andamento"] || "tag-gray") },
        { key: "acoes", label: "", sort: false, width: "120px", render: (p) => acoes(
          `<button class="icon-btn sm" data-act="pdf" data-id="${esc(p.id)}" title="Gerar PDF">${icon("print")}</button>`,
          ...(podeEditar() ? [btnEditar(p.id), btnExcluir(p.id, ataDaProposta(p.id) ? "Tem ATA vinculada" : "")] : [])) },
      ],
    });

    el.querySelector("#chk-esp").addEventListener("change", (e) => { verEspelhos = e.target.checked; kpis(); tabela.refresh(); });
    onAction(el, {
      st: (id) => { stFiltro = id; el.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.id === id)); kpis(); tabela.refresh(); },
      novo: () => abrirForm(),
      editar: (id) => abrirForm(store.find("propostas", id)),
      pdf: (id) => opcoesPdf(store.find("propostas", id)),
      excluir: async (id) => {
        if (!await confirmar("Excluir esta proposta?", { ok: "Excluir", perigo: true })) return;
        await store.remove("propostas", id); toast("Proposta excluída.");
      },
      excel: () => exportarExcel(store.get("propostas").filter((p) => !isEspelho(p)).map((p) => { const l = getLicit(p.licitacaoId), o = getOrgao(l.orgaoId), a = ataDaProposta(p.id);
        return { "Nº": p.num || "", "Data licitação": fmtD(l.data), "Pregão/Nº": l.numero || "", Tipo: l.tipo || "", UASG: o.uasg || "", Órgão: o.nome || "", Itens: (p.itens || []).length, Total: propTotal(p), Empenhado: propEmpenhado(p.id), "Margem %": propMargem(p)?.toFixed(1) || "", "Venc. ATA": a?.vencimento ? fmtD(a.vencimento) : "", Status: p.status || "Em Andamento" }; }), "Propostas", "propostas"),
    });

    kpis();
    unsub = store.on("*", () => { kpis(); tabela.refresh(); });
  },

  destroy() { unsub?.(); stFiltro = ""; },
};

// ---------- formulário ----------
let seq = 0;
function itemHtml(d = {}) {
  const k = ++seq;
  return `<div class="item" data-k="${k}">
    <div class="item-top">
      <span class="item-warn tag tag-amber" ${d.produtoId ? "hidden" : ""}>${icon("alert", "ic-inline")} Sem produto do catálogo</span>
      <span class="item-tools">
        <button type="button" class="btn btn-ghost btn-sm" data-ins title="Inserir item acima">${icon("plus")} acima</button>
        <button type="button" class="icon-btn sm" data-dup title="Duplicar">${icon("doc")}</button>
        <button type="button" class="icon-btn sm danger" data-rm title="Remover">${icon("x")}</button>
      </span>
    </div>
    <div class="form-row cols-4" style="grid-template-columns:70px 1fr 1fr 1fr">
      ${campo("Nº", `<input type="number" name="num" value="${esc(d.num ?? "")}" min="1" placeholder="item do edital">`)}
      <div class="field" style="grid-column:span 3"><span>Produto do catálogo</span><div class="prod-ssel"></div></div>
    </div>
    <div class="form-row cols-3">
      ${campo("Descrição", `<input type="text" name="nome" value="${esc(d.nome || "")}" required>`)}
      ${campo("Código", `<input type="text" name="codigo" value="${esc(d.codigo || "")}">`)}
      ${campo("Marca", `<input type="text" name="marca" value="${esc(d.marca || "")}">`)}
    </div>
    <div class="form-row" style="grid-template-columns:repeat(5,1fr)">
      ${campo("Qtd", `<input type="number" name="qtd" value="${esc(d.qtd ?? 1)}" min="0.01" step="0.01">`)}
      ${campo("Custo", `<input type="number" name="custo" value="${esc(d.custo ?? 0)}" step="0.01" min="0">`)}
      ${campo("Preço de venda", `<input type="number" name="preco" value="${esc(d.preco ?? 0)}" step="0.01" min="0">`)}
      ${campo("Margem", `<input type="text" class="ro-margem" readonly><div class="prog"><div class="prog-fill mg-bar"></div></div>`)}
      ${campo("Total", `<input type="text" class="ro-total" readonly>`)}
    </div>
    <input type="hidden" name="produtoId" value="${esc(d.produtoId || "")}">
  </div>`;
}

function abrirForm(p = null) {
  let orgSel, licSel;
  const prodOpts = () => store.get("produtos").map((x) => ({ id: x.id, label: `${x.codigo} — ${x.nome}`, sub: `${x.marca || ""} · ${getCat(x.catId).nome || ""} · custo ${fmt(x.custo)}` }));
  const lOld = p ? getLicit(p.licitacaoId) : null;

  const { form } = formModal({
    titulo: p ? `Editar proposta #${p.num || ""}` : "Nova proposta", largura: "xl",
    extra: p ? `<button type="button" class="btn btn-ghost" data-pdf>${icon("print")} PDF</button>` : "",
    corpo:
      linha(`<div class="field"><span>Órgão</span><div id="org-ssel"></div></div>`, `<div class="field"><span>Pregão / licitação</span><div id="lic-ssel"></div></div>`, campo("Status", select("status", STATUS, p?.status || "Em Andamento")))
      + `<div id="lic-info" class="info-box" hidden></div>
         <div class="form-section"><span>Itens</span><button type="button" class="btn btn-ghost btn-sm" data-add>${icon("plus")} Item</button></div>
         <div id="itens"></div>
         <div class="totais"><div><span class="muted">Custo total</span><strong id="t-custo">R$ 0,00</strong></div><div><span class="muted">Margem geral</span><strong id="t-margem">—</strong></div><div class="total-geral"><span class="muted">Total</span><strong id="t-total">R$ 0,00</strong></div></div>`,
    onAberto(form, m) {
      orgSel = ssel(form.querySelector("#org-ssel"), { placeholder: "Nome, UASG, CNPJ ou e-mail do órgão…", itens: opcoesOrgaos(), value: lOld?.orgaoId || "",
        onSelect: (id) => { licSel.setItens(opcoesLicitacoes(id)); licSel.setValue(""); id ? licSel.enable("Selecione o pregão…") : licSel.disable("Selecione um órgão primeiro…"); infoLic(""); } });
      licSel = ssel(form.querySelector("#lic-ssel"), { placeholder: "Selecione um órgão primeiro…", itens: lOld ? opcoesLicitacoes(lOld.orgaoId) : [], value: p?.licitacaoId || "", disabled: !lOld, onSelect: infoLic });
      if (lOld) infoLic(p.licitacaoId);

      const cont = form.querySelector("#itens");
      const addItem = (d, before) => { const tmp = document.createElement("div"); tmp.innerHTML = itemHtml(d); const node = tmp.firstElementChild; before ? cont.insertBefore(node, before) : cont.appendChild(node); ligarItem(node, d); calcTotais(); };
      function infoLic(id) { const l = getLicit(id), box = form.querySelector("#lic-info"); if (!l.id) { box.hidden = true; return; } const o = getOrgao(l.orgaoId);
        box.hidden = false; box.innerHTML = `<div><div class="k">Órgão</div>${esc(toTitleCase(o.nome || "—"))}</div><div><div class="k">UASG</div>${esc(o.uasg || "—")}</div><div><div class="k">Portal</div>${esc(getPortal(l.portalId).sigla || "—")}</div><div><div class="k">Data do pregão</div>${fmtD(l.data)}</div>`; }
      function ligarItem(node, d) {
        const ps = ssel(node.querySelector(".prod-ssel"), { placeholder: "Código ou nome do produto…", itens: prodOpts(), value: d.produtoId || "", onSelect: (id) => {
          const prod = store.find("produtos", id); node.querySelector("[name=produtoId]").value = id || ""; node.querySelector(".item-warn").hidden = !!id;
          if (prod) { node.querySelector("[name=nome]").value = prod.nome; node.querySelector("[name=codigo]").value = prod.codigo; node.querySelector("[name=marca]").value = prod.marca || "";
            node.querySelector("[name=custo]").value = prod.custo || 0; node.querySelector("[name=preco]").value = ((prod.custo || 0) * 1.3).toFixed(2); calcItem(node); } } });
        node.querySelectorAll("[name=qtd],[name=custo],[name=preco]").forEach((i) => i.addEventListener("input", () => calcItem(node)));
        node.querySelector("[data-rm]").addEventListener("click", () => { node.remove(); calcTotais(); });
        node.querySelector("[data-dup]").addEventListener("click", () => addItem({ ...lerItem(node), num: "" }, node.nextElementSibling));
        node.querySelector("[data-ins]").addEventListener("click", () => addItem({}, node));
        calcItem(node);
      }
      function calcItem(node) {
        const q = +node.querySelector("[name=qtd]").value || 0, c = +node.querySelector("[name=custo]").value || 0, v = +node.querySelector("[name=preco]").value || 0;
        node.querySelector(".ro-total").value = fmt(q * v);
        const mg = node.querySelector(".ro-margem"), bar = node.querySelector(".mg-bar");
        if (c > 0) { const pct = (v / c - 1) * 100; mg.value = pct.toFixed(1) + "%"; mg.style.color = pct >= 0 ? "var(--green)" : "var(--red)"; bar.style.width = Math.min(Math.abs(pct), 100) + "%"; bar.style.background = pct >= 0 ? "var(--green)" : "var(--red)"; }
        else { mg.value = "—"; mg.style.color = ""; bar.style.width = "0"; }
        calcTotais();
      }
      function calcTotais() {
        let venda = 0, custo = 0;
        cont.querySelectorAll(".item").forEach((n) => { const q = +n.querySelector("[name=qtd]").value || 0; venda += q * (+n.querySelector("[name=preco]").value || 0); custo += q * (+n.querySelector("[name=custo]").value || 0); });
        form.querySelector("#t-total").textContent = fmt(venda); form.querySelector("#t-custo").textContent = fmt(custo);
        const m = form.querySelector("#t-margem"); if (custo > 0) { const pct = (venda / custo - 1) * 100; m.textContent = pct.toFixed(1) + "%"; m.style.color = pct >= 0 ? "var(--green)" : "var(--red)"; } else { m.textContent = "—"; m.style.color = ""; }
      }
      form.querySelector("[data-add]").addEventListener("click", () => addItem({}));
      (p?.itens?.length ? p.itens : [{}]).forEach((d) => addItem(d));
      m.querySelector("[data-pdf]")?.addEventListener("click", () => opcoesPdf(p));
    },
    async onSalvar(form) {
      if (!licSel.value) throw new Error("Selecione a licitação.");
      const itens = [...form.querySelectorAll(".item")].map(lerItem);
      if (!itens.length) throw new Error("Adicione pelo menos um item.");
      if (itens.some((i) => !i.nome)) throw new Error("Todo item precisa de descrição.");
      const num = p?.num || Math.max(0, ...store.get("propostas").map((x) => +x.num || 0)) + 1;
      await store.setItem("propostas", { ...(p || {}), id: p?.id || newId(), num, licitacaoId: licSel.value, status: form.status.value, itens, criadoEm: p?.criadoEm || new Date().toISOString() });
      closeModal(); toast(p ? "Proposta atualizada." : `Proposta #${num} criada.`);
    },
  });
}

function lerItem(n) {
  const g = (name) => n.querySelector(`[name=${name}]`).value;
  const qtd = +g("qtd") || 0, preco = +g("preco") || 0;
  return { num: parseInt(g("num")) || "", produtoId: g("produtoId") || "", nome: g("nome").trim(), codigo: g("codigo").trim(), marca: g("marca").trim(), qtd, custo: +g("custo") || 0, preco, total: qtd * preco };
}

// ---------- PDF: opções ----------
function opcoesPdf(p) {
  if (!p) return;
  const prods = store.get("produtos");
  const lista = (p.itens || []).map((it, i) => { const tem = !!prods.find((x) => x.id === it.produtoId)?.prodFichaData;
    return h`<div class="list-item"><div class="list-main"><div class="list-title">Item ${it.num || i + 1} — ${(it.nome || "").slice(0, 50)}</div></div>${raw(tag(tem ? "Ficha disponível" : "Sem ficha", tem ? "tag-green" : "tag-gray"))}</div>`; }).join("");
  const m = openModal({ titulo: "Gerar PDF da proposta", largura: "sm",
    corpo: `<div class="form">
      <div><div class="help" style="margin-bottom:6px">Colunas da tabela</div>
        <label class="switch"><input type="checkbox" name="custo"> Incluir custo</label><br>
        <label class="switch"><input type="checkbox" name="marca" checked> Incluir marca</label><br>
        <label class="switch"><input type="checkbox" name="codigo" checked> Incluir código</label></div>
      <div><label class="switch"><input type="checkbox" name="ficha"> Anexar fichas técnicas dos produtos</label>
        <div class="list" id="fichas" hidden style="margin-top:8px;max-height:200px;overflow:auto">${lista}</div></div></div>`,
    rodape: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" data-gerar>${icon("print")} Gerar PDF</button>` });
  m.querySelector("[name=ficha]").addEventListener("change", (e) => { m.querySelector("#fichas").hidden = !e.target.checked; });
  m.querySelector("[data-gerar]").addEventListener("click", async () => {
    const o = { comCusto: m.querySelector("[name=custo]").checked, comMarca: m.querySelector("[name=marca]").checked, comCodigo: m.querySelector("[name=codigo]").checked, comFicha: m.querySelector("[name=ficha]").checked };
    closeModal(); toast("Gerando PDF…", "info");
    try { await gerarPdfProposta(p, o); } catch (e) { console.error(e); toast("Não foi possível gerar o PDF.", "erro"); }
  });
}

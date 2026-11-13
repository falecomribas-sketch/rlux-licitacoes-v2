// Reequilíbrio econômico-financeiro. Novo preço = preço de venda × (1 + variação do custo).
// "Aplicar na ATA" atualiza os preços da proposta vinculada (guardando o histórico).
import { store, newId } from "../core/store.js?v=20261113-162740";
import { dataTable, acoes, btnEditar, btnExcluir, onAction } from "../core/table.js?v=20261113-162740";
import { formModal, lerForm, campo, inputTxt, inputData, select, textarea, linha, exportarExcel } from "../core/forms.js?v=20261113-162740";
import { toast, confirmar, closeModal, icon, tag } from "../core/ui.js?v=20261113-162740";
import { esc, fmt, fmtD, fmtNum, toTitleCase, hojeIso } from "../core/utils.js?v=20261113-162740";
import { podeEditar } from "../core/auth.js?v=20261113-162740";
import { itensEmRisco } from "../core/risco.js?v=20261113-162740";
import { getCfg } from "../core/preco.js?v=20261113-162740";
import { getLicit, getOrgao, getProp, getAta, propTotal } from "../core/domain.js?v=20261113-162740";
import { ssel } from "../core/ssel.js?v=20261113-162740";
import { uploadAnexo, anexoBotoes, campoAnexo, ligarDropzones } from "../core/files.js?v=20261113-162740";
import { gerarPdfReequilibrio } from "../pdf/reequilibrio.js?v=20261113-162740";

export const STATUS_REQ = ["Solicitado", "Em Análise", "Aprovado", "Aprovado Parcial", "Negado", "Cancelado"];
const COR = { Aprovado: "tag-green", "Aprovado Parcial": "tag-green", Solicitado: "tag-amber", "Em Análise": "tag-blue", Negado: "tag-red", Cancelado: "tag-gray" };
export const FUNDAMENTOS = [["revisao", 'Revisão (reequilíbrio) — Art. 124, II, "d" — fatos imprevisíveis, força maior, caso fortuito ou fato do príncipe'], ["reajuste", "Reajuste por índice — Art. 25, §7º c/c Art. 92, §3º — reajuste anual por índice previsto no edital"], ["repactuacao", "Repactuação — Art. 135 — serviços contínuos com predominância de mão de obra"], ["outro", "Outra fundamentação"]];
export const INDICES = [["", "— Selecione —"], ["IPCA", "IPCA (IBGE)"], ["INPC", "INPC (IBGE)"], ["IGP-M", "IGP-M (FGV)"], ["IPA-M", "IPA-M (FGV)"], ["ICTI", "ICTI (IPEA)"], ["dolar", "Variação cambial (USD/BRL)"], ["CCT", "Convenção coletiva de trabalho"], ["outro", "Outro"]];
let unsub = null, stFiltro = "";

export function reqInfo(r) { const ata = getAta(r.ataId); const p = getProp(ata?.propostaId); const l = getLicit(p?.licitacaoId); return { ata, p, l, o: getOrgao(l?.orgaoId) }; }
const opcoesAtas = () => store.get("atas").map((a) => { const p = getProp(a.propostaId), l = getLicit(p?.licitacaoId), o = getOrgao(l?.orgaoId); return { id: a.id, label: `${a.numero || "—"} — ${toTitleCase(o.nome || "Órgão")}`, sub: `UASG ${o.uasg || "—"} · Pregão ${l?.numero || "—"} · vence ${fmtD(a.vencimento)}` }; });

export default {
  id: "reequilibrio", titulo: "Reequilíbrio", grupo: "Pós-licitação", icone: "trending",

  render(el) {
    el.innerHTML = `
      <div class="grid grid-4" id="kpis" style="margin-bottom:16px"></div>
      <div class="page-head"><h2>Reequilíbrio econômico-financeiro</h2><div class="actions"><button class="btn btn-ghost" data-act="excel">${icon("download")} Excel</button>
        ${podeEditar() ? `<button class="btn btn-primary" data-act="novo">${icon("plus")} Nova solicitação</button>` : ""}</div></div>
      <div class="card" id="risco" style="margin-bottom:16px"></div>
      <div class="card"><div class="chip-filters"><span class="muted">Status:</span><button class="chip ${!stFiltro ? "active" : ""}" data-act="st" data-id="">Todos</button>
        ${STATUS_REQ.map((s) => `<button class="chip ${stFiltro === s ? "active" : ""}" data-act="st" data-id="${s}">${s}</button>`).join("")}</div>
        <div class="card-body flush" id="tbl"></div></div>`;
    const kpis = () => { const d = store.get("reequilibrio"); const ap = d.filter((r) => r.status === "Aprovado" || r.status === "Aprovado Parcial");
      el.querySelector("#kpis").innerHTML = `
        <div class="kpi"><div class="kpi-label">Pedidos</div><div class="kpi-value">${d.length}</div></div>
        <div class="kpi"><div class="kpi-label">Pendentes / em análise</div><div class="kpi-value" style="color:var(--amber-txt)">${d.filter((r) => r.status === "Solicitado" || r.status === "Em Análise").length}</div></div>
        <div class="kpi"><div class="kpi-label">Aprovados</div><div class="kpi-value" style="color:var(--green)">${ap.length}</div></div>
        <div class="kpi"><div class="kpi-label">Valor aprovado</div><div class="kpi-value">${fmt(ap.reduce((s, r) => s + (r.valorDif || 0), 0))}</div></div>`; };
    const tabela = dataTable({
      el: el.querySelector("#tbl"), rows: () => store.get("reequilibrio").filter((r) => !stFiltro || r.status === stFiltro),
      search: (r, q) => { const i = reqInfo(r); return [r.numero, r.processo, i.ata?.numero, i.o.nome, i.o.uasg, i.l?.numero, r.justificativa, r.status].some((x) => (x || "").toLowerCase().includes(q)); },
      placeholder: "Buscar nº, ATA, órgão, UASG, pregão…", sort: { key: "dataSolic", dir: "desc" }, empty: "Nenhuma solicitação",
      columns: [
        { key: "numero", label: "Nº solicitação", render: (r) => `<strong>${esc(r.numero || "—")}</strong>${r.processo ? `<div class="muted" style="font-size:11px">${esc(r.processo)}</div>` : ""}` },
        { key: "ata", label: "ATA / pregão", sort: (r) => reqInfo(r).ata?.numero || "", render: (r) => { const i = reqInfo(r); return `${esc(i.ata?.numero || "—")}<div class="muted" style="font-size:11px">${esc(i.l?.numero || "")}</div>`; } },
        { key: "orgao", label: "Órgão", sort: (r) => reqInfo(r).o.nome || "", render: (r) => { const i = reqInfo(r); return `${esc(toTitleCase(i.o.nome || "—"))}<div class="muted" style="font-size:11px">UASG ${esc(i.o.uasg || "—")}</div>`; } },
        { key: "dataSolic", label: "Solicitação", render: (r) => fmtD(r.dataSolic) },
        { key: "dataResp", label: "Resposta", render: (r) => r.dataResp ? fmtD(r.dataResp) : tag("Pendente", "tag-amber") },
        { key: "percReajuste", label: "Reajuste", num: true, sort: (r) => r.percReajuste || 0, render: (r) => `<strong style="color:var(--purple)">${(r.percReajuste || 0).toFixed(2)}%</strong>` },
        { key: "valorDif", label: "Diferença", num: true, sort: (r) => r.valorDif || 0, render: (r) => `<strong style="color:${(r.valorDif || 0) > 0 ? "var(--red)" : "var(--green)"}">${fmt(r.valorDif)}</strong>` },
        { key: "status", label: "Status", render: (r) => `${tag(r.status || "—", COR[r.status] || "tag-gray")}${r.aplicado ? " " + tag("Aplicado na ATA", "tag-green") : ""}` },
        { key: "acoes", label: "", sort: false, width: "120px", render: (r) => acoes(`<button class="icon-btn sm" data-act="pdf" data-id="${esc(r.id)}" title="PDF">${icon("print")}</button>`, ...(podeEditar() ? [btnEditar(r.id), btnExcluir(r.id, r.aplicado ? "Já aplicado na ATA" : "")] : [])) },
      ],
    });
    const painelRisco = () => {
      const box = el.querySelector("#risco"); if (!box) return; const cfg = getCfg(); const lst = itensEmRisco();
      const NIVEL = { critico: ["Abaixo do piso", "tag-red"], alerta: ["Em risco", "tag-amber"], verificar: ["Verificar custo", "tag-gray"], em_andamento: ["Pedido em andamento", "tag-blue"] };
      const porAta = new Map(); lst.forEach((x) => { const k = x.ata.id; if (!porAta.has(k)) porAta.set(k, []); porAta.get(k).push(x); });
      const impacto = lst.reduce((s, x) => s + x.impacto, 0);
      box.innerHTML = `<div class="card-head"><h2>Itens em risco de reequilíbrio</h2><span class="muted" style="font-size:12px">custo da proposta × custo atual · alerta se lucro &lt; ${cfg.lucroMinReq ?? cfg.lucroMin}% ou custo +${cfg.altaCustoReq ?? 10}% · impacto no saldo: <strong>${fmt(impacto)}</strong></span></div>`
        + (lst.length ? `<div class="card-body flush"><div class="table-wrap"><table><thead><tr><th>ATA / órgão</th><th>Item</th><th class="num">Saldo</th><th class="num">Preço contratado</th><th>Custo proposta → atual</th><th class="num">Lucro hoje</th><th class="num">Impacto</th><th>Situação</th><th></th></tr></thead><tbody>
          ${lst.slice(0, 40).map((x) => `<tr><td><strong>${esc(x.ata.numero || "—")}</strong><div class="muted" style="font-size:11px">${esc(toTitleCase(x.o.nome || ""))}${x.ata.vencimento ? ` · até ${fmtD(x.ata.vencimento)}` : ""}</div></td>
            <td><strong>${esc(x.item.num ?? "")}</strong> ${esc((x.item.nome || "").slice(0, 60))}<div class="muted" style="font-size:11px">${esc(x.prod.codigo || "")}</div></td>
            <td class="num">${fmtNum(x.item.saldo)}</td><td class="num">${fmt(x.item.preco)}<div class="muted" style="font-size:11px">piso hoje ${fmt(x.pisoAtual)}</div></td>
            <td>${fmt(x.custoProp)} → <strong style="color:${x.variacao > 0 ? "var(--red)" : "var(--green)"}">${fmt(x.custoAtual)}</strong>${x.variacao !== null ? ` <span style="font-size:12px;color:${x.variacao > 0 ? "var(--red)" : "var(--green)"}">(${x.variacao > 0 ? "+" : ""}${x.variacao.toFixed(1).replace(".", ",")}%)</span>` : ""}<div class="muted" style="font-size:11px">${x.custoData ? `custo de ${fmtD(x.custoData)}` : "custo sem data"}${x.semData ? " · vencido" : ""}</div></td>
            <td class="num" style="font-weight:600;color:${x.lucroAtual < 0 ? "var(--red)" : x.gatilhoLucro ? "var(--amber-txt)" : "var(--green)"}">${x.lucroAtual.toFixed(1).replace(".", ",")}%</td>
            <td class="num"><strong>${fmt(x.impacto)}</strong></td>
            <td>${tag(...NIVEL[x.nivel])}</td>
            <td>${x.pedidoId ? `<button class="btn btn-ghost btn-sm" data-act="editar" data-id="${esc(x.pedidoId)}">Abrir pedido</button>` : podeEditar() ? `<button class="btn btn-primary btn-sm" data-act="solicitar" data-id="${esc(x.ata.id)}">Solicitar</button>` : ""}</td></tr>`).join("")}
          </tbody></table></div>${lst.length > 40 ? `<p class="muted" style="font-size:12px;padding:8px 16px;margin:0">Mostrando 40 de ${lst.length}.</p>` : ""}</div>`
        : `<div class="card-body"><p class="muted" style="margin:0;font-size:13px">Nenhum item em risco: em todas as ATAs vigentes com saldo, o custo atual ainda sustenta o lucro mínimo. O monitor recalcula a cada importação de custos.</p></div>`);
    };
    painelRisco();
    onAction(el, {
      st: (id) => { stFiltro = id; el.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.id === id)); tabela.refresh(); },
      solicitar: (ataId) => { const lst = itensEmRisco().filter((x) => x.ata.id === ataId && !x.pedidoId); if (!lst.length) return;
        const cfg = getCfg(); const hoje = fmtD(hojeIso());
        const just = textoJustificativa(lst, cfg);
        abrirForm({ ataId, itens: lst.map((x) => ({ num: x.item.num, nome: x.item.nome, custoAntigo: x.custoProp, custoAtual: x.custoAtual })), justificativa: just, fundamento: "revisao" }); },
      novo: () => abrirForm(), editar: (id) => abrirForm(store.find("reequilibrio", id)), pdf: (id) => gerarPdfReequilibrio(store.find("reequilibrio", id)),
      excluir: async (id) => { if (!await confirmar("Excluir esta solicitação?", { ok: "Excluir", perigo: true })) return; await store.remove("reequilibrio", id); toast("Excluída."); },
      excel: () => exportarExcel(store.get("reequilibrio").map((r) => { const i = reqInfo(r); return { "Nº Solicitação": r.numero, ATA: i.ata?.numero || "", Órgão: i.o.nome || "", UASG: i.o.uasg || "", "Dt. Solicitação": fmtD(r.dataSolic), "Dt. Resposta": r.dataResp ? fmtD(r.dataResp) : "", Status: r.status, "% Reajuste": (r.percReajuste || 0).toFixed(2), "Diferença (R$)": r.valorDif || 0, "Total Original": r.totalOrig || 0, "Total Reajustado": r.totalNovo || 0, "Tipo": r.fundamento || "", Índice: r.indice || "", Aplicado: r.aplicado ? "Sim" : "Não", Justificativa: r.justificativa || "" }; }), "Reequilíbrio", "reequilibrio"),
    });
    kpis(); unsub = store.on("*", () => { kpis(); tabela.refresh(); painelRisco(); });
  },
  destroy() { unsub?.(); stFiltro = ""; },
};

function abrirForm(r = null) {
  let ataSel;
  const aprovado = (st) => st === "Aprovado" || st === "Aprovado Parcial";
  formModal({
    titulo: r?.id ? `Editar solicitação ${r.numero}` : "Nova solicitação de reequilíbrio", largura: "xl",
    extra: (r?.id ? `<button type="button" class="btn btn-ghost" data-pdf>${icon("print")} PDF</button>` : "") + (r && aprovado(r.status) && !r.aplicado ? `<button type="button" class="btn btn-success" data-aplicar>${icon("check")} Aplicar na ATA</button>` : ""),
    corpo: `
      <div class="form-section">Identificação do pedido</div>
      ${linha(`<div class="field"><span>ATA de origem</span><div id="ata-ssel"></div></div>`, campo("Nº da solicitação", inputTxt("numero", r?.numero || "", 'required placeholder="REQ-001/2026"')))}
      <div id="ata-info" class="info-box" hidden></div>
      <div class="form-section" style="color:var(--amber-txt)">Itens para reequilíbrio — informe o custo atual; o novo preço segue a variação do custo</div>
      <div id="itens"><div class="empty">Selecione a ATA para carregar os itens</div></div>
      <div class="totais" id="tot" hidden><div><span class="muted">Total original</span><strong id="t-orig"></strong></div><div><span class="muted">Total reajustado</span><strong id="t-novo" style="color:var(--amber-txt)"></strong></div><div><span class="muted">Diferença</span><strong id="t-dif"></strong></div><div class="total-geral"><span class="muted">Reajuste médio</span><strong id="t-perc" style="color:var(--purple)"></strong></div></div>
      <div class="form-section" style="color:var(--green)">Justificativa e fundamentação</div>
      ${linha(campo("Tipo de recomposição", select("fundamento", FUNDAMENTOS, r?.fundamento || "revisao")), campo("Índice de referência", select("indice", INDICES, r?.indice || "")))}
      ${linha(campo("Justificativa detalhada", textarea("justificativa", r?.justificativa || "", 'required style="min-height:90px" placeholder="Fatos e impactos econômicos que fundamentam o pedido…"')))}
      <div class="form-section" style="color:var(--purple)">Processo e controle</div>
      ${linha(campo("Data da solicitação", inputData("dataSolic", r?.dataSolic || hojeIso())), campo("Data da resposta", inputData("dataResp", r?.dataResp || "")), campo("Nº processo SEI / interno", inputTxt("processo", r?.processo || "")))}
      ${linha(campo("Status", select("status", STATUS_REQ, r?.status || "Solicitado")), campo("Responsável pelo pedido", inputTxt("responsavel", r?.responsavel || "")))}
      ${r?.aplicado ? `<div class="info-box" style="grid-template-columns:1fr;background:var(--green-bg);border-color:#9fdcbc"><strong style="color:var(--green)">Reequilíbrio aplicado na ATA</strong> em ${r.aplicadoEm ? new Date(r.aplicadoEm).toLocaleString("pt-BR") : "—"}. Os preços da proposta vinculada foram atualizados.</div>` : ""}
      <div class="form-section" style="color:var(--teal)">Documentação comprobatória</div>
      ${linha(campoAnexo("Planilha / cotações", "arq", r?.arqData), campoAnexo("Ofício / documento", "doc", r?.docData))}
      ${linha(campo("Observações", textarea("obs", r?.obs || "")))}`,
    onAberto(form, m) {
      const render = () => renderItens(form, ataSel.value, r?.itens || []);
      ataSel = ssel(form.querySelector("#ata-ssel"), { placeholder: "Nº da ATA, órgão, pregão ou UASG…", itens: opcoesAtas(), value: r?.ataId || "", onSelect: render });
      ligarDropzones(form); render();
      m.querySelector("[data-pdf]")?.addEventListener("click", () => gerarPdfReequilibrio(r));
      m.querySelector("[data-aplicar]")?.addEventListener("click", () => aplicarNaAta(r));
    },
    async onSalvar(form) {
      const v = lerForm(form);
      if (!ataSel.value) throw new Error("Selecione a ATA de origem."); if (!v.numero.trim()) throw new Error("Informe o nº da solicitação.");
      if (!v.dataSolic) throw new Error("Informe a data da solicitação."); if (!v.justificativa.trim()) throw new Error("Informe a justificativa.");
      const itens = coletarItens(form, ataSel.value); if (!itens.length) throw new Error("Selecione ao menos um item.");
      const totalOrig = itens.reduce((s, i) => s + i.precoOrig * i.qtd, 0), totalNovo = itens.reduce((s, i) => s + i.novoPreco * i.qtd, 0);
      const id = r?.id || newId();
      const item = { ...(r || {}), id, numero: v.numero.trim(), ataId: ataSel.value, itens, fundamento: v.fundamento, indice: v.indice, justificativa: v.justificativa.trim(), dataSolic: v.dataSolic, dataResp: v.dataResp, processo: v.processo.trim(), status: v.status, responsavel: v.responsavel.trim(), obs: v.obs.trim(),
        totalOrig, totalNovo, valorDif: totalNovo - totalOrig, percReajuste: totalOrig > 0 ? (totalNovo - totalOrig) / totalOrig * 100 : 0, aplicado: r?.aplicado || false, aplicadoEm: r?.aplicadoEm || null, historicoPrecos: r?.historicoPrecos || null, arqData: r?.arqData || "", docData: r?.docData || "", criadoEm: r?.criadoEm || new Date().toISOString() };
      const fa = form.arq.files[0], fd = form.doc.files[0]; if (fa || fd) toast("Enviando anexos…", "info");
      if (fa) item.arqData = await uploadAnexo("reequilibrio", id, "reqArqData", fa); if (fd) item.docData = await uploadAnexo("reequilibrio", id, "reqDocData", fd);
      await store.setItem("reequilibrio", item); closeModal();
      if (aprovado(item.status) && !item.aplicado) { toast("Solicitação salva. Abra-a novamente e clique em \"Aplicar na ATA\" para atualizar os preços.", "info", 6000); } else toast("Solicitação salva.");
    },
  });
}

function renderItens(form, ataId, existentes) {
  const cont = form.querySelector("#itens"); const ata = getAta(ataId); const p = getProp(ata?.propostaId); const itens = p?.itens || []; const box = form.querySelector("#ata-info");
  if (!ata) { box.hidden = true; cont.innerHTML = `<div class="empty">Selecione a ATA para carregar os itens</div>`; form.querySelector("#tot").hidden = true; return; }
  const l = getLicit(p?.licitacaoId), o = getOrgao(l?.orgaoId); box.hidden = false;
  box.innerHTML = `<div><div class="k">ATA</div>${esc(ata.numero || "—")}</div><div><div class="k">Órgão</div>${esc(toTitleCase(o.nome || "—"))}</div><div><div class="k">Vigência</div>${fmtD(ata.assinatura)} a ${fmtD(ata.vencimento)}</div><div><div class="k">Valor da ATA</div>${fmt(propTotal(p))}</div>`;
  if (!itens.length) { cont.innerHTML = `<div class="empty">A proposta desta ATA não tem itens</div>`; return; }
  const prods = store.get("produtos");
  cont.innerHTML = `<div class="table-wrap"><table><thead><tr><th style="width:30px"><input type="checkbox" data-all></th><th>Nº</th><th>Descrição</th><th class="num">Qtd</th><th>Custo antigo</th><th>Custo atual</th><th class="num">Var. custo</th><th class="num">Preço venda</th><th class="num">Novo preço</th><th class="num">Dif. total</th></tr></thead><tbody>
    ${itens.map((it, idx) => { const ex = existentes.find((e) => e.num === it.num || e.nome === it.nome); const prod = prods.find((x) => x.id === it.produtoId);
      const ca = ex?.custoAntigo ?? (it.custo || prod?.custo || 0), cn = ex?.custoAtual ?? ca;
      return `<tr data-idx="${idx}" data-preco="${it.preco || 0}" data-qtd="${it.qtd || 0}"><td><input type="checkbox" data-sel ${ex ? "checked" : ""}></td><td>${esc(it.num || idx + 1)}</td><td>${esc((it.nome || "—").slice(0, 60))}</td><td class="num">${fmtNum(it.qtd)}</td>
        <td><input type="number" class="input input-sm" data-ca value="${ca}" step="0.01" style="width:100px;color:var(--red);font-weight:600"></td><td><input type="number" class="input input-sm" data-cn value="${cn}" step="0.01" style="width:100px"></td>
        <td class="num" data-var>—</td><td class="num" style="color:var(--navy-2);font-weight:600">${fmt(it.preco)}</td><td class="num" data-np style="font-weight:700;color:var(--green)">—</td><td class="num" data-dif>—</td></tr>`; }).join("")}</tbody></table></div>`;
  const calc = () => { let orig = 0, novo = 0; cont.querySelectorAll("[data-idx]").forEach((r) => { const sel = r.querySelector("[data-sel]").checked; const ca = +r.querySelector("[data-ca]").value || 0, cn = +r.querySelector("[data-cn]").value || 0, pv = +r.dataset.preco, q = +r.dataset.qtd;
    const varc = ca > 0 ? (cn - ca) / ca * 100 : 0, np = pv * (1 + varc / 100), dif = (np - pv) * q;
    const V = r.querySelector("[data-var]"), N = r.querySelector("[data-np]"), D = r.querySelector("[data-dif]");
    V.textContent = sel ? varc.toFixed(2) + "%" : "—"; V.style.color = varc > 0 ? "var(--red)" : varc < 0 ? "var(--green)" : ""; N.textContent = sel ? fmt(np) : "—"; D.textContent = sel ? fmt(dif) : "—"; D.style.color = dif > 0 ? "var(--red)" : dif < 0 ? "var(--green)" : "";
    if (sel) { orig += pv * q; novo += np * q; } });
    const tot = form.querySelector("#tot"); tot.hidden = false; form.querySelector("#t-orig").textContent = fmt(orig); form.querySelector("#t-novo").textContent = fmt(novo); const d = form.querySelector("#t-dif"); d.textContent = fmt(novo - orig); d.style.color = novo - orig > 0 ? "var(--red)" : "var(--green)"; form.querySelector("#t-perc").textContent = (orig > 0 ? (novo - orig) / orig * 100 : 0).toFixed(2) + "%"; };
  cont.querySelector("[data-all]").addEventListener("change", (e) => { cont.querySelectorAll("[data-sel]").forEach((c) => { c.checked = e.target.checked; }); calc(); });
  cont.addEventListener("input", calc); cont.addEventListener("change", calc); calc();
}

function coletarItens(form, ataId) {
  const ata = getAta(ataId); const p = getProp(ata?.propostaId); const itens = p?.itens || []; const out = [];
  form.querySelectorAll("#itens [data-idx]").forEach((r) => { if (!r.querySelector("[data-sel]").checked) return; const it = itens[+r.dataset.idx]; const ca = +r.querySelector("[data-ca]").value || 0, cn = +r.querySelector("[data-cn]").value || 0, pv = +r.dataset.preco, q = +r.dataset.qtd;
    const varc = ca > 0 ? (cn - ca) / ca * 100 : 0, np = pv * (1 + varc / 100);
    out.push({ num: it.num || +r.dataset.idx + 1, nome: it.nome, codigo: it.codigo, marca: it.marca, qtd: q, custoAntigo: ca, custoAtual: cn, varCusto: varc, precoOrig: pv, novoPreco: np, difUnit: np - pv, difTotal: (np - pv) * q, percReajuste: varc }); });
  return out;
}

async function aplicarNaAta(r) {
  const atual = store.find("reequilibrio", r.id) || r; if (atual.aplicado) return toast("Já aplicado anteriormente.", "info");
  const ata = getAta(atual.ataId); const p = getProp(ata?.propostaId); if (!ata || !p) return toast("ATA ou proposta não encontrada.", "erro");
  const msg = `Atualizar os preços de ${atual.itens.length} item(ns) na proposta da ATA ${ata.numero}?\n\n` + atual.itens.map((it) => `• ${it.nome}: ${fmt(it.precoOrig)} → ${fmt(it.novoPreco)} (${(it.varCusto || 0) >= 0 ? "+" : ""}${(it.varCusto || 0).toFixed(2)}%)`).join("\n") + `\n\nDiferença total: ${fmt(atual.valorDif)}. Os preços originais ficam guardados no histórico.`;
  if (!await confirmar(msg, { ok: "Aplicar" })) return;
  const historico = atual.itens.map((it) => { const pi = (p.itens || []).find((x) => x.num === it.num || x.nome === it.nome); return { num: it.num, nome: it.nome, custoAntigo: it.custoAntigo, custoAtual: it.custoAtual, varCusto: it.varCusto, precoAnterior: pi?.preco ?? it.precoOrig, novoPreco: it.novoPreco, data: new Date().toISOString() }; });
  let n = 0; const itens = (p.itens || []).map((pi) => { const ri = atual.itens.find((x) => x.num === pi.num || x.nome === pi.nome); if (!ri) return pi; n++; return { ...pi, preco: ri.novoPreco, total: (pi.qtd || 0) * ri.novoPreco, precoAnterior: pi.preco, reequilibrio: atual.numero }; });
  await store.setItem("propostas", { ...p, itens });
  await store.setItem("reequilibrio", { ...atual, aplicado: true, aplicadoEm: new Date().toISOString(), historicoPrecos: historico });
  closeModal(); toast(`Preços atualizados: ${n} item(ns) na ATA ${ata.numero}.`);
}

// Modelo de justificativa (texto da RLUX adotado como padrão). Campos entre colchetes ficam para o usuário completar com as provas.
function textoJustificativa(lst, cfg) {
  const x0 = lst[0]; const ata = x0.ata, l = x0.l, p = x0.p; const hoje = fmtD(hojeIso());
  const dataProp = p?.criadoEm ? fmtD(p.criadoEm.slice(0, 10)) : "[data da proposta]";
  const pct = (v) => (v > 0 ? "+" : "") + v.toFixed(2).replace(".", ",") + "%";
  const desc = (cfg.simples + cfg.fretePct) / 100;
  const itens = lst.map((x) => {
    const liquido = x.item.preco * (1 - desc), res = liquido - x.custoAtual, novo = x.item.preco * (x.custoAtual / (x.custoProp || x.custoAtual));
    return { x, liquido, res, novo };
  });
  const blocoItens = itens.map(({ x, liquido, res, novo }) => `Item ${x.item.num ?? ""} – ${x.item.nome || ""}${x.prod?.marca ? ` (${x.prod.marca}${x.prod.codigo ? " " + x.prod.codigo : ""})` : ""}:
- Custo de aquisição na proposta (${dataProp}): ${fmt(x.custoProp)}
- Custo de aquisição atual, após reajuste dos fornecedores (${x.custoData ? fmtD(x.custoData) : "[data]"}): ${fmt(x.custoAtual)} (${x.variacao !== null ? pct(x.variacao) : "n/d"})
- Preço registrado: ${fmt(x.item.preco)}
- Composição por unidade ao preço registrado: ${fmt(x.item.preco)} − Simples Nacional ${String(cfg.simples).replace(".", ",")}% (${fmt(x.item.preco * cfg.simples / 100)}) − frete ${String(cfg.fretePct).replace(".", ",")}% (${fmt(x.item.preco * cfg.fretePct / 100)}) = ${fmt(liquido)} líquidos, contra custo de ${fmt(x.custoAtual)} → resultado de ${fmt(res)} por unidade (${pct(res / x.item.preco * 100)})
- Saldo a fornecer: ${fmtNum(x.item.saldo)} un. → ${res < 0 ? "prejuízo" : "resultado"} estimado de ${fmt(Math.abs(res) * x.item.saldo)}
- Preço revisado pleiteado (mesma proporção da variação do custo): ${fmt(novo)}`).join("\n\n");
  const pedidos = itens.map(({ x, novo }, i) => `${i + 1}. A revisão do preço registrado do Item ${x.item.num ?? ""} de ${fmt(x.item.preco)} para ${fmt(novo)}, na mesma proporção da variação do custo de aquisição, preservando-se a equação econômico-financeira originalmente proposta, com efeitos para os fornecimentos a partir da data deste pedido;`).join("\n");
  const n = itens.length;
  return `Solicitamos a revisão dos preços registrados na ATA nº ${ata.numero || "[nº]"}${l?.numero ? ` (${l.tipo || "Pregão Eletrônico"} nº ${l.numero})` : ""}, para restabelecimento do equilíbrio econômico-financeiro da proposta, com fundamento no art. 37, XXI, da Constituição Federal; nos arts. 5º, 82, VI, 89 e 124, II, "d", da Lei nº 14.133/2021; nas cláusulas do Edital e da Ata que tratam da alteração de preços; e no regulamento de registro de preços aplicável ao órgão gerenciador [citar o decreto, se houver].

DOS FATOS

A fornecedora atua como revenda e adquire o(s) item(ns) objeto deste pedido de importadoras e fabricantes, não tendo qualquer ingerência sobre a formação de seu preço de origem. [Se importado: O produto é importado, e seu custo está diretamente atrelado à cotação do dólar, ao frete internacional e ao frete nacional.]

Após a apresentação da proposta (${dataProp}), as importadoras e fabricantes emitiram comunicados oficiais de reajuste de preços [datas dos comunicados: ___], repassados de forma generalizada a toda a rede de revenda, justificados pelos seguintes fatores extraordinários e alheios à vontade da fornecedora:

a) [Variação cambial — manter apenas se os números sustentarem: PTAX em ${dataProp}: R$ ___ ; PTAX em ${hoje}: R$ ___ ; variação de ___%];
b) [Frete internacional — fonte/índice e variação: ___];
c) Frete nacional: aumento do custo do transporte rodoviário em razão da elevação do preço dos combustíveis, especialmente do óleo diesel.

Trata-se, portanto, de aumento imposto por toda a cadeia de fornecimento, de caráter geral e não restrito a um fornecedor específico, que a fornecedora não tinha como prever nem evitar no momento da formulação da proposta.

DO${n > 1 ? "S ITENS AFETADOS" : " ITEM AFETADO"} (apuração em ${hoje})

${blocoItens}

Com o reajuste repassado pelos fornecedores, o preço registrado deixou de cobrir os custos totais de fornecimento, de modo que a execução nas condições atuais passou a gerar prejuízo à fornecedora, conforme demonstrado acima. Não se trata de mera flutuação de mercado ou de risco ordinário do negócio, mas de choques externos que atingiram toda a cadeia de distribuição do produto e romperam a equação econômico-financeira estabelecida na proposta.

DOS PEDIDOS

${pedidos}
${n + 1}. A comunicação aos órgãos participantes e contratantes, para que avaliem a revisão dos contratos e empenhos já emitidos;
${n + 2}. Subsidiariamente, caso o pedido não seja acolhido, o cancelamento do registro de preços do(s) item(ns) indicado(s), com liberação da fornecedora do compromisso assumido sem aplicação de sanções, por se tratar de fato superveniente e alheio à sua vontade.

Seguem em anexo: comunicados de reajuste emitidos pelas importadoras/fabricantes; notas fiscais de compra anteriores e posteriores ao reajuste; tabelas de preços dos fornecedores; cotações atuais de outros distribuidores; [e cotações do dólar (PTAX/BCB) nas datas de referência].`;
}

// Gestão de ATA. Campos: id, numero, propostaId, assinatura, validade, vencimento,
// permiteAdesao ("sim"|"nao"|""), ataArqData, ataCTData, ataOrigemId?, geracao?
//
// Renovação (mesmo modelo do legado): cria uma proposta-espelho (cópia da
// proposta com novos preços/qtds, marcada com espelhoDeAtaId) e uma nova ATA
// apontando para ela, com ataOrigemId e geracao+1. A ATA anterior fica intacta.
import { store, newId } from "../core/store.js?v=20261113-153534";
import { dataTable, acoes, btnEditar, btnExcluir, onAction } from "../core/table.js?v=20261113-153534";
import { formModal, lerForm, campo, inputTxt, inputData, inputNum, select, linha, exportarExcel } from "../core/forms.js?v=20261113-153534";
import { toast, confirmar, closeModal, icon, tag } from "../core/ui.js?v=20261113-153534";
import { esc, h, raw, fmt, fmtD, fmtNum, toTitleCase, diasAte, hojeIso } from "../core/utils.js?v=20261113-153534";
import { podeEditar } from "../core/auth.js?v=20261113-153534";
import { getLicit, getOrgao, getProp, propTotal, propEmpenhado, isEspelho, ataGeracao, ataValores } from "../core/domain.js?v=20261113-153534";
import { ssel } from "../core/ssel.js?v=20261113-153534";
import { opcoesOrgaos } from "./licitacoes.js?v=20261113-153534";
import { uploadAnexo, anexoBotoes, campoAnexo, ligarDropzones } from "../core/files.js?v=20261113-153534";
import { gerarPdfAta } from "../pdf/ata.js?v=20261113-153534";

let unsub = null, stFiltro = "";

export const opcoesPropostas = (orgaoId, incluirEspelhos = false) => {
  const lics = store.get("licitacoes").filter((l) => l.orgaoId === orgaoId).map((l) => l.id);
  return store.get("propostas").filter((p) => lics.includes(p.licitacaoId) && (incluirEspelhos || !isEspelho(p))).map((p) => {
    const l = getLicit(p.licitacaoId); const ata = store.get("atas").find((a) => a.propostaId === p.id);
    return { id: p.id, label: `#${p.num || "?"} — ${l.numero || "?"}${isEspelho(p) ? ` (${p.geracao || 2}ª vigência)` : ""}`, sub: `${l.tipo || ""} · ${fmtD(l.data)} · ${fmt(propTotal(p))}${ata ? " · ATA " + ata.numero : ""}` };
  });
};

export function calcVencimento(assinatura, meses) {
  if (!assinatura || !meses) return "";
  const d = new Date(assinatura + "T00:00:00"); d.setMonth(d.getMonth() + +meses);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const situacao = (a) => {
  if (!a.vencimento) return { txt: "Sem data", cls: "tag-gray", ord: 9 };
  const d = diasAte(a.vencimento);
  if (d < 0) return { txt: "Vencida", cls: "tag-red", ord: 0 };
  if (d <= 30) return { txt: `${d} dias`, cls: "tag-orange", ord: 1 };
  if (d <= 60) return { txt: `${d} dias`, cls: "tag-amber", ord: 2 };
  return { txt: `${d} dias`, cls: "tag-green", ord: 3 };
};

export default {
  id: "atas", titulo: "Gestão de ATA", grupo: "Pós-licitação", icone: "doc",

  render(el) {
    el.innerHTML = `
      <div class="grid grid-4" id="kpis" style="margin-bottom:16px"></div>
      <div class="page-head"><h2>Atas de registro de preços</h2>
        <div class="actions">
          <button class="btn btn-ghost" data-act="excel">${icon("download")} Excel</button>
          ${podeEditar() ? `<button class="btn btn-primary" data-act="novo">${icon("plus")} Nova ATA</button>` : ""}
        </div></div>
      <div class="card">
        <div class="chip-filters"><span class="muted">Situação:</span>
          ${[["", "Todas"], ["vigente", "Vigentes"], ["30", "Vencem em 30 dias"], ["60", "Vencem em 60 dias"], ["vencida", "Vencidas"]].map(([v, t]) => `<button class="chip ${stFiltro === v ? "active" : ""}" data-act="st" data-id="${v}">${t}</button>`).join("")}
        </div>
        <div class="card-body flush" id="tbl"></div></div>`;

    const linhas = () => store.get("atas").filter((a) => {
      if (!stFiltro) return true; if (!a.vencimento) return false; const d = diasAte(a.vencimento);
      return stFiltro === "vigente" ? d >= 0 : stFiltro === "vencida" ? d < 0 : d >= 0 && d <= +stFiltro;
    });
    const kpis = () => {
      const data = linhas(); let total = 0, emp = 0;
      data.forEach((a) => { const v = ataValores(a); total += v.valor; emp += v.empenhado; });
      const v30 = data.filter((a) => { const d = a.vencimento ? diasAte(a.vencimento) : null; return d !== null && d >= 0 && d <= 30; }).length;
      el.querySelector("#kpis").innerHTML = `
        <div class="kpi"><div class="kpi-label">ATAs</div><div class="kpi-value">${data.length}</div></div>
        <div class="kpi"><div class="kpi-label">Valor total</div><div class="kpi-value">${fmt(total)}</div></div>
        <div class="kpi"><div class="kpi-label">Saldo a empenhar</div><div class="kpi-value" style="color:var(--amber-txt)">${fmt(total - emp)}</div></div>
        <div class="kpi"><div class="kpi-label">Vencem em 30 dias</div><div class="kpi-value" style="color:${v30 ? "var(--red)" : "inherit"}">${v30}</div></div>`;
    };

    const ctx = (a) => { const p = getProp(a.propostaId); const l = getLicit(p?.licitacaoId); return { p, l, o: getOrgao(l?.orgaoId) }; };
    const tabela = dataTable({
      el: el.querySelector("#tbl"), rows: linhas,
      search: (a, q) => { const { p, l, o } = ctx(a); return [a.numero, l?.numero, o?.nome, o?.uasg, o?.cnpj, String(p?.num), ...(o?.contatos || []).map((c) => c.email)].some((x) => (x || "").toLowerCase().includes(q)); },
      placeholder: "Buscar nº ATA, pregão, órgão, UASG…", sort: { key: "vencimento", dir: "asc" }, empty: "Nenhuma ATA cadastrada",
      columns: [
        { key: "numero", label: "Nº ATA", render: (a) => `<strong>${esc(a.numero)}</strong>${ataGeracao(a) > 1 ? ` ${tag(`${ataGeracao(a)}ª vigência`, "tag-purple")}` : ""}<div style="margin-top:3px">${anexoBotoes(a.ataArqData, "ATA")} ${anexoBotoes(a.ataCTData, "Contrato")}</div>` },
        { key: "uasg", label: "UASG", width: "85px", sort: (a) => ctx(a).o.uasg || "", render: (a) => { const u = ctx(a).o.uasg; return u ? tag(u, "tag-purple") : "—"; } },
        { key: "pregao", label: "Pregão", sort: (a) => ctx(a).l.numero || "", render: (a) => { const { l } = ctx(a); return `<strong>${esc(l.numero || "—")}</strong><div class="muted" style="font-size:11px">${fmtD(l.data)}</div>`; } },
        { key: "orgao", label: "Órgão", sort: (a) => ctx(a).o.nome || "", render: (a) => esc(toTitleCase(ctx(a).o.nome || "—")) },
        { key: "assinatura", label: "Assinatura", render: (a) => fmtD(a.assinatura) },
        { key: "vencimento", label: "Vencimento", render: (a) => fmtD(a.vencimento) },
        { key: "valor", label: "Valor", num: true, sort: (a) => ataValores(a).valor, render: (a) => fmt(ataValores(a).valor) },
        { key: "emp", label: "Empenhado", num: true, sort: (a) => ataValores(a).empenhado, render: (a) => `<span style="color:var(--green)">${fmt(ataValores(a).empenhado)}</span>` },
        { key: "saldo", label: "Saldo", num: true, sort: (a) => ataValores(a).saldo, render: (a) => { const s = ataValores(a).saldo; return `<span style="color:${s <= 0 ? "var(--green)" : "var(--amber-txt)"}">${fmt(s)}</span>`; } },
        { key: "adesao", label: "Adesão", sort: false, render: (a) => a.permiteAdesao === "sim" ? tag("Aceita", "tag-green") : a.permiteAdesao === "nao" ? tag("Não", "tag-gray") : '<span class="muted">—</span>' },
        { key: "sit", label: "Situação", sort: (a) => (a.vencimento || "9999") + situacao(a).ord, render: (a) => { const s = situacao(a); return tag(s.txt, s.cls); } },
        { key: "acoes", label: "", sort: false, width: "150px", render: (a) => acoes(
          `<button class="icon-btn sm" data-act="pdf" data-id="${esc(a.id)}" title="PDF">${icon("print")}</button>`,
          ...(podeEditar() ? [`<button class="icon-btn sm" data-act="renovar" data-id="${esc(a.id)}" title="Renovar / prorrogar" style="color:var(--purple)">${icon("refresh")}</button>`, btnEditar(a.id), btnExcluir(a.id)] : [])) },
      ],
    });

    onAction(el, {
      st: (id) => { stFiltro = id; el.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.id === id)); kpis(); tabela.refresh(); },
      novo: () => abrirForm(),
      editar: (id) => abrirForm(store.find("atas", id)),
      renovar: (id) => abrirRenovacao(store.find("atas", id)),
      pdf: (id) => { const a = store.find("atas", id); const p = getProp(a?.propostaId); if (!p) return toast("Proposta da ATA não encontrada.", "erro"); gerarPdfAta(a, p); },
      excluir: async (id) => {
        const a = store.find("atas", id);
        if (!await confirmar("Excluir esta ATA?" + (a?.ataOrigemId ? " A proposta-espelho da renovação também será removida." : ""), { ok: "Excluir", perigo: true })) return;
        if (a?.ataOrigemId) { const pe = getProp(a.propostaId); if (pe && isEspelho(pe)) await store.remove("propostas", pe.id); }
        await store.remove("atas", id); toast("ATA excluída.");
      },
      excel: () => exportarExcel(store.get("atas").map((a) => { const { p, l, o } = ctx(a); const v = ataValores(a);
        return { "Nº ATA": a.numero, Proposta: "#" + (p?.num || "?"), Órgão: o.nome || "", UASG: o.uasg || "", Pregão: l.numero || "", Assinatura: fmtD(a.assinatura), Vencimento: fmtD(a.vencimento), "Valor ATA": v.valor, Empenhado: v.empenhado, Saldo: v.saldo, Situação: situacao(a).txt, "Permite adesão": a.permiteAdesao || "" }; }), "ATAs", "atas"),
    });
    kpis();
    unsub = store.on("*", () => { kpis(); tabela.refresh(); });
  },
  destroy() { unsub?.(); stFiltro = ""; },
};

function infoProposta(p) {
  if (!p) return "";
  const l = getLicit(p.licitacaoId), o = getOrgao(l.orgaoId);
  return `<div><div class="k">Proposta</div>#${p.num || "?"} · ${esc(l.numero || "—")}</div><div><div class="k">Órgão</div>${esc(toTitleCase(o.nome || "—"))}</div><div><div class="k">Valor total</div><strong>${fmt(propTotal(p))}</strong></div><div><div class="k">Empenhado</div><span style="color:var(--green)">${fmt(propEmpenhado(p.id))}</span></div>`;
}

function abrirForm(a = null) {
  let orgSel, propSel;
  const pOld = a ? getProp(a.propostaId) : null; const lOld = pOld ? getLicit(pOld.licitacaoId) : null;
  formModal({
    titulo: a ? `Editar ATA ${a.numero}` : "Nova ATA", largura: "lg",
    extra: a ? `<button type="button" class="btn btn-ghost" data-pdf>${icon("print")} PDF</button>` : "",
    corpo:
      linha(`<div class="field"><span>Órgão</span><div id="org-ssel"></div></div>`, `<div class="field"><span>Proposta vencedora</span><div id="prop-ssel"></div></div>`)
      + `<div id="prop-info" class="info-box" ${pOld ? "" : "hidden"}>${infoProposta(pOld)}</div><div id="prop-aviso" class="help" style="color:var(--red)" hidden></div>`
      + linha(campo("Número da ATA", inputTxt("numero", a?.numero || "", 'required placeholder="ATA-001/2026"')), campo("Data de assinatura", inputData("assinatura", a?.assinatura || "")),
              campo("Validade (meses)", inputNum("validade", a?.validade || "", 'min="1" max="60" required')), campo("Vencimento", `<input type="date" name="vencimento" value="${esc(a?.vencimento || "")}" readonly style="background:var(--surface-2)">`))
      + linha(campo("Permite adesão (carona)?", select("permiteAdesao", [["", "Não definido"], ["nao", "Não"], ["sim", "Sim"]], a?.permiteAdesao || "")))
      + linha(campoAnexo("ATA assinada", "arq", a?.ataArqData), campoAnexo("Contrato", "ct", a?.ataCTData)),
    onAberto(form, m) {
      const atualizarVenc = () => { form.vencimento.value = calcVencimento(form.assinatura.value, form.validade.value); };
      form.assinatura.addEventListener("change", atualizarVenc); form.validade.addEventListener("input", atualizarVenc);
      const mostrar = (pid) => { const p = getProp(pid); const box = form.querySelector("#prop-info"); box.hidden = !p; box.innerHTML = infoProposta(p);
        const dup = store.get("atas").find((x) => x.propostaId === pid && x.id !== a?.id); const av = form.querySelector("#prop-aviso"); av.hidden = !dup; if (dup) av.textContent = `Atenção: já existe a ATA ${dup.numero} para esta proposta.`; };
      orgSel = ssel(form.querySelector("#org-ssel"), { placeholder: "Nome, UASG ou CNPJ do órgão…", itens: opcoesOrgaos(), value: lOld?.orgaoId || "",
        onSelect: (id) => { propSel.setItens(opcoesPropostas(id)); propSel.setValue(""); id ? propSel.enable("Selecione a proposta…") : propSel.disable("Selecione um órgão primeiro…"); mostrar(""); } });
      propSel = ssel(form.querySelector("#prop-ssel"), { placeholder: "Selecione um órgão primeiro…", itens: lOld ? opcoesPropostas(lOld.orgaoId) : [], value: a?.propostaId || "", disabled: !lOld, onSelect: mostrar });
      ligarDropzones(form);
      m.querySelector("[data-pdf]")?.addEventListener("click", () => gerarPdfAta(a, pOld));
    },
    async onSalvar(form) {
      const v = lerForm(form);
      if (!v.numero.trim() || !propSel.value || !v.assinatura || !v.validade) throw new Error("Preencha proposta, número, assinatura e validade.");
      if (store.get("atas").some((x) => x.propostaId === propSel.value && x.id !== a?.id)) throw new Error("Já existe uma ATA para esta proposta.");
      const id = a?.id || newId();
      const item = { ...(a || {}), id, numero: v.numero.trim(), propostaId: propSel.value, assinatura: v.assinatura, validade: v.validade, vencimento: v.vencimento, permiteAdesao: v.permiteAdesao, ataArqData: a?.ataArqData || "", ataCTData: a?.ataCTData || "" };
      const fa = form.arq.files[0], fc = form.ct.files[0];
      if (fa || fc) toast("Enviando anexos…", "info");
      if (fa) item.ataArqData = await uploadAnexo("atas", id, "ataArqData", fa);
      if (fc) item.ataCTData = await uploadAnexo("atas", id, "ataCTData", fc);
      await store.setItem("atas", item);
      closeModal(); toast(a ? "ATA atualizada." : "ATA criada.");
    },
  });
}

function abrirRenovacao(ata) {
  const p = getProp(ata?.propostaId); if (!ata || !p) return toast("Proposta da ATA não encontrada.", "erro");
  const l = getLicit(p.licitacaoId), o = getOrgao(l.orgaoId);
  const ger = ataGeracao(ata), itens = p.itens || [];
  formModal({
    titulo: `Renovar ATA ${ata.numero}`, largura: "lg", salvarTexto: "Confirmar renovação",
    corpo: `
      <div class="info-box" style="grid-template-columns:repeat(2,1fr)"><div><div class="k">ATA atual</div>${esc(ata.numero)}${ger > 1 ? ` (${ger}ª vigência)` : ""}</div><div><div class="k">Órgão</div>${esc(toTitleCase(o.nome || "—"))}</div><div><div class="k">Vencimento atual</div>${fmtD(ata.vencimento)}</div><div><div class="k">Pregão</div>${esc(l.numero || "—")} · UASG ${esc(o.uasg || "—")}</div></div>
      <p class="help">A renovação cria uma <strong>nova vigência com saldo cheio</strong>. A ATA anterior é preservada com seus empenhos e histórico. Ajuste abaixo preços e quantidades da nova vigência.</p>
      ${linha(campo("Nº da nova ATA", inputTxt("numero", `${(ata.numero || "").replace(/-R\d+$/, "")}-R${ger}`, "required")), campo("Data de assinatura", inputData("assinatura", "")), campo("Validade (meses)", inputNum("validade", ata.validade || 12, 'min="1" max="60" required')), campo("Vencimento", `<input type="date" name="vencimento" readonly style="background:var(--surface-2)">`))}
      <div class="form-section">Itens da nova vigência</div>
      <div class="table-wrap"><table><thead><tr><th>Nº</th><th>Item</th><th>Código</th><th style="width:100px">Qtd</th><th style="width:120px">Preço unit.</th><th class="num">Total</th></tr></thead>
      <tbody>${itens.map((it, i) => h`<tr><td>${it.num || i + 1}</td><td>${it.nome || "—"}</td><td>${it.codigo || "—"}</td><td><input type="number" class="input input-sm" name="q${i}" value="${it.qtd || 0}" min="0" step="0.01" style="width:90px"></td><td><input type="number" class="input input-sm" name="p${i}" value="${it.preco || 0}" min="0" step="0.01" style="width:110px"></td><td class="num" id="rt${i}">${fmt((it.qtd || 0) * (it.preco || 0))}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="5" style="text-align:right;font-weight:600">Total da nova vigência</td><td class="num" id="r-total" style="font-weight:700;color:var(--purple)"></td></tr></tfoot></table></div>
      ${linha(campoAnexo("Nova ATA / termo aditivo", "arq"), campoAnexo("Contrato", "ct"))}`,
    onAberto(form) {
      const calc = () => { let t = 0; itens.forEach((_, i) => { const q = +form[`q${i}`].value || 0, pr = +form[`p${i}`].value || 0; form.querySelector(`#rt${i}`).textContent = fmt(q * pr); t += q * pr; }); form.querySelector("#r-total").textContent = fmt(t); };
      form.addEventListener("input", calc); calc();
      const venc = () => { form.vencimento.value = calcVencimento(form.assinatura.value, form.validade.value); };
      form.assinatura.addEventListener("change", venc); form.validade.addEventListener("input", venc);
      ligarDropzones(form);
    },
    async onSalvar(form) {
      const v = lerForm(form);
      if (!v.numero.trim() || !v.assinatura || !v.validade) throw new Error("Preencha número, assinatura e validade.");
      const novosItens = itens.map((base, i) => { const q = +form[`q${i}`].value || 0, pr = +form[`p${i}`].value || 0; return { ...base, qtd: q, preco: pr, total: q * pr }; });
      const espelho = { id: newId(), num: p.num, licitacaoId: p.licitacaoId, status: "Vencida", itens: novosItens, espelhoDeAtaId: ata.id, geracao: ger + 1, criadoEm: new Date().toISOString() };
      const novaId = newId();
      const nova = { id: novaId, numero: v.numero.trim(), propostaId: espelho.id, assinatura: v.assinatura, validade: v.validade, vencimento: v.vencimento, ataOrigemId: ata.id, geracao: ger + 1, permiteAdesao: ata.permiteAdesao || "", ataArqData: "", ataCTData: "" };
      const fa = form.arq.files[0], fc = form.ct.files[0];
      if (fa || fc) toast("Enviando anexos…", "info");
      if (fa) nova.ataArqData = await uploadAnexo("atas", novaId, "ataArqData", fa);
      if (fc) nova.ataCTData = await uploadAnexo("atas", novaId, "ataCTData", fc);
      await store.setItem("propostas", espelho);
      await store.setItem("atas", nova);
      closeModal(); toast(`ATA renovada: ${nova.numero} criada com saldo cheio.`);
    },
  });
}

// Licitações. Campos: id, numero, tipo, data, portalId, orgaoId, obs,
// editalData, editalNome, trData, trNome (anexos: URL do Storage ou JSON legado)
import { store, newId } from "../core/store.js?v=20261113-182835";
import { dataTable, acoes, btnEditar, btnExcluir, onAction } from "../core/table.js?v=20261113-182835";
import { formModal, lerForm, campo, inputTxt, inputData, select, textarea, linha, exportarExcel } from "../core/forms.js?v=20261113-182835";
import { toast, confirmar, closeModal, icon, tag } from "../core/ui.js?v=20261113-182835";
import { esc, h, raw, fmtD, toTitleCase } from "../core/utils.js?v=20261113-182835";
import { podeEditar } from "../core/auth.js?v=20261113-182835";
import { getOrgao, getPortal } from "../core/domain.js?v=20261113-182835";
import { ssel } from "../core/ssel.js?v=20261113-182835";
import { uploadAnexo, anexoBotoes, campoAnexo, ligarDropzones } from "../core/files.js?v=20261113-182835";

export const TIPOS = ["Pregão Eletrônico", "Dispensa Eletrônica", "Tomada de Preços", "Concorrência"];
let unsub = null;
let portalFiltro = "";

export const opcoesOrgaos = () => store.get("orgaos").map((o) => ({
  id: o.id, label: toTitleCase(o.nome),
  sub: `UASG ${o.uasg || "—"} · ${o.municipio || ""}${o.municipio && o.estado ? "/" : ""}${o.estado || ""}${o.cnpj ? " · CNPJ " + o.cnpj : ""}`,
  extra: [o.uasg, o.cnpj, ...(o.contatos || []).map((c) => c.email)].filter(Boolean).join(" "),
})).sort((a, b) => a.label.localeCompare(b.label));

export default {
  id: "licitacoes", titulo: "Licitações", grupo: "Licitações", icone: "clipboard",

  render(el) {
    portalFiltro = "";
    const propsDe = (id) => store.get("propostas").filter((p) => p.licitacaoId === id);

    el.innerHTML = `
      <div class="grid grid-4" id="kpis" style="margin-bottom:16px"></div>
      <div class="page-head"><h2>Licitações</h2>
        <div class="actions">
          <a class="btn btn-ghost" href="#edital">${icon("bulb")} Analisar edital (IA)</a>
          <button class="btn btn-ghost" data-act="excel">${icon("download")} Excel</button>
          ${podeEditar() ? `<button class="btn btn-primary" data-act="novo">${icon("plus")} Nova licitação</button>` : ""}
        </div></div>
      <div class="card"><div class="chip-filters" id="chips"></div><div class="card-body flush" id="tbl"></div></div>`;

    const chips = () => {
      const usados = store.get("portais").filter((p) => store.get("licitacoes").some((l) => l.portalId === p.id));
      el.querySelector("#chips").innerHTML = `<span class="muted">Portal:</span>
        <button class="chip ${!portalFiltro ? "active" : ""}" data-act="portal" data-id="">Todos</button>
        ${usados.map((p) => `<button class="chip ${portalFiltro === p.id ? "active" : ""}" data-act="portal" data-id="${esc(p.id)}">${esc(p.sigla)}</button>`).join("")}`;
    };
    const kpis = () => {
      const lics = store.get("licitacoes").filter((l) => !portalFiltro || l.portalId === portalFiltro);
      const com = lics.filter((l) => propsDe(l.id).length).length;
      el.querySelector("#kpis").innerHTML = `
        <div class="kpi"><div class="kpi-label">Licitações</div><div class="kpi-value">${lics.length}</div></div>
        <div class="kpi"><div class="kpi-label">Com proposta</div><div class="kpi-value" style="color:var(--green)">${com}</div></div>
        <div class="kpi"><div class="kpi-label">Sem proposta</div><div class="kpi-value" style="color:${lics.length - com ? "var(--amber-txt)" : "inherit"}">${lics.length - com}</div></div>
        <div class="kpi"><div class="kpi-label">Com anexos</div><div class="kpi-value">${lics.filter((l) => l.editalData || l.trData).length}</div></div>`;
    };

    const tabela = dataTable({
      el: el.querySelector("#tbl"),
      rows: () => store.get("licitacoes").filter((l) => !portalFiltro || l.portalId === portalFiltro),
      search: (l, q) => { const o = getOrgao(l.orgaoId); return [l.numero, l.tipo, l.obs, o.nome, o.uasg, o.cnpj, getPortal(l.portalId).sigla, ...(o.contatos || []).map((c) => c.email)].some((x) => (x || "").toLowerCase().includes(q)); },
      placeholder: "Buscar número, órgão, UASG, tipo, portal…",
      sort: { key: "data", dir: "desc" },
      empty: "Nenhuma licitação cadastrada",
      columns: [
        { key: "data", label: "Data", width: "100px", render: (l) => fmtD(l.data) },
        { key: "uasg", label: "UASG", width: "90px", sort: (l) => getOrgao(l.orgaoId).uasg || "", render: (l) => { const u = getOrgao(l.orgaoId).uasg; return u ? tag(u, "tag-purple") : '<span class="muted">—</span>'; } },
        { key: "numero", label: "Número", render: (l) => `<strong>${esc(l.numero)}</strong>${l.origemIA ? ` ${tag("IA", "tag-teal")}` : ""}` },
        { key: "orgao", label: "Órgão", sort: (l) => getOrgao(l.orgaoId).nome || "", render: (l) => esc(toTitleCase(getOrgao(l.orgaoId).nome || "—")) },
        { key: "tipo", label: "Tipo", render: (l) => tag(l.tipo || "—", "tag-blue") },
        { key: "portal", label: "Portal", sort: (l) => getPortal(l.portalId).sigla || "", render: (l) => tag(getPortal(l.portalId).sigla || "—", "tag-gray") },
        { key: "props", label: "Propostas", sort: (l) => propsDe(l.id).length, render: (l) => { const n = propsDe(l.id).length; return n === 0 ? tag("Sem proposta", "tag-orange") : tag(`${n} proposta${n > 1 ? "s" : ""}`, "tag-green"); } },
        { key: "anexos", label: "Anexos", sort: false, render: (l) => `${anexoBotoes(l.editalData, "Edital", l.editalNome)} ${anexoBotoes(l.trData, "TR", l.trNome)}` || '<span class="muted">—</span>' },
        { key: "obs", label: "Obs.", sort: false, width: "60px", render: (l) => l.obs ? `<span class="tag tag-amber obs-tip" title="${esc(l.obs)}">${icon("file", "ic-inline")}</span>` : "" },
        { key: "acoes", label: "", sort: false, width: "90px", render: (l) => podeEditar()
          ? acoes(btnEditar(l.id), btnExcluir(l.id, propsDe(l.id).length ? `${propsDe(l.id).length} proposta(s) vinculada(s)` : "")) : "" },
      ],
    });

    onAction(el, {
      portal: (id) => { portalFiltro = id; chips(); kpis(); tabela.refresh(); },
      novo: () => abrirForm(),
      editar: (id) => abrirForm(store.find("licitacoes", id)),
      excluir: async (id) => {
        if (!await confirmar("Excluir esta licitação?", { ok: "Excluir", perigo: true })) return;
        await store.remove("licitacoes", id); toast("Licitação excluída.");
      },
      excel: () => exportarExcel(store.get("licitacoes").map((l) => { const o = getOrgao(l.orgaoId);
        return { Número: l.numero, Tipo: l.tipo || "", Data: fmtD(l.data), UASG: o.uasg || "", Órgão: o.nome || "", Portal: getPortal(l.portalId).sigla || "", Observações: l.obs || "" }; }), "Licitações", "licitacoes"),
    });

    chips(); kpis();
    unsub = store.on("*", () => { chips(); kpis(); tabela.refresh(); });
  },

  destroy() { unsub?.(); portalFiltro = ""; },
};

function abrirForm(l = null) {
  const portais = store.get("portais").slice().sort((a, b) => a.sigla.localeCompare(b.sigla));
  let orgSel;
  formModal({
    titulo: l ? "Editar licitação" : "Nova licitação", largura: "lg",
    corpo:
      linha(campo("Tipo", select("tipo", [["", "Selecione…"], ...TIPOS], l?.tipo || "", "required")),
            campo("Número", inputTxt("numero", l?.numero || "", 'required placeholder="001/2026"')),
            campo("Data", inputData("data", l?.data || "")))
      + linha(campo("Portal", select("portalId", [["", "Selecione…"], ...portais.map((p) => [p.id, `${p.sigla} — ${p.nome}`])], l?.portalId || "")),
              `<div class="field"><span>Órgão</span><div id="org-ssel"></div></div>`)
      + linha(campoAnexo("Edital", "edital", l?.editalData, l?.editalNome), campoAnexo("Termo de referência", "tr", l?.trData, l?.trNome))
      + linha(campo("Observações", textarea("obs", l?.obs || ""))),
    onAberto(form) {
      orgSel = ssel(form.querySelector("#org-ssel"), { name: "orgaoId", placeholder: "Digite UASG, nome ou CNPJ…", itens: opcoesOrgaos(), value: l?.orgaoId || "" });
      ligarDropzones(form);
    },
    async onSalvar(form) {
      const v = lerForm(form);
      if (!v.numero.trim() || !v.tipo || !v.data) throw new Error("Preencha tipo, número e data.");
      const id = l?.id || newId();
      const item = { ...(l || {}), id, numero: v.numero.trim(), tipo: v.tipo, data: v.data, portalId: v.portalId, orgaoId: orgSel.value, obs: v.obs.trim(),
        editalData: l?.editalData || "", editalNome: l?.editalNome || "", trData: l?.trData || "", trNome: l?.trNome || "" };
      const fEd = form.edital.files[0], fTr = form.tr.files[0];
      if (fEd || fTr) toast("Enviando anexos…", "info");
      if (fEd) { item.editalData = await uploadAnexo("licitacoes", id, "editalData", fEd); item.editalNome = fEd.name; }
      if (fTr) { item.trData = await uploadAnexo("licitacoes", id, "trData", fTr); item.trNome = fTr.name; }
      await store.setItem("licitacoes", item);
      closeModal(); toast(l ? "Licitação atualizada." : "Licitação criada.");
    },
  });
}

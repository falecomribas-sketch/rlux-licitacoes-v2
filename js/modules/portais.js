// Portais de licitação. Campos: id, sigla, nome, url, obs
import { store, newId } from "../core/store.js?v=20261113-143639";
import { dataTable, acoes, btnEditar, btnExcluir, onAction } from "../core/table.js?v=20261113-143639";
import { formModal, lerForm, campo, inputTxt, textarea, linha, exportarExcel } from "../core/forms.js?v=20261113-143639";
import { toast, confirmar, closeModal, icon, tag } from "../core/ui.js?v=20261113-143639";
import { esc, h, raw } from "../core/utils.js?v=20261113-143639";
import { podeEditar } from "../core/auth.js?v=20261113-143639";
import { getOrgao } from "../core/domain.js?v=20261113-143639";
import { popover } from "../core/popover.js?v=20261113-143639";

let unsub = null;

export default {
  id: "portais", titulo: "Portais", grupo: "Cadastros", icone: "globe",

  render(el) {
    const lics = () => store.get("licitacoes");
    const licsDe = (id) => lics().filter((l) => l.portalId === id);

    el.innerHTML = `
      <div class="grid grid-3" id="kpis" style="margin-bottom:16px"></div>
      <div class="page-head"><h2>Portais</h2>
        <div class="actions">
          <button class="btn btn-ghost" data-act="excel">${icon("download")} Excel</button>
          ${podeEditar() ? `<button class="btn btn-primary" data-act="novo">${icon("plus")} Novo portal</button>` : ""}
        </div></div>
      <div class="card"><div class="card-body flush" id="tbl"></div></div>`;

    const kpis = () => {
      const todos = store.get("portais");
      const ativos = todos.filter((p) => licsDe(p.id).length).length;
      el.querySelector("#kpis").innerHTML = `
        <div class="kpi"><div class="kpi-label">Portais cadastrados</div><div class="kpi-value">${todos.length}</div></div>
        <div class="kpi"><div class="kpi-label">Com licitações</div><div class="kpi-value">${ativos}</div></div>
        <div class="kpi"><div class="kpi-label">Sem uso</div><div class="kpi-value">${todos.length - ativos}</div></div>`;
    };

    const tabela = dataTable({
      el: el.querySelector("#tbl"),
      rows: () => store.get("portais"),
      search: (p, q) => [p.sigla, p.nome, p.url, p.obs].some((x) => (x || "").toLowerCase().includes(q)),
      placeholder: "Buscar por sigla ou nome…",
      sort: { key: "sigla", dir: "asc" },
      empty: "Nenhum portal cadastrado",
      columns: [
        { key: "sigla", label: "Sigla", width: "90px", render: (p) => tag(p.sigla, "tag-blue") },
        { key: "nome", label: "Nome", render: (p) => `<strong>${esc(p.nome)}</strong>` },
        { key: "url", label: "Endereço", render: (p) => p.url ? h`<a href="${p.url}" target="_blank" rel="noopener">${p.url.replace(/^https?:\/\//, "").split("/")[0]}</a>` : '<span class="muted">—</span>' },
        { key: "lics", label: "Licitações", num: true, sort: (p) => licsDe(p.id).length,
          render: (p) => licsDe(p.id).length ? `<button class="link-btn" data-act="lics" data-id="${esc(p.id)}">${licsDe(p.id).length}</button>` : '<span class="muted">0</span>' },
        { key: "obs", label: "Observações", render: (p) => p.obs ? h`<span class="muted" title="${p.obs}">${p.obs.slice(0, 50)}${p.obs.length > 50 ? "…" : ""}</span>` : '<span class="muted">—</span>' },
        { key: "acoes", label: "", sort: false, width: "90px", render: (p) => podeEditar()
          ? acoes(btnEditar(p.id), btnExcluir(p.id, licsDe(p.id).length ? `${licsDe(p.id).length} licitação(ões) usam este portal` : "")) : "" },
      ],
    });

    onAction(el, {
      novo: () => abrirForm(),
      editar: (id) => abrirForm(store.find("portais", id)),
      excluir: async (id) => {
        if (!await confirmar("Excluir este portal?", { ok: "Excluir", perigo: true })) return;
        await store.remove("portais", id); toast("Portal excluído.");
      },
      lics: (id, btn) => {
        const p = store.find("portais", id);
        const itens = licsDe(id).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
        popover(btn, {
          titulo: `${p.sigla} — ${itens.length} licitação(ões)`,
          corpo: itens.map((l) => { const o = getOrgao(l.orgaoId);
            return h`<div class="list-item"><div class="list-main"><div class="list-title">${l.numero}</div><div class="list-sub">${o.nome || "Órgão não informado"}</div></div>${raw(tag(l.tipo || "—", "tag-gray"))}</div>`; }).join(""),
        });
      },
      excel: () => exportarExcel(store.get("portais").map((p) => ({ Sigla: p.sigla, Nome: p.nome, URL: p.url || "", Licitações: licsDe(p.id).length, Observações: p.obs || "" })), "Portais", "portais"),
    });

    kpis();
    unsub = store.on("*", () => { kpis(); tabela.refresh(); });
  },

  destroy() { unsub?.(); },
};

function abrirForm(p = null) {
  formModal({
    titulo: p ? "Editar portal" : "Novo portal",
    corpo: linha(campo("Sigla", inputTxt("sigla", p?.sigla || "", 'required placeholder="Ex.: BLL"')), campo("Nome", inputTxt("nome", p?.nome || "", 'required placeholder="Ex.: Bolsa de Licitações do Brasil"')))
      + linha(campo("Endereço do portal", inputTxt("url", p?.url || "", 'placeholder="https://…"')))
      + linha(campo("Observações", textarea("obs", p?.obs || "", 'placeholder="Informações úteis sobre o portal"'))),
    async onSalvar(form) {
      const v = lerForm(form);
      if (!v.sigla.trim() || !v.nome.trim()) throw new Error("Preencha sigla e nome.");
      await store.setItem("portais", { id: p?.id || newId(), sigla: v.sigla.trim(), nome: v.nome.trim(), url: v.url.trim(), obs: v.obs.trim() });
      closeModal(); toast(p ? "Portal atualizado." : "Portal criado.");
    },
  });
}

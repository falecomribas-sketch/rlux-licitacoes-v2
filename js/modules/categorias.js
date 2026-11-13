// Categorias de produtos. Campos: id, nome, cor
import { store, newId } from "../core/store.js?v=20261113-135731";
import { dataTable, acoes, btnEditar, btnExcluir, onAction } from "../core/table.js?v=20261113-135731";
import { formModal, lerForm, campo, inputTxt, linha } from "../core/forms.js?v=20261113-135731";
import { toast, confirmar, closeModal, icon } from "../core/ui.js?v=20261113-135731";
import { esc } from "../core/utils.js?v=20261113-135731";
import { podeEditar } from "../core/auth.js?v=20261113-135731";

let unsub = null;

export default {
  id: "categorias", titulo: "Categorias", grupo: "Cadastros", icone: "tag",

  render(el) {
    el.innerHTML = `
      <div class="page-head"><h2>Categorias de produtos</h2>
        <div class="actions">${podeEditar() ? `<button class="btn btn-primary" data-act="novo">${icon("plus")} Nova categoria</button>` : ""}</div></div>
      <div class="card"><div class="card-body flush" id="tbl"></div></div>`;

    const qtdProd = (id) => store.get("produtos").filter((p) => p.catId === id).length;

    const tabela = dataTable({
      el: el.querySelector("#tbl"),
      rows: () => store.get("categorias"),
      search: (c, q) => (c.nome || "").toLowerCase().includes(q),
      placeholder: "Buscar categoria…",
      sort: { key: "nome", dir: "asc" },
      empty: "Nenhuma categoria", emptySub: "Crie a primeira com o botão acima.",
      columns: [
        { key: "nome", label: "Nome", render: (c) => `<span class="color-dot" style="background:${esc(c.cor || "#3b82f6")}"></span><strong>${esc(c.nome)}</strong>` },
        { key: "qtd", label: "Produtos", num: true, sort: (c) => qtdProd(c.id), render: (c) => String(qtdProd(c.id)) },
        { key: "acoes", label: "", sort: false, width: "90px", render: (c) => podeEditar()
          ? acoes(btnEditar(c.id), btnExcluir(c.id, qtdProd(c.id) ? `${qtdProd(c.id)} produto(s) usam esta categoria` : "")) : "" },
      ],
    });

    onAction(el, {
      novo: () => abrirForm(),
      editar: (id) => abrirForm(store.find("categorias", id)),
      excluir: async (id) => {
        if (!await confirmar("Excluir esta categoria?", { ok: "Excluir", perigo: true })) return;
        await store.remove("categorias", id);
        toast("Categoria excluída.");
      },
    });

    unsub = store.on("*", () => tabela.refresh());
  },

  destroy() { unsub?.(); },
};

function abrirForm(c = null) {
  formModal({
    titulo: c ? "Editar categoria" : "Nova categoria",
    largura: "sm",
    corpo: linha(
      campo("Nome", inputTxt("nome", c?.nome || "", 'required placeholder="Ex.: Iluminação pública"')),
      campo("Cor", `<input type="color" name="cor" value="${esc(c?.cor || "#3b82f6")}">`),
    ),
    async onSalvar(form) {
      const v = lerForm(form);
      const nome = v.nome.trim();
      if (!nome) throw new Error("Informe o nome da categoria.");
      await store.setItem("categorias", { id: c?.id || newId(), nome, cor: v.cor });
      closeModal();
      toast(c ? "Categoria atualizada." : "Categoria criada.");
    },
  });
}

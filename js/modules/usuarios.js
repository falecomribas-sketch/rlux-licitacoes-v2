// Usuários. Perfil em `usuarios` (nome, email, perfil, ativo) + conta no Firebase Auth.
//
// Na versão atual não era possível criar a conta de acesso pelo sistema (só o
// perfil); a conta tinha que ser criada no console do Firebase. Aqui usamos
// uma segunda instância do app só para criar a conta, sem derrubar a sessão
// do administrador.
import { store, newId } from "../core/store.js?v=20261113-115023";
import { app } from "../core/firebase.js?v=20261113-115023";
import { dataTable, acoes, btnEditar, btnExcluir, onAction } from "../core/table.js?v=20261113-115023";
import { formModal, lerForm, campo, inputTxt, select, linha } from "../core/forms.js?v=20261113-115023";
import { toast, confirmar, closeModal, icon, tag } from "../core/ui.js?v=20261113-115023";
import { esc, fmtD } from "../core/utils.js?v=20261113-115023";
import { currentUser, isAdmin } from "../core/auth.js?v=20261113-115023";
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const PERFIS = ["Admin", "Operador", "Visualizador"];
const COR_PERFIL = { Admin: "tag-purple", Operador: "tag-blue", Visualizador: "tag-gray" };
let unsub = null;

export default {
  id: "usuarios", titulo: "Usuários", grupo: "CRM e análise", icone: "users",

  render(el) {
    if (!isAdmin()) {
      el.innerHTML = `<div class="card"><div class="placeholder">${icon("users")}<h3>Só administradores gerenciam usuários</h3><p>Peça a um administrador para alterar perfis ou criar acessos.</p></div></div>`;
      return;
    }
    el.innerHTML = `
      <div class="page-head"><h2>Usuários</h2>
        <div class="actions"><button class="btn btn-primary" data-act="novo">${icon("plus")} Novo usuário</button></div></div>
      <div class="card"><div class="card-body flush" id="tbl"></div></div>
      <p class="help">Perfis: <strong>Admin</strong> faz tudo, inclusive gerenciar usuários · <strong>Operador</strong> cadastra e edita · <strong>Visualizador</strong> só consulta.</p>`;

    const tabela = dataTable({
      el: el.querySelector("#tbl"),
      rows: () => store.get("usuarios"),
      search: (u, q) => [u.nome, u.email, u.perfil].some((x) => (x || "").toLowerCase().includes(q)),
      placeholder: "Buscar usuário…",
      sort: { key: "nome", dir: "asc" },
      columns: [
        { key: "nome", label: "Nome", render: (u) => `<strong>${esc(u.nome)}</strong>${u.id === currentUser?.id ? ' <span class="muted">(você)</span>' : ""}` },
        { key: "email", label: "E-mail" },
        { key: "perfil", label: "Perfil", render: (u) => tag(u.perfil || "—", COR_PERFIL[u.perfil] || "tag-gray") },
        { key: "ativo", label: "Situação", render: (u) => u.ativo === false ? tag("Inativo", "tag-red") : tag("Ativo", "tag-green") },
        { key: "criadoEm", label: "Criado em", render: (u) => u.criadoEm ? fmtD(u.criadoEm) : "—" },
        { key: "acoes", label: "", sort: false, width: "90px", render: (u) => acoes(btnEditar(u.id), btnExcluir(u.id, u.id === currentUser?.id ? "Você não pode excluir seu próprio usuário" : "")) },
      ],
    });

    onAction(el, {
      novo: () => abrirForm(),
      editar: (id) => abrirForm(store.find("usuarios", id)),
      excluir: async (id) => {
        const u = store.find("usuarios", id);
        if (!await confirmar(`Excluir o usuário ${u?.nome}? O perfil some do sistema; a conta de acesso é desativada ao marcar "inativo" ou removida no console do Firebase.`, { ok: "Excluir", perigo: true })) return;
        await store.remove("usuarios", id); toast("Usuário excluído.");
      },
    });

    unsub = store.on("usuarios", () => tabela.refresh());
  },

  destroy() { unsub?.(); },
};

function abrirForm(u = null) {
  const novo = !u;
  formModal({
    titulo: novo ? "Novo usuário" : "Editar usuário",
    extra: novo ? "" : `<button type="button" class="btn btn-ghost" data-reset>${icon("mail")} Enviar redefinição de senha</button>`,
    corpo:
      linha(campo("Nome", inputTxt("nome", u?.nome || "", "required")), campo("E-mail", `<input type="email" name="email" value="${esc(u?.email || "")}" required ${novo ? "" : "readonly"}>`))
      + linha(campo("Perfil", select("perfil", PERFIS, u?.perfil || "Operador")),
              novo ? campo("Senha inicial", `<input type="password" name="senha" minlength="6" required placeholder="mínimo 6 caracteres" autocomplete="new-password">`) : `<div class="field"><span>Acesso</span><label class="switch" style="margin-top:8px"><input type="checkbox" name="ativo" ${u?.ativo !== false ? "checked" : ""}> Usuário ativo</label></div>`)
      + (novo ? `<p class="help">A conta de acesso é criada agora com esta senha; a pessoa pode trocá-la depois pelo link "Esqueci minha senha" na tela de login ou você envia uma redefinição por aqui.</p>` : ""),
    onAberto(form, m) {
      m.querySelector("[data-reset]")?.addEventListener("click", async () => {
        try { await sendPasswordResetEmail(getAuth(app), u.email); toast(`E-mail de redefinição enviado para ${u.email}.`); }
        catch (e) { toast("Não foi possível enviar: " + (e.code === "auth/user-not-found" ? "este e-mail não tem conta de acesso." : e.message), "erro"); }
      });
    },
    async onSalvar(form) {
      const v = lerForm(form);
      const nome = v.nome.trim(), email = v.email.trim().toLowerCase();
      if (!nome || !email) throw new Error("Preencha nome e e-mail.");
      if (store.get("usuarios").some((x) => (x.email || "").toLowerCase() === email && x.id !== u?.id)) throw new Error("Já existe um usuário com este e-mail.");

      if (novo) {
        // Cria a conta em uma instância secundária para não trocar a sessão atual
        const sec = getApps().find((a) => a.name === "secundario") || initializeApp(app.options, "secundario");
        const secAuth = getAuth(sec);
        try { await createUserWithEmailAndPassword(secAuth, email, v.senha); }
        catch (e) {
          if (e.code === "auth/email-already-in-use") { /* conta já existe: só criamos o perfil */ }
          else if (e.code === "auth/weak-password") throw new Error("A senha precisa ter pelo menos 6 caracteres.");
          else throw new Error("Não foi possível criar a conta de acesso: " + e.message);
        }
        try { await signOut(secAuth); } catch {}
      }

      await store.setItem("usuarios", {
        ...(u || {}), id: u?.id || newId(), nome, email, perfil: v.perfil,
        ativo: novo ? true : form.ativo.checked, criadoEm: u?.criadoEm || new Date().toISOString(),
      });
      closeModal(); toast(novo ? "Usuário criado com acesso." : "Usuário atualizado.");
    },
  });
}

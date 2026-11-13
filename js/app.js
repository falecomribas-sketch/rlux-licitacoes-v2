// Ponto de entrada: login -> store -> navegação -> módulos.
import { onAuth, login, logout, esqueciSenha } from "./core/auth.js?v=20261113-203913";
import { store } from "./core/store.js?v=20261113-203913";
import { registerModule, buildNav, startRouter } from "./core/router.js?v=20261113-203913";
import { icon, toast } from "./core/ui.js?v=20261113-203913";
import { $ } from "./core/utils.js?v=20261113-203913";
import { iniciarVerificacaoDeVersao } from "./core/version.js?v=20261113-203913";

import dashboard from "./modules/dashboard.js?v=20261113-203913";
import categorias from "./modules/categorias.js?v=20261113-203913";
import produtos from "./modules/produtos.js?v=20261113-203913";
import portais from "./modules/portais.js?v=20261113-203913";
import orgaos from "./modules/orgaos.js?v=20261113-203913";
import usuarios from "./modules/usuarios.js?v=20261113-203913";
import licitacoes from "./modules/licitacoes.js?v=20261113-203913";
import edital from "./modules/edital.js?v=20261113-203913";
import propostas from "./modules/propostas.js?v=20261113-203913";
import atas from "./modules/atas.js?v=20261113-203913";
import adesoes from "./modules/adesoes.js?v=20261113-203913";
import empenhos from "./modules/empenhos.js?v=20261113-203913";
import exequibilidade from "./modules/exequibilidade.js?v=20261113-203913";
import reequilibrio from "./modules/reequilibrio.js?v=20261113-203913";
import cobrancas from "./modules/cobrancas.js?v=20261113-203913";
import crm from "./modules/crm.js?v=20261113-203913";
import reguas from "./modules/reguas.js?v=20261113-203913";
import relatorios from "./modules/relatorios.js?v=20261113-203913";
import parametros from "./modules/parametros.js?v=20261113-203913";

// Ordem define a ordem do menu
registerModule(dashboard);
registerModule(categorias);
registerModule(produtos);
registerModule(portais);
registerModule(orgaos);
registerModule(edital);
registerModule(licitacoes);
registerModule(propostas);
registerModule(atas);
registerModule(adesoes);
registerModule(empenhos);
registerModule(exequibilidade);
registerModule(reequilibrio);
registerModule(cobrancas);
registerModule(crm);
registerModule(reguas);
registerModule(relatorios);
registerModule(parametros);
registerModule(usuarios);

const elLogin = $("#login");
const elApp = $("#app");
const form = $("#login-form");
const erro = $("#login-error");

$("#logout-btn").innerHTML = icon("logout");
$("#menu-btn").innerHTML = icon("menu");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#login-btn");
  erro.hidden = true;
  btn.disabled = true; btn.textContent = "Entrando…";
  try {
    await login(form.email.value, form.senha.value, !!form.lembrar?.checked);
    // onAuth cuida do resto
  } catch (err) {
    erro.textContent = err.message; erro.hidden = false;
    btn.disabled = false; btn.textContent = "Entrar";
  }
});

$("#login-olho")?.addEventListener("click", (e) => { const b = e.currentTarget, i = form.senha; const mostrar = i.type === "password"; i.type = mostrar ? "text" : "password"; b.setAttribute("aria-pressed", String(mostrar)); b.setAttribute("aria-label", mostrar ? "Ocultar senha" : "Mostrar senha"); i.focus(); });
$("#login-esqueci").addEventListener("click", async (e) => {
  e.preventDefault(); erro.hidden = true;
  try { await esqueciSenha(form.email.value); erro.style.color = "var(--green)"; erro.textContent = "Se este e-mail tiver conta, enviamos um link para criar uma nova senha. Confira também a caixa de spam."; erro.hidden = false; }
  catch (err) { erro.style.color = ""; erro.textContent = err.message; erro.hidden = false; }
});
$("#logout-btn").addEventListener("click", () => logout());
$("#menu-btn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
$("#sidebar-scrim").addEventListener("click", () => document.body.classList.remove("nav-open"));

let started = false;
onAuth((perfil, msgErro) => {
  clearTimeout(window.__splashTimer);
  $("#splash")?.remove();
  if (!perfil) {
    elApp.hidden = true; elLogin.hidden = false;
    const btn = $("#login-btn"); btn.disabled = false; btn.textContent = "Entrar";
    if (msgErro) { erro.textContent = msgErro; erro.hidden = false; }
    started = false;
    return;
  }
  $("#user-name").textContent = perfil.nome || perfil.email;
  $("#user-role").textContent = perfil.perfil || "";
  $("#user-avatar").textContent = (perfil.nome || perfil.email || "A")[0].toUpperCase();
  $("#topbar-date").textContent = new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });
  elLogin.hidden = true; elApp.hidden = false;
  if (!started) { started = true; buildNav(); startRouter(); iniciarVerificacaoDeVersao(); }
});

// Indicador de conexão
const dot = $("#sync-dot");
const setOnline = (on) => { dot.classList.toggle("off", !on); dot.title = on ? "Conectado" : "Sem internet — alterações serão enviadas ao reconectar"; };
window.addEventListener("online", () => { setOnline(true); toast("Conexão restabelecida", "ok"); });
window.addEventListener("offline", () => { setOnline(false); toast("Sem internet. Você pode continuar; as alterações serão enviadas ao reconectar.", "info", 5000); });
setOnline(navigator.onLine);

// Acesso para diagnóstico/testes (console): window.__rlux.store
window.__rlux = { store };

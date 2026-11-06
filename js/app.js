// Ponto de entrada: login -> store -> navegação -> módulos.
import { onAuth, login, logout } from "./core/auth.js";
import { store } from "./core/store.js";
import { registerModule, buildNav, startRouter } from "./core/router.js";
import { icon, toast } from "./core/ui.js";
import { $ } from "./core/utils.js";
import { iniciarVerificacaoDeVersao } from "./core/version.js";

import dashboard from "./modules/dashboard.js";
import categorias from "./modules/categorias.js";
import produtos from "./modules/produtos.js";
import portais from "./modules/portais.js";
import orgaos from "./modules/orgaos.js";
import usuarios from "./modules/usuarios.js";
import licitacoes from "./modules/licitacoes.js";
import edital from "./modules/edital.js";
import propostas from "./modules/propostas.js";
import atas from "./modules/atas.js";
import adesoes from "./modules/adesoes.js";
import empenhos from "./modules/empenhos.js";
import exequibilidade from "./modules/exequibilidade.js";
import reequilibrio from "./modules/reequilibrio.js";
import cobrancas from "./modules/cobrancas.js";
import crm from "./modules/crm.js";
import reguas from "./modules/reguas.js";
import relatorios from "./modules/relatorios.js";
import parametros from "./modules/parametros.js";

// Ordem define a ordem do menu
registerModule(dashboard);
registerModule(categorias);
registerModule(produtos);
registerModule(portais);
registerModule(orgaos);
registerModule(licitacoes);
registerModule(edital);
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
    await login(form.email.value, form.senha.value);
    // onAuth cuida do resto
  } catch (err) {
    erro.textContent = err.message; erro.hidden = false;
    btn.disabled = false; btn.textContent = "Entrar";
  }
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

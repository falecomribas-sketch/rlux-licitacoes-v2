// Roteador por hash (#dashboard, #propostas, ...). Cada módulo registra
// { id, titulo, grupo, icone, render(container), destroy?() }.
import { $, $$ } from "./utils.js?v=20261113-181655";
import { icon } from "./ui.js?v=20261113-181655";

const modules = new Map();
let current = null;

export function registerModule(mod) { modules.set(mod.id, mod); }
export function listModules() { return [...modules.values()]; }

export function navigate(id) {
  if (!modules.has(id)) id = "dashboard";
  if (location.hash.replace("#", "") !== id) { location.hash = id; return; }
  render(id);
}

function render(id) {
  const mod = modules.get(id) || modules.get("dashboard");
  if (current?.destroy) { try { current.destroy(); } catch (e) { console.error(e); } }
  current = mod;

  $$("#nav .nav-item").forEach((a) => a.classList.toggle("active", a.dataset.id === mod.id));
  $("#topbar-title").textContent = mod.titulo;
  document.title = `${mod.titulo} · Rlux Licitações`;

  // Troca o <main> por um clone vazio: descarta os listeners que o módulo anterior
  // ligou nele (senão cada visita à tela acumularia um handler a mais).
  const old = $("#view");
  const main = old.cloneNode(false);
  old.replaceWith(main);
  main.scrollTop = 0;
  document.body.classList.remove("nav-open");
  try { mod.render(main); } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="card"><div class="card-body"><strong>Esta tela não carregou.</strong><br><span class="muted">${e.message}</span></div></div>`;
  }
}

export function buildNav() {
  const nav = $("#nav");
  const grupos = [];
  for (const m of modules.values()) {
    let g = grupos.find((x) => x.nome === m.grupo);
    if (!g) { g = { nome: m.grupo, itens: [] }; grupos.push(g); }
    g.itens.push(m);
  }
  nav.innerHTML = grupos.map((g) => `
    <div class="nav-group">
      <div class="nav-group-title">${g.nome}</div>
      ${g.itens.map((m) => `<a class="nav-item" href="#${m.id}" data-id="${m.id}">${icon(m.icone)}<span>${m.titulo}</span></a>`).join("")}
    </div>`).join("");
}

export function startRouter() {
  window.addEventListener("hashchange", () => render(location.hash.replace("#", "") || "dashboard"));
  render(location.hash.replace("#", "") || "dashboard");
}

// Componentes de interface compartilhados: toast, modal, confirmação, ícones.
import { $, esc, raw, h } from "./utils.js?v=20261113-204612";

// ---------- toasts ----------
export function toast(msg, tipo = "ok", ms = 3200) {
  const host = $("#toasts");
  const el = document.createElement("div");
  el.className = `toast toast-${tipo}`;
  el.setAttribute("role", "status");
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 250); }, ms);
}

// ---------- modal ----------
// openModal({ titulo, corpo (html), rodape (html), largura }) -> elemento
export function openModal({ titulo, corpo, rodape = "", largura = "md", onClose } = {}) {
  closeModal();
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.innerHTML = `
    <div class="modal modal-${largura}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header class="modal-head">
        <h2 id="modal-title">${titulo}</h2>
        <button class="icon-btn" data-close aria-label="Fechar">${icon("x")}</button>
      </header>
      <div class="modal-body">${corpo}</div>
      ${rodape ? `<footer class="modal-foot">${rodape}</footer>` : ""}
    </div>`;
  wrap.addEventListener("click", (e) => { if (e.target === wrap || e.target.closest("[data-close]")) closeModal(); });
  wrap._onClose = onClose;
  document.body.appendChild(wrap);
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => wrap.classList.add("in"));
  const first = wrap.querySelector("input,select,textarea,button:not([data-close])");
  first?.focus();
  return wrap;
}

export function closeModal() {
  const wrap = $(".modal-backdrop:not(.confirm-backdrop)");
  if (!wrap) return;
  wrap._onClose?.();
  wrap.remove();
  document.body.classList.remove("modal-open");
}

document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !document.querySelector(".confirm-backdrop")) closeModal(); });

// confirmar("Excluir proposta?") -> Promise<boolean>
export function confirmar(msg, { ok = "Confirmar", perigo = false, cancelar = "Cancelar" } = {}) {
  // Caixa própria, empilhada sobre o modal aberto (se houver): não fecha o formulário por baixo.
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop confirm-backdrop";
    wrap.innerHTML = `<div class="modal modal-sm" role="alertdialog" aria-modal="true"><header class="modal-head"><h2>Confirmação</h2></header><div class="modal-body"><p class="confirm-text">${esc(msg)}</p></div><footer class="modal-foot"><button class="btn btn-ghost" data-cancel>${esc(cancelar)}</button><button class="btn ${perigo ? "btn-danger" : "btn-primary"}" data-ok>${esc(ok)}</button></footer></div>`;
    const fechar = (v) => { wrap.remove(); document.removeEventListener("keydown", esc_); if (!document.querySelector(".modal-backdrop")) document.body.classList.remove("modal-open"); resolve(v); };
    const esc_ = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); fechar(false); } };
    wrap.addEventListener("click", (e) => { if (e.target === wrap || e.target.closest("[data-cancel]")) fechar(false); else if (e.target.closest("[data-ok]")) fechar(true); });
    document.addEventListener("keydown", esc_, true);
    document.body.appendChild(wrap); document.body.classList.add("modal-open");
    requestAnimationFrame(() => wrap.classList.add("in"));
    wrap.querySelector("[data-ok]").focus();
  });
}

// ---------- estado vazio ----------
export const vazio = (titulo, sub = "") =>
  `<div class="empty"><div class="empty-title">${esc(titulo)}</div>${sub ? `<div class="empty-sub">${esc(sub)}</div>` : ""}</div>`;

// ---------- tags ----------
export const tag = (txt, cls = "tag-gray") => h`<span class="tag ${raw(cls)}">${txt}</span>`;

// ---------- ícones (traços simples, 24x24) ----------
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  box: '<path d="m21 8-9-5-9 5v8l9 5 9-5Z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.5h6V4M9 10h6M9 14h6"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  doc: '<path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M15 3v5h5"/>',
  handshake: '<path d="m11 17 2 2a2 2 0 0 0 2.8 0l5.2-5.2M3 12l4-4 4 4-2.5 2.5a1.5 1.5 0 0 0 2 2.2L15 12l-4-4"/><path d="M21 12 17 8l-2 2"/>',
  coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M3 11v4c0 1.7 2.7 3 6 3s6-1.3 6-3v-4M15 11c3.3 0 6 1.3 6 3v4c0 1.7-2.7 3-6 3"/>',
  scale: '<path d="M12 3v18M5 21h14M6 7l-3 7a3 3 0 0 0 6 0L6 7ZM18 7l-3 7a3 3 0 0 0 6 0l-3-7ZM4 7h16"/>',
  trending: '<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h14v4"/><rect x="3" y="7" width="18" height="12" rx="2"/><circle cx="16" cy="13" r="1.2"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>',
  send: '<path d="m21 3-7 18-4-8-8-4Z"/><path d="M21 3 10 13"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4.5-6.2"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  logout: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l5 4-5 4M20 12H9"/>',
  alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17h.01"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  bulb: '<path d="M9 18h6M10 21h4M8.5 14.5A6 6 0 1 1 15.5 14.5c-.9.8-1.5 1.5-1.5 2.5h-4c0-1-.6-1.7-1.5-2.5Z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
  edit: '<path d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4Z"/><path d="m13 7 4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-8 9"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  print: '<path d="M7 8V3h10v5M7 17H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-3"/><rect x="7" y="14" width="10" height="7"/>',
};

export function icon(name, cls = "") {
  const d = ICONS[name] || ICONS.box;
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

// Select com busca (substitui o "ssel" do legado).
//
// const s = ssel(container, {
//   placeholder, itens: [{ id, label, sub?, extra? }], value?, onSelect(id, item), disabled?
// });
// s.setItens(itens); s.setValue(id); s.value; s.disable(); s.enable()
import { esc } from "./utils.js?v=20261113-135731";

export function ssel(host, cfg) {
  let itens = cfg.itens || [];
  let value = cfg.value || "";
  host.classList.add("ssel");
  host.innerHTML = `<input type="text" class="ssel-input" placeholder="${esc(cfg.placeholder || "Buscar…")}" autocomplete="off" ${cfg.disabled ? "disabled" : ""} role="combobox" aria-expanded="false">
    <input type="hidden" name="${esc(cfg.name || "")}">
    <div class="ssel-dd" role="listbox" hidden></div>`;
  const input = host.querySelector(".ssel-input");
  const hidden = host.querySelector("input[type=hidden]");
  const dd = host.querySelector(".ssel-dd");
  let ativo = -1, filtrados = [];

  const labelDe = (id) => itens.find((i) => i.id === id)?.label || "";
  function abrir() { render(input.value); dd.hidden = false; input.setAttribute("aria-expanded", "true"); }
  function fechar() { dd.hidden = true; ativo = -1; input.setAttribute("aria-expanded", "false"); }
  function render(q) {
    q = (q || "").toLowerCase();
    filtrados = itens.filter((i) => !q || [i.label, i.sub, i.extra].some((x) => (x || "").toLowerCase().includes(q))).slice(0, 60);
    dd.innerHTML = filtrados.length ? filtrados.map((i, k) =>
      `<div class="ssel-item ${k === ativo ? "ativo" : ""}" data-k="${k}" role="option">${esc(i.label)}${i.sub ? `<small>${esc(i.sub)}</small>` : ""}</div>`).join("")
      : `<div class="ssel-empty">Nenhum resultado</div>`;
  }
  function escolher(k) {
    const it = filtrados[k]; if (!it) return;
    value = it.id; hidden.value = it.id; input.value = it.label; fechar();
    cfg.onSelect?.(it.id, it);
  }

  input.addEventListener("focus", abrir);
  input.addEventListener("input", () => { ativo = -1; abrir(); if (!input.value) { value = ""; hidden.value = ""; cfg.onSelect?.("", null); } });
  input.addEventListener("keydown", (e) => {
    if (dd.hidden && (e.key === "ArrowDown")) { abrir(); return; }
    if (e.key === "ArrowDown") { ativo = Math.min(ativo + 1, filtrados.length - 1); render(input.value); e.preventDefault(); }
    else if (e.key === "ArrowUp") { ativo = Math.max(ativo - 1, 0); render(input.value); e.preventDefault(); }
    else if (e.key === "Enter" && !dd.hidden) { e.preventDefault(); if (ativo >= 0) escolher(ativo); else if (filtrados.length) escolher(0); }
    else if (e.key === "Escape") { fechar(); }
  });
  input.addEventListener("blur", () => setTimeout(() => { fechar(); if (value) input.value = labelDe(value); else input.value = ""; }, 150));
  dd.addEventListener("mousedown", (e) => { const it = e.target.closest(".ssel-item"); if (it) { e.preventDefault(); escolher(+it.dataset.k); } });

  if (value) input.value = labelDe(value);
  hidden.value = value;

  return {
    get value() { return value; },
    setItens(novos) { itens = novos; if (value && !labelDe(value)) { value = ""; hidden.value = ""; input.value = ""; } },
    setValue(id) { value = id || ""; hidden.value = value; input.value = labelDe(value); },
    disable(msg) { input.disabled = true; if (msg) input.placeholder = msg; },
    enable(msg) { input.disabled = false; if (msg) input.placeholder = msg; },
    focus() { input.focus(); },
  };
}

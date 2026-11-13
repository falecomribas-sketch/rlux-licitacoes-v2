// Popover ancorado a um botão (ex.: "licitações vinculadas").
import { icon, vazio } from "./ui.js?v=20261113-114024";

export function popover(anchor, { titulo, corpo, acoes = "" }) {
  fecharPopover();
  const scrim = document.createElement("div"); scrim.className = "popover-scrim";
  const pop = document.createElement("div"); pop.className = "popover";
  pop.innerHTML = `
    <div class="popover-head"><span>${titulo}</span><span>${acoes}<button class="icon-btn sm" data-pop-close aria-label="Fechar">${icon("x")}</button></span></div>
    <div class="popover-body">${corpo || vazio("Nada vinculado")}</div>`;
  scrim.addEventListener("click", fecharPopover);
  pop.querySelector("[data-pop-close]").addEventListener("click", fecharPopover);
  document.body.append(scrim, pop);

  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth, h = pop.offsetHeight;
  let left = r.left + r.width / 2 - w / 2, top = r.bottom + 6;
  if (left + w > innerWidth - 8) left = innerWidth - w - 8;
  if (left < 8) left = 8;
  if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6);
  pop.style.left = `${left}px`; pop.style.top = `${top}px`;
  return pop;
}

export function fecharPopover() {
  document.querySelectorAll(".popover, .popover-scrim").forEach((e) => e.remove());
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharPopover(); });

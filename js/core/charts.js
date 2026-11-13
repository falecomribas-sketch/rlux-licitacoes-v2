// Helpers de gráficos (Chart.js) compartilhados por Dashboard e Relatórios.
import { fmt } from "./utils.js?v=20261113-114511";

export const CORES = ["#2457d6", "#1b8a5a", "#d9641c", "#6d3fc9", "#c8362b", "#0f7f8c", "#b58200", "#5b6b8c"];
export const COR_STATUS = {
  "Vencida": "#1b8a5a", "Perdida": "#c8362b", "Em Andamento": "#2457d6", "Faturado Total": "#0f7f8c",
  "Faturado Parcial": "#d9641c", "Ag. Solic. Docs": "#b58200", "Enviei Docs": "#6d3fc9",
};
export const short = (v) => v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? Math.round(v / 1e3) + "k" : v;
export const tipMoeda = { callbacks: { label: (i) => `${i.dataset.label ? i.dataset.label + ": " : ""}${fmt(i.raw)}` } };

export function base(extra = {}) {
  const o = { responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: "top", labels: { font: { size: 11, family: "IBM Plex Sans" }, boxWidth: 10 } } },
    scales: {} };
  return deepMerge(o, extra);
}
export function deepMerge(a, b) {
  for (const k of Object.keys(b)) a[k] = b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) ? deepMerge(a[k] || {}, b[k]) : b[k];
  return a;
}

// Registro de gráficos de uma tela: atualiza em vez de recriar (sem piscar)
export function registro() {
  let charts = {};
  return {
    chart(key, canvasId, cfg) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      if (charts[key] && charts[key].canvas === canvas) { charts[key].data = cfg.data; charts[key].options = cfg.options; charts[key].update("none"); }
      else { charts[key]?.destroy(); charts[key] = new Chart(canvas.getContext("2d"), cfg); }
    },
    destroy() { Object.values(charts).forEach((c) => c.destroy()); charts = {}; },
  };
}

if (window.Chart) { Chart.defaults.font.family = "IBM Plex Sans"; Chart.defaults.color = "#4b5670"; }

// Utilitários gerais: formatação, datas, DOM.

export const fmt = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

export const fmtNum = (v) => Number(v || 0).toLocaleString("pt-BR");

// "2026-05-26" -> "26/05/2026"
export const fmtD = (d) => {
  if (!d) return "—";
  const [y, m, dd] = String(d).slice(0, 10).split("-");
  return dd && m && y ? `${dd}/${m}/${y}` : "—";
};

// Data local "YYYY-MM-DD" (sem deslocar o dia pelo fuso)
export const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const parseIso = (iso) => (iso ? new Date(String(iso).slice(0, 10) + "T00:00:00") : null);

export const diasAte = (iso) => {
  const d = parseIso(iso);
  if (!d) return null;
  const hoje = parseIso(hojeIso());
  return Math.round((d - hoje) / 86400000);
};

export const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function toTitleCase(str) {
  const minors = ["de", "da", "do", "das", "dos", "e", "a", "o", "em", "por", "com", "para"];
  return String(str || "").toLowerCase().split(" ").map((w, i) =>
    i === 0 || !minors.includes(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(" ");
}

// Escapa texto para HTML (nunca injetar dados do banco sem isso)
export const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Template literal que escapa interpolações: h`<b>${nome}</b>`
export function h(strings, ...vals) {
  return strings.reduce((out, s, i) => out + s + (i < vals.length ? (vals[i] instanceof Raw ? vals[i].s : esc(vals[i])) : ""), "");
}
class Raw { constructor(s) { this.s = s; } }
export const raw = (s) => new Raw(s);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const debounce = (fn, ms = 250) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

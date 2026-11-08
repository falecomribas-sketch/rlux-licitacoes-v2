// Formulários em modal + exportação Excel.
import { openModal, closeModal, toast } from "./ui.js";
import { esc } from "./utils.js";

// formModal({ titulo, corpo (html de um <form>), largura, salvarTexto, onSalvar(form, modal) })
// Mostra o modal, liga o submit e cuida de erro/feedback. onSalvar pode lançar Error(msg).
export function formModal({ titulo, corpo, largura = "md", salvarTexto = "Salvar", extra = "", onSalvar, onAberto }) {
  const m = openModal({
    titulo, largura,
    corpo: `<form id="mf" class="form" novalidate>${corpo}</form>`,
    rodape: `<button class="btn btn-ghost" data-close type="button">Cancelar</button>${extra}
             <button class="btn btn-primary" type="submit" form="mf" id="mf-salvar">${esc(salvarTexto)}</button>`,
  });
  const form = m.querySelector("#mf");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = m.querySelector("#mf-salvar");
    btn.disabled = true;
    try { await onSalvar(form, m); }
    catch (err) { console.error("formModal:", err); toast(err.message || "Não foi possível salvar.", "erro"); btn.disabled = false; return; }
    btn.disabled = false;
  });
  onAberto?.(form, m);
  return { form, modal: m, fechar: closeModal };
}

// Lê os campos do form em um objeto simples: { nome: "...", custo: "12.5" }
export const lerForm = (form) => Object.fromEntries(new FormData(form).entries());

// Helpers de markup de campos
export const campo = (label, inner, cls = "") => `<label class="field ${cls}"><span>${esc(label)}</span>${inner}</label>`;
export const inputTxt = (name, value = "", attrs = "") => `<input type="text" name="${name}" value="${esc(value)}" ${attrs}>`;
export const inputNum = (name, value = "", attrs = "") => `<input type="number" name="${name}" value="${esc(value)}" ${attrs}>`;
export const inputData = (name, value = "") => `<input type="date" name="${name}" value="${esc(value)}">`;
export const textarea = (name, value = "", attrs = "") => `<textarea name="${name}" ${attrs}>${esc(value)}</textarea>`;
export const select = (name, opcoes, value = "", attrs = "") =>
  `<select name="${name}" ${attrs}>${opcoes.map((o) => {
    const [v, t] = Array.isArray(o) ? o : [o, o];
    return `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(t)}</option>`;
  }).join("")}</select>`;
export const linha = (...campos) => `<div class="form-row cols-${campos.length}">${campos.join("")}</div>`;

export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

export function mascaraCnpj(el) {
  let v = el.value.replace(/\D/g, "");
  v = v.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
  el.value = v.slice(0, 18);
}

// ---------- Excel (SheetJS carregado sob demanda) ----------
let xlsxReady = null;
function carregarXlsx() {
  if (window.XLSX) return Promise.resolve();
  if (xlsxReady) return xlsxReady;
  xlsxReady = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    s.onload = res; s.onerror = () => rej(new Error("Não foi possível carregar o exportador de Excel."));
    document.head.appendChild(s);
  });
  return xlsxReady;
}

// exportarExcel([{Coluna: valor, ...}], "Aba", "nome_arquivo")
export async function exportarExcel(rows, aba, nome) {
  if (!rows.length) { toast("Nada para exportar.", "info"); return; }
  try { await carregarXlsx(); } catch (e) { toast(e.message, "erro"); return; }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, aba.slice(0, 31));
  XLSX.writeFile(wb, `${nome}_rlux.xlsx`);
  toast("Excel exportado.");
}

// lerExcel(file) -> array de objetos (primeira aba)
export async function lerExcel(file) {
  await carregarXlsx();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
}

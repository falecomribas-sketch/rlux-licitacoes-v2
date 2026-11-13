// Formulários em modal + exportação Excel.
import { openModal, closeModal, toast } from "./ui.js?v=20261113-204612";
import { esc } from "./utils.js?v=20261113-204612";

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

// ---------- Excel (SheetJS carregado sob demanda; a variante xlsx-js-style suporta cores/larguras) ----------
let xlsxReady = null;
function carregarXlsx() {
  if (window.XLSX) return Promise.resolve();
  if (xlsxReady) return xlsxReady;
  xlsxReady = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js";
    s.onload = res; s.onerror = () => rej(new Error("Não foi possível carregar o exportador de Excel."));
    document.head.appendChild(s);
  });
  return xlsxReady;
}

// Excel formatado (cabeçalho azul, colunas largas, quebra de linha, R$, painel congelado), várias abas.
// abas: [{ nome, colunas: [{ chave, titulo, largura, moeda? }], rows: [{...}] }]
export async function exportarExcelFormatado(abas, nome) {
  try { await carregarXlsx(); } catch (e) { toast(e.message, "erro"); return; }
  const wb = XLSX.utils.book_new();
  const cab = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { patternType: "solid", fgColor: { rgb: "1F4E78" } }, alignment: { wrapText: true, vertical: "center" } };
  const cel = { alignment: { wrapText: true, vertical: "top" } };
  abas.forEach((a) => {
    const dados = [a.colunas.map((c) => c.titulo), ...a.rows.map((r) => a.colunas.map((c) => r[c.chave] ?? ""))];
    const ws = XLSX.utils.aoa_to_sheet(dados);
    ws["!cols"] = a.colunas.map((c) => ({ wch: c.largura || 14 }));
    ws["!freeze"] = { xSplit: 0, ySplit: 1 }; ws["!views"] = [{ state: "frozen", ySplit: 1 }];
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let R = range.s.r; R <= range.e.r; R++) for (let C = range.s.c; C <= range.e.c; C++) {
      const ref = XLSX.utils.encode_cell({ r: R, c: C }); const cell = ws[ref]; if (!cell) continue;
      if (R === 0) cell.s = cab; else { cell.s = cel; if (a.colunas[C].moeda && typeof cell.v === "number") cell.z = '"R$" #,##0.00'; }
    }
    XLSX.utils.book_append_sheet(wb, ws, a.nome.slice(0, 31));
  });
  XLSX.writeFile(wb, `${nome}.xlsx`);
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

// Lê um .xlsx preservando o workbook (para devolver preenchido). Retorna { wb, ws, rows(aoa) }
export async function abrirExcel(file) {
  await carregarXlsx();
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellFormula: true, cellStyles: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return { wb, ws, rows: XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) };
}
export function salvarWorkbook(wb, nome) { XLSX.writeFile(wb, `${nome}.xlsx`); }
export const XL = () => window.XLSX;

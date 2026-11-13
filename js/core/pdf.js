// PDFs — jsPDF + autoTable carregados sob demanda, cabeçalho e rodapé padrão Rlux.
import { toast } from "./ui.js?v=20261113-114511";

export const EMPRESA = {
  nome: "RLUX ILUMINAÇÃO LTDA",
  endereco: "Rua Pedro Ferreira, 333 - Sala 1206, Box 140 - Centro - 88.301-030 - Itajaí - SC",
  cnpj: "23.535.805/0001-35", ie: "26.228.270-4",
  tel: "(19) 2139-7145 / (19) 2139-7155", email: "contato@rlux.com.br", emailLicitacoes: "licitacao@rlux.com.br", site: "https://www.rlux.com.br",
  representante: "Marcos Ribas", cpf: "286.176.978-57",
  representanteCompleto: "Marcos Alberto Spina Ribas", rg: "29.685.143-7", cargoRepresentante: "Sócio Administrador", cidade: "Itajaí",
  bancos: ["Banco: 001 - Banco do Brasil  |  Agência: 2447-3  |  C/C: 63587-1", "Banco: 237 - Banco Bradesco  |  Agência: 2297  |  C/C: 129805-4"],
};

export const AZUL = [20, 40, 107], VERDE = [27, 138, 90], AMBAR = [217, 119, 6], ROXO = [109, 63, 201], CINZA = [100, 116, 139], ESCURO = [25, 34, 58], BRANCO = [255, 255, 255];

let ready = null;
function script(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Falha ao carregar " + src)); document.head.appendChild(s); }); }
export async function carregarPdf() {
  if (window.jspdf?.jsPDF && window.jspdf.jsPDF.API.autoTable) return;
  if (!ready) ready = (async () => {
    await script("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    await script("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js");
  })();
  try { await ready; } catch (e) { toast("Não foi possível carregar o gerador de PDF.", "erro"); throw e; }
}

// novoDoc("landscape" | "portrait")
export async function novoDoc(orientation = "landscape") {
  await carregarPdf();
  const doc = new window.jspdf.jsPDF({ orientation, unit: "mm", format: "a4" });
  doc._W = orientation === "landscape" ? 297 : 210;
  doc._H = orientation === "landscape" ? 210 : 297;
  doc._ML = 14; doc._MR = 14; doc._CW = doc._W - 28;
  return doc;
}

// Faixa azul no topo com dados da empresa e título à direita
export function cabecalho(doc, titulo, subtitulo = "Emitido em " + new Date().toLocaleDateString("pt-BR")) {
  const W = doc._W, ML = doc._ML;
  doc.setFillColor(...AZUL); doc.rect(0, 0, W, 20, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...BRANCO);
  doc.text(EMPRESA.nome, ML, 8);
  doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
  doc.text(EMPRESA.endereco, ML, 12.5);
  doc.text(`CNPJ: ${EMPRESA.cnpj}  |  IE: ${EMPRESA.ie}  |  Tel: ${EMPRESA.tel}  |  ${EMPRESA.email}`, ML, 16.5);
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text(titulo, W - doc._MR, 9, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(7);
  doc.text(subtitulo, W - doc._MR, 15, { align: "right" });
  return 26;
}

export function rodape(doc, texto = "") {
  const n = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...CINZA);
    doc.text(`Página ${i} de ${n}`, doc._W - doc._MR, doc._H - 5, { align: "right" });
    doc.text(`${EMPRESA.nome}${texto ? "  ·  " + texto : ""}`, doc._ML, doc._H - 5);
  }
}

export function tituloSecao(doc, y, texto, cor = AZUL) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...cor);
  doc.text(texto, doc._ML, y);
  doc.setDrawColor(...cor); doc.setLineWidth(.4); doc.line(doc._ML, y + 1.5, doc._W - doc._MR, y + 1.5);
  return y + 5.5;
}

export function assinatura(doc, y) {
  const hoje = new Date();
  const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(55, 65, 81);
  doc.text(`Itajaí-SC, ${hoje.getDate()} de ${meses[hoje.getMonth()]} de ${hoje.getFullYear()}`, doc._ML, y);
  const x = doc._W - doc._MR - 85;
  doc.setDrawColor(...ESCURO); doc.setLineWidth(.35); doc.line(x, y, x + 75, y);
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...ESCURO);
  doc.text(EMPRESA.representante, x + 37.5, y + 5, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(7);
  doc.text(`CPF: ${EMPRESA.cpf}  ·  Representante Legal`, x + 37.5, y + 9, { align: "center" });
  doc.text(`${EMPRESA.nome}  ·  CNPJ: ${EMPRESA.cnpj}`, x + 37.5, y + 13, { align: "center" });
  return y + 16;
}

// Estilos padrão para autoTable
export const tabelaPadrao = (extra = {}) => ({
  styles: { fontSize: 7.5, cellPadding: 2.5, valign: "middle", textColor: ESCURO },
  headStyles: { fillColor: AZUL, textColor: 255, fontStyle: "bold", fontSize: 7, cellPadding: 3 },
  footStyles: { fillColor: [14, 116, 144], textColor: 255, fontStyle: "bold", fontSize: 8 },
  alternateRowStyles: { fillColor: [240, 245, 255] },
  ...extra,
});

export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const dataExtenso = (d = new Date()) => `${EMPRESA.cidade}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;

// Papel timbrado (assets/timbrado.jpg, A4 retrato). Devolve as margens úteis em mm.
let timbrado = null;
export async function carregarTimbrado() {
  if (timbrado) return timbrado;
  timbrado = await new Promise((res) => { const img = new Image(); img.onload = () => { const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext("2d").drawImage(img, 0, 0); res(c.toDataURL("image/jpeg", 0.85)); }; img.onerror = () => res(null); img.src = "assets/timbrado.jpg"; });
  return timbrado;
}
export function aplicarTimbrado(doc, dataUrl) {
  if (dataUrl) doc.addImage(dataUrl, "JPEG", 0, 0, doc._W, doc._H, undefined, "FAST");
  return { topo: 48, base: doc._H - 36 };
}

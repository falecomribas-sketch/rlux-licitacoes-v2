// PDF das declarações exigidas no edital, no papel timbrado da RLUX.
import { novoDoc, carregarTimbrado, aplicarTimbrado, EMPRESA, dataExtenso, ESCURO } from "../core/pdf.js?v=20261113-115749";

// decl: { titulo, destinatario, texto, quemAssina }. Devolve o jsPDF (uma declaração por documento ou várias, uma por página).
export async function gerarPdfDeclaracoes(lista, { data = new Date(), nomeArquivo = "declaracoes" } = {}) {
  const doc = await novoDoc("portrait"); const fundo = await carregarTimbrado();
  const ML = 22, MR = 22, CW = doc._W - ML - MR;
  lista.forEach((d, idx) => {
    if (idx > 0) doc.addPage();
    let { topo: y, base } = aplicarTimbrado(doc, fundo);
    const novaPagina = () => { doc.addPage(); const m = aplicarTimbrado(doc, fundo); y = m.topo; };
    doc.setTextColor(...ESCURO);
    // título
    doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    const tit = doc.splitTextToSize((d.titulo || "DECLARAÇÃO").toUpperCase(), CW); doc.text(tit, doc._W / 2, y, { align: "center" }); y += tit.length * 6 + 6;
    // destinatário
    if (d.destinatario) { doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); const ds = doc.splitTextToSize(d.destinatario, CW); doc.text(ds, ML, y); y += ds.length * 5 + 6; }
    // corpo justificado, parágrafo a parágrafo
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    const paras = String(d.texto || "").replace(/\r/g, "").split(/\n\s*\n|\n/).map((t) => t.trim()).filter(Boolean);
    paras.forEach((ptxt) => {
      const linhas = doc.splitTextToSize(ptxt, CW); const alt = linhas.length * 5.6;
      if (y + alt > base) novaPagina();
      doc.text(ptxt, ML, y, { align: "justify", maxWidth: CW }); y += alt + 4;
    });
    // data e assinatura
    if (y + 40 > base) novaPagina();
    y += 8; doc.setFontSize(11); doc.text(dataExtenso(data), ML, y); y += 22;
    const cx = doc._W / 2; doc.setDrawColor(...ESCURO); doc.setLineWidth(.35); doc.line(cx - 45, y, cx + 45, y); y += 5;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5);
    if (d.quemAssina === "contador") { doc.text("[Nome do contador]", cx, y, { align: "center" }); doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.text("Contador(a) — CRC [PREENCHER]", cx, y + 5, { align: "center" }); doc.text(`${EMPRESA.nome} — CNPJ ${EMPRESA.cnpj}`, cx, y + 10, { align: "center" }); }
    else { doc.text(EMPRESA.representanteCompleto, cx, y, { align: "center" }); doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.text(`${EMPRESA.cargoRepresentante} — RG ${EMPRESA.rg} — CPF ${EMPRESA.cpf}`, cx, y + 5, { align: "center" }); doc.text(`${EMPRESA.nome} — CNPJ ${EMPRESA.cnpj}`, cx, y + 10, { align: "center" }); }
  });
  return doc;
}
export const nomeArquivoDecl = (t) => String(t || "declaracao").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);

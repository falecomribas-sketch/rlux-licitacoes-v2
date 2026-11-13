// PDF da ATA de Registro de Preços — portado de gerarPDFAtaCompleto.
import { novoDoc, cabecalho, rodape, tabelaPadrao, AZUL } from "../core/pdf.js?v=20261113-204612";
import { store } from "../core/store.js?v=20261113-204612";
import { fmt, fmtD } from "../core/utils.js?v=20261113-204612";
import { getLicit, getOrgao, getPortal, propTotal } from "../core/domain.js?v=20261113-204612";
import { toast } from "../core/ui.js?v=20261113-204612";

export async function gerarPdfAta(ata, p) {
  const doc = await novoDoc("landscape");
  const l = getLicit(p.licitacaoId), o = getOrgao(l.orgaoId), portal = getPortal(l.portalId);
  const emps = store.get("empenhos").filter((e) => e.propostaId === p.id);
  const totalEmp = emps.reduce((s, e) => s + (e.valorRecebido || 0), 0);
  const total = propTotal(p), saldo = total - totalEmp;
  const { _W: W, _ML: ML, _MR: MR } = doc;

  cabecalho(doc, "ATA DE REGISTRO DE PREÇOS", "Emitido em " + new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }));
  const c1 = ML, c2 = ML + 90, c3 = ML + 190;
  const lbl = (y, a, b, c) => { doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(148, 163, 184); doc.text(a, c1, y); doc.text(b, c2, y); doc.text(c, c3, y); };
  const val = (y, a, b, c) => { doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(30, 41, 59); doc.text(a, c1, y); doc.text(b, c2, y); doc.text(c, c3, y); };
  lbl(26, "Nº ATA", "PREGÃO / Nº", "TIPO"); val(31, ata.numero || "—", l.numero || "—", l.tipo || "—");
  lbl(37, "PORTAL", "DATA PREGÃO", "UASG"); val(42, portal.sigla || "—", fmtD(l.data), o.uasg || "—");
  lbl(48, "ÓRGÃO", "ASSINATURA", "VENCIMENTO"); val(53, `${o.uasg ? o.uasg + " - " : ""}${o.nome || "—"}`.slice(0, 42), fmtD(ata.assinatura), `${fmtD(ata.vencimento)} (${ata.validade || "—"} meses)`);
  doc.setDrawColor(226, 232, 240); doc.setLineWidth(.3); doc.line(ML, 57, W - MR, 57);

  const kw = 83;
  [0, 1, 2].forEach((i) => { doc.setFillColor(248, 250, 252); doc.roundedRect(ML + i * (kw + 4), 59, kw, 13, 2, 2, "F"); });
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
  doc.text("Valor Total da Proposta", ML + 4, 64); doc.text("Total Empenhado", ML + kw + 8, 64); doc.text("Saldo Disponível", ML + kw * 2 + 12, 64);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.setTextColor(5, 150, 105); doc.text(fmt(total), ML + 4, 70);
  doc.setTextColor(217, 119, 6); doc.text(fmt(totalEmp), ML + kw + 8, 70);
  doc.setTextColor(...(saldo <= 0 ? [220, 38, 38] : AZUL)); doc.text(fmt(saldo), ML + kw * 2 + 12, 70);

  const rows = (p.itens || []).map((it, idx) => {
    const qe = emps.reduce((s, e) => s + (e.itensRecebidos?.[idx] || 0), 0);
    return [it.num || "", it.nome, it.codigo || "", it.marca || "", fmt(it.preco || 0), it.qtd, fmt(it.total || 0), qe, fmt(qe * (it.preco || 0)), it.qtd - qe, fmt((it.qtd - qe) * (it.preco || 0))];
  });
  doc.autoTable({ ...tabelaPadrao({ styles: { fontSize: 7.5, cellPadding: 3, valign: "middle", textColor: [30, 41, 59] } }), startY: 76, margin: { left: ML, right: MR },
    head: [["Item", "Descrição", "Cód.", "Marca", "Preço Unit.", "Qtd Vencida", "Vlr Vencido", "Qtd Emp.", "Vlr Emp.", "Saldo Qtd", "Saldo R$"]], body: rows,
    columnStyles: { 0: { cellWidth: 12, halign: "center" }, 2: { cellWidth: 28 }, 3: { cellWidth: 22 }, 4: { cellWidth: 26, halign: "right" }, 5: { cellWidth: 18, halign: "right" }, 6: { cellWidth: 26, halign: "right", textColor: [5, 150, 105] }, 7: { cellWidth: 16, halign: "right" }, 8: { cellWidth: 26, halign: "right", textColor: [217, 119, 6] }, 9: { cellWidth: 18, halign: "right" }, 10: { cellWidth: 26, halign: "right", textColor: [220, 38, 38] } },
    foot: [["", "", "", "", "TOTAL", (p.itens || []).reduce((s, i) => s + i.qtd, 0), fmt(total), (p.itens || []).reduce((s, i, idx) => s + emps.reduce((ss, e) => ss + (e.itensRecebidos?.[idx] || 0), 0), 0), fmt(totalEmp), "", fmt(saldo)]] });

  if (emps.length) {
    let y = doc.lastAutoTable.finalY + 8;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...AZUL); doc.text("Histórico de Empenhos", ML, y);
    doc.setDrawColor(...AZUL); doc.setLineWidth(.4); doc.line(ML, y + 1.5, W - MR, y + 1.5);
    doc.autoTable({ ...tabelaPadrao({ headStyles: { fillColor: [100, 116, 139], textColor: 255, fontStyle: "bold", fontSize: 7.5 }, alternateRowStyles: { fillColor: [248, 250, 252] } }), startY: y + 4, margin: { left: ML, right: MR },
      head: [["Nº Empenho", "Data", "Valor Empenhado"]], body: emps.map((e) => [e.numero, fmtD(e.data), fmt(e.valorRecebido || 0)]), columnStyles: { 2: { halign: "right" } }, foot: [["", "TOTAL", fmt(totalEmp)]] });
  }
  rodape(doc, `ATA ${ata.numero || ""}`);
  doc.save(`ata_${ata.numero || "nova"}.pdf`);
  toast("PDF da ATA gerado.");
}

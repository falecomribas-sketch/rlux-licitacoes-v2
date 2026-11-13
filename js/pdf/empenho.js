// Nota de Empenho (proposta) e Empenho de Adesão — portados de gerarPDFEmp.
import { novoDoc, cabecalho, rodape, tabelaPadrao, AZUL, ROXO, VERDE } from "../core/pdf.js?v=20261113-203913";
import { store } from "../core/store.js?v=20261113-203913";
import { fmt, fmtD } from "../core/utils.js?v=20261113-203913";
import { getLicit, getOrgao, getProp, getPortal, getAta, propTotal } from "../core/domain.js?v=20261113-203913";
import { toast } from "../core/ui.js?v=20261113-203913";

export async function gerarPdfEmpenho(e) {
  const doc = await novoDoc("landscape");
  const { _W: W, _ML: ML, _MR: MR } = doc;
  const lbl = (y, cols, xs) => { doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(148, 163, 184); cols.forEach((t, i) => doc.text(t, xs[i], y)); };
  const val = (y, cols, xs) => { doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(30, 41, 59); cols.forEach((t, i) => doc.text(String(t), xs[i], y)); };
  const kpis = (y, items, cor) => { const kw = 80; items.forEach(([t, v, c], i) => { const x = ML + i * (kw + 3); doc.setFillColor(248, 250, 252); doc.roundedRect(x, y, kw, 12, 2, 2, "F");
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(100, 116, 139); doc.text(t, x + 3, y + 5); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...(c || cor)); doc.text(v, x + 3, y + 10); }); };

  if (e.adesaoId) {
    const a = store.find("adesoes", e.adesaoId) || {}, ata = getAta(a.ataId) || {};
    const todos = store.get("empenhos").filter((x) => x.adesaoId === e.adesaoId); const totEmp = todos.reduce((s, x) => s + (x.valorRecebido || 0), 0); const saldo = (a.valorTotal || 0) - totEmp;
    cabecalho(doc, "EMPENHO DE ADESÃO"); doc.setFillColor(...ROXO); doc.rect(0, 0, W, 20, "F"); cabecalho(doc, "EMPENHO DE ADESÃO");
    const xs = [ML, ML + 80, ML + 160]; let y = 26;
    lbl(y, ["Nº EMPENHO", "DATA", "ADESÃO"], xs); val(y + 5, [e.numero || "—", fmtD(e.data), a.numero || "—"], xs); y += 11;
    lbl(y, ["ÓRGÃO ADERENTE", "UASG", "ATA ORIGEM"], xs); val(y + 5, [(a.orgaoAderente || "—").slice(0, 40), a.uasgAderente || "—", ata.numero || "—"], xs); y += 10;
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(.3); doc.line(ML, y, W - MR, y); y += 4;
    kpis(y, [["Valor desta OE", fmt(e.valorRecebido || 0), ROXO], ["Total empenhado na adesão", fmt(totEmp), [217, 119, 6]], ["Saldo disponível", fmt(saldo), saldo <= 0 ? [220, 38, 38] : AZUL]]); y += 18;
    doc.autoTable({ ...tabelaPadrao({ headStyles: { fillColor: ROXO, textColor: 255, fontStyle: "bold", fontSize: 8 }, alternateRowStyles: { fillColor: [245, 243, 255] }, footStyles: { fillColor: [109, 40, 217], textColor: 255, fontStyle: "bold", fontSize: 8 }, styles: { fontSize: 8, cellPadding: 3, valign: "middle", textColor: [30, 41, 59] } }), startY: y, margin: { left: ML, right: MR },
      head: [["Item", "Descrição", "Código", "Marca", "Qtd Adesão", "Qtd este Empenho", "Vl. Unit.", "Total"]],
      body: (a.itens || []).map((it, idx) => [it.num || "", it.nome || "", it.codigo || "", it.marca || "", it.qtdAdesao || 0, e.itensRecebidos?.[idx] || 0, fmt(it.precoUnit || 0), fmt((e.itensRecebidos?.[idx] || 0) * (it.precoUnit || 0))]),
      foot: [["", "", "", "", "", "TOTAL", "", fmt(e.valorRecebido || 0)]],
      columnStyles: { 0: { cellWidth: 10, halign: "center" }, 1: { cellWidth: 98 }, 2: { cellWidth: 22 }, 3: { cellWidth: 18 }, 4: { cellWidth: 20, halign: "right" }, 5: { cellWidth: 24, halign: "right", textColor: ROXO, fontStyle: "bold" }, 6: { cellWidth: 28, halign: "right" }, 7: { cellWidth: 28, halign: "right", textColor: VERDE, fontStyle: "bold" } } });
    rodape(doc, `Empenho ${e.numero || ""}`); doc.save(`empenho_adesao_${e.numero || e.id.slice(-6)}.pdf`); toast("PDF gerado."); return;
  }

  const p = getProp(e.propostaId); if (!p) { toast("Proposta não encontrada.", "erro"); return; }
  const l = getLicit(p.licitacaoId), o = getOrgao(l.orgaoId), portal = getPortal(l.portalId);
  const todos = store.get("empenhos").filter((x) => x.propostaId === e.propostaId); const totEmp = todos.reduce((s, x) => s + (x.valorRecebido || 0), 0); const total = propTotal(p);
  cabecalho(doc, "NOTA DE EMPENHO");
  const xs = [ML, ML + 90, ML + 190]; let y = 26;
  lbl(y, ["Nº EMPENHO", "DATA", "PREGÃO / Nº"], xs); val(y + 5, [e.numero || "—", fmtD(e.data), l.numero || "—"], xs); y += 11;
  lbl(y, ["TIPO", "PORTAL", "DATA PREGÃO"], xs); val(y + 5, [l.tipo || "—", portal.sigla || "—", fmtD(l.data)], xs); y += 11;
  lbl(y, ["ÓRGÃO"], xs); val(y + 5, [`${o.nome || "—"}${o.uasg ? " | UASG: " + o.uasg : ""}${o.municipio ? " | " + o.municipio : ""}${o.estado ? "/" + o.estado : ""}`.slice(0, 110)], xs); y += 9;
  doc.setDrawColor(226, 232, 240); doc.setLineWidth(.3); doc.line(ML, y, W - MR, y); y += 3;
  kpis(y, [["Valor total da proposta", fmt(total), VERDE], ["Este empenho", fmt(e.valorRecebido || 0), AZUL], ["Total empenhado", fmt(totEmp), totEmp >= total ? VERDE : [217, 119, 6]]]); y += 16;
  doc.autoTable({ ...tabelaPadrao({ styles: { fontSize: 8, cellPadding: 3, textColor: [30, 41, 59] } }), startY: y, margin: { left: ML, right: MR },
    head: [["Item", "Descrição", "Cód.", "Marca", "Preço Unit.", "Qtd Prop.", "Qtd Emp.", "Vlr Empenhado"]],
    body: (p.itens || []).map((it, idx) => { const q = e.itensRecebidos?.[idx] || 0; return [it.num || "", it.nome, it.codigo || "", it.marca || "", fmt(it.preco || 0), it.qtd, q, fmt(q * (it.preco || 0))]; }),
    foot: [["", "", "", "", "", "TOTAL", (e.itensRecebidos || []).reduce((s, v) => s + v, 0), fmt(e.valorRecebido || 0)]],
    columnStyles: { 0: { cellWidth: 14, halign: "center" }, 1: { cellWidth: 90 }, 2: { cellWidth: 38 }, 3: { cellWidth: 24 }, 4: { cellWidth: 26, halign: "right" }, 5: { cellWidth: 20, halign: "center" }, 6: { cellWidth: 20, halign: "center", textColor: AZUL, fontStyle: "bold" }, 7: { cellWidth: 28, halign: "right", textColor: VERDE, fontStyle: "bold" } } });
  y = doc.lastAutoTable.finalY + 8;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...AZUL); doc.text("Histórico de Empenhos desta Proposta", ML, y); doc.setDrawColor(...AZUL); doc.line(ML, y + 2, W - MR, y + 2);
  doc.autoTable({ ...tabelaPadrao({ headStyles: { fillColor: [100, 116, 139], textColor: 255 }, alternateRowStyles: { fillColor: [248, 250, 252] }, styles: { fontSize: 8 } }), startY: y + 5, margin: { left: ML, right: MR },
    head: [["Nº Empenho", "Data", "Valor", "Obs"]], body: todos.map((x) => [x.id === e.id ? `${x.numero} >> este` : x.numero || "—", fmtD(x.data), fmt(x.valorRecebido || 0), x.id === e.id ? "Empenho atual" : ""]),
    columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 30 }, 2: { cellWidth: 35, halign: "right" }, 3: { cellWidth: 60 } }, foot: [["", "TOTAL", fmt(totEmp), ""]] });
  const fy = doc.lastAutoTable.finalY + 8; doc.setDrawColor(...AZUL); doc.line(ML, fy, W - MR, fy);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(30, 41, 59); doc.text("Saldo disponível da proposta:", ML, fy + 6); doc.setTextColor(...VERDE); doc.text(fmt(total - totEmp), ML + 62, fy + 6);
  rodape(doc, `Empenho ${e.numero || ""}`); doc.save(`empenho_${e.numero || e.id.slice(-4)}.pdf`); toast("PDF gerado.");
}

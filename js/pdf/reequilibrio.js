// Pedido de Reequilíbrio Econômico-Financeiro (retrato) — portado de gerarPDFReq.
import { novoDoc, tabelaPadrao, EMPRESA, AZUL, VERDE, AMBAR, ROXO, CINZA, ESCURO, BRANCO } from "../core/pdf.js?v=20261113-011406";
import { fmt, fmtD, fmtNum } from "../core/utils.js?v=20261113-011406";
import { reqInfo } from "../modules/reequilibrio.js?v=20261113-011406";
import { toast } from "../core/ui.js?v=20261113-011406";

const TEXTO_FUND = {
  revisao: 'Art. 124, inciso II, alínea "d" da Lei nº 14.133/2021 — Os contratos poderão ser alterados, com as devidas justificativas, por acordo entre as partes, para restabelecer o equilíbrio econômico-financeiro inicial do contrato em caso de força maior, caso fortuito ou fato do príncipe ou em decorrência de fatos imprevisíveis ou previsíveis de consequências incalculáveis, que inviabilizem a execução do contrato tal como pactuado, respeitada, em qualquer caso, a repartição objetiva de risco estabelecida no contrato.',
  reajuste: "Art. 25, §7º c/c Art. 92, §3º da Lei nº 14.133/2021 — Independentemente do prazo de duração do contrato, será obrigatória a previsão no edital de índice de reajustamento de preço, com data-base vinculada à data do orçamento estimado. O interregno mínimo é de 1 (um) ano para o primeiro reajuste.",
  repactuacao: "Art. 135 da Lei nº 14.133/2021 — Os contratos de serviços contínuos poderão ser objeto de repactuação, mediante demonstração analítica da variação dos custos por meio de planilha de custos e formação de preços. O interregno mínimo é de 1 (um) ano.",
  outro: "Conforme justificativa detalhada apresentada neste documento.",
};

export async function gerarPdfReequilibrio(r) {
  if (!r) return;
  const doc = await novoDoc("portrait"); const { _W: W, _H: H, _ML: ML, _MR: MR, _CW: CW } = doc; const PB = 288;
  const { ata, l, o } = reqInfo(r); const hoje = new Date(); const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  const header = (first) => {
    doc.setFillColor(...AZUL); doc.rect(0, 0, W, 24, "F"); doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 3, "F"); doc.setFillColor(...VERDE); doc.rect(0, 24, W, 1.5, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...BRANCO); doc.text(EMPRESA.nome, ML, 10);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(200, 210, 230); doc.text(EMPRESA.endereco, ML, 14.5); doc.text(`CNPJ: ${EMPRESA.cnpj}  |  IE: ${EMPRESA.ie}  |  ${EMPRESA.tel}  |  ${EMPRESA.email}`, ML, 18.5);
    if (first) { doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...BRANCO); doc.text("PEDIDO DE REEQUILÍBRIO", W - MR, 9, { align: "right" }); doc.text("ECONÔMICO-FINANCEIRO", W - MR, 13.5, { align: "right" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(200, 210, 230); doc.text("Nº " + (r.numero || "—"), W - MR, 18, { align: "right" }); doc.text("Emitido em " + hoje.toLocaleDateString("pt-BR"), W - MR, 21.5, { align: "right" }); }
    else { doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...BRANCO); doc.text("Reequilíbrio Nº " + (r.numero || "—"), W - MR, 12, { align: "right" }); doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(200, 210, 230); doc.text("(continuação)", W - MR, 16, { align: "right" }); }
  };
  const secao = (t, y, cor) => { doc.setFillColor(...cor); doc.rect(ML, y, 3, 5, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...cor); doc.text(t, ML + 5, y + 3.8); doc.setDrawColor(...cor); doc.setLineWidth(.2); doc.line(ML + 5 + doc.getTextWidth(t) + 2, y + 2.5, W - MR, y + 2.5); return y + 7; };
  const box = (x, y, w, h, bg) => { doc.setFillColor(...bg); doc.roundedRect(x, y, w, h, 2, 2, "F"); };
  const checkY = (y, h) => { if (y + h > PB - 8) { doc.addPage(); header(false); return 30; } return y; };

  header(true); let y = 29;
  const bw = (CW - 4) / 2;
  box(ML, y, bw, 30, [240, 247, 255]); doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...AZUL); doc.text("DESTINATÁRIO", ML + 4, y + 5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...ESCURO); const on = doc.splitTextToSize(o.nome || "—", bw - 8); doc.text(on, ML + 4, y + 10);
  const oy = y + 10 + on.length * 3.5; doc.setFontSize(7); doc.setTextColor(...CINZA); doc.text("UASG: " + (o.uasg || "—"), ML + 4, oy); doc.text("CNPJ: " + (o.cnpj || "—"), ML + 4, oy + 3.5); doc.text((o.municipio || "—") + "/" + (o.estado || "—"), ML + 4, oy + 7);
  const bx = ML + bw + 4; box(bx, y, bw, 30, [240, 253, 244]); doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...VERDE); doc.text("CONTRATO / ATA DE REGISTRO DE PREÇOS", bx + 4, y + 5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...ESCURO); doc.text("ATA: " + (ata?.numero || "—"), bx + 4, y + 10); doc.text("Pregão: " + (l?.numero || "—"), bx + 4, y + 14);
  doc.setFontSize(7); doc.setTextColor(...CINZA); doc.text(`Vigência: ${fmtD(ata?.assinatura)} a ${fmtD(ata?.vencimento)}`, bx + 4, y + 19); if (r.processo) doc.text("Processo: " + r.processo, bx + 4, y + 23);
  y += 34;

  y = secao("FUNDAMENTAÇÃO LEGAL", y, AZUL);
  const ft = TEXTO_FUND[r.fundamento] || TEXTO_FUND.revisao; const fl = doc.splitTextToSize(ft, CW - 10); const fh = fl.length * 3.5 + 8;
  box(ML, y, CW, fh, [245, 243, 255]); doc.setFillColor(...ROXO); doc.rect(ML, y, 1.5, fh, "F"); doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(75, 65, 130); doc.text(fl, ML + 5, y + 5);
  if (r.indice) { doc.setFont("helvetica", "bold"); doc.text("Índice de referência: " + r.indice, ML + 5, y + fh - 3); } y += fh + 4;

  y = checkY(y, 30); y = secao("JUSTIFICATIVA", y, VERDE);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...ESCURO); const jl = doc.splitTextToSize(r.justificativa || "", CW); doc.text(jl, ML, y); y += jl.length * 3.5 + 5;

  y = checkY(y, 40); y = secao("DEMONSTRATIVO DE PREÇOS", y, AMBAR);
  doc.autoTable({ ...tabelaPadrao({ styles: { fontSize: 7, cellPadding: 2.8, valign: "middle", textColor: ESCURO, lineColor: [226, 232, 240], lineWidth: .1 }, headStyles: { fillColor: AMBAR, textColor: BRANCO, fontStyle: "bold", fontSize: 6.5, cellPadding: 3.2 }, footStyles: { fillColor: AZUL, textColor: BRANCO, fontStyle: "bold", fontSize: 8 }, alternateRowStyles: { fillColor: [255, 251, 235] } }), startY: y, margin: { left: ML, right: MR, top: 30 },
    head: [["Item", "Descrição", "Qtd", "Custo Ant.", "Custo Atual", "Var. %", "Preço Venda", "Novo Preço", "Dif. Total"]],
    body: (r.itens || []).map((it) => [it.num || "—", it.nome || "—", fmtNum(it.qtd), fmt(it.custoAntigo), fmt(it.custoAtual), (it.varCusto || 0).toFixed(2) + "%", fmt(it.precoOrig), fmt(it.novoPreco), fmt(it.difTotal)]),
    foot: [["", "", "", "", "", "", "", "TOTAL", fmt(r.valorDif || 0)]],
    columnStyles: { 0: { cellWidth: 11, halign: "center" }, 2: { cellWidth: 13, halign: "right" }, 3: { cellWidth: 20, halign: "right" }, 4: { cellWidth: 20, halign: "right", textColor: AMBAR, fontStyle: "bold" }, 5: { cellWidth: 15, halign: "right", textColor: ROXO, fontStyle: "bold" }, 6: { cellWidth: 20, halign: "right" }, 7: { cellWidth: 20, halign: "right", textColor: VERDE, fontStyle: "bold" }, 8: { cellWidth: 22, halign: "right", fontStyle: "bold" } },
    showHead: "everyPage", didDrawPage: (d) => { if (d.pageNumber > 1) header(false); } });
  y = doc.lastAutoTable.finalY + 5;

  y = checkY(y, 24); box(ML, y, CW, 20, [255, 251, 235]); doc.setFillColor(...AMBAR); doc.rect(ML, y, CW, .8, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...AMBAR); doc.text("RESUMO DO REEQUILÍBRIO", ML + 4, y + 5.5);
  const rw = CW / 4, ry = y + 10; doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...CINZA);
  ["Valor Original", "Valor Reajustado", "Diferença", "Reajuste Médio"].forEach((t, i) => doc.text(t, ML + 4 + rw * i, ry));
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...ESCURO); doc.text(fmt(r.totalOrig), ML + 4, ry + 4.5); doc.setTextColor(...AMBAR); doc.text(fmt(r.totalNovo), ML + 4 + rw, ry + 4.5);
  doc.setTextColor(...((r.valorDif || 0) > 0 ? [220, 38, 38] : VERDE)); doc.text(fmt(r.valorDif), ML + 4 + rw * 2, ry + 4.5); doc.setTextColor(...ROXO); doc.text((r.percReajuste || 0).toFixed(2) + "%", ML + 4 + rw * 3, ry + 4.5); y += 24;

  y = checkY(y, 50); y = secao("DECLARAÇÃO", y, AZUL);
  const decl = `A empresa ${EMPRESA.nome}, inscrita no CNPJ sob o nº ${EMPRESA.cnpj}, vem respeitosamente solicitar o reequilíbrio econômico-financeiro do contrato/ATA acima identificado, conforme demonstrativo de preços e justificativa apresentados.\n\nDeclaramos que os novos preços propostos refletem as alterações de custos devidamente comprovadas e que nos comprometemos a manter todas as demais condições contratuais inalteradas, em estrita observância à legislação vigente.\n\nRessaltamos que o reequilíbrio ora solicitado visa exclusivamente restabelecer a equação econômico-financeira originalmente pactuada, sem qualquer intuito de auferir vantagem indevida.`;
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...ESCURO); const dl = doc.splitTextToSize(decl, CW); doc.text(dl, ML, y); y += dl.length * 3.5 + 10;

  y = checkY(y, 30); doc.setFontSize(7.5); doc.setTextColor(...CINZA); doc.text(`Itajaí-SC, ${hoje.getDate()} de ${meses[hoje.getMonth()]} de ${hoje.getFullYear()}.`, W - MR, y, { align: "right" }); y += 22;
  const aw = 80, ax = W - MR - aw; doc.setDrawColor(...ESCURO); doc.setLineWidth(.3); doc.line(ax, y, ax + aw, y);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...ESCURO); doc.text(EMPRESA.representante, ax + aw / 2, y + 5, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...CINZA); doc.text(`CPF: ${EMPRESA.cpf}  -  Representante Legal`, ax + aw / 2, y + 9.5, { align: "center" }); doc.text(EMPRESA.nome, ax + aw / 2, y + 13.5, { align: "center" }); doc.text(`CNPJ: ${EMPRESA.cnpj}`, ax + aw / 2, y + 17, { align: "center" });

  const n = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setDrawColor(226, 232, 240); doc.setLineWidth(.3); doc.line(ML, PB - 4, W - MR, PB - 4); doc.setFillColor(...VERDE); doc.rect(0, H - 2, W, 2, "F");
    doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...CINZA); doc.text(`Página ${i} de ${n}`, W - MR, PB, { align: "right" }); doc.text(EMPRESA.nome, ML, PB); doc.setTextColor(...AZUL); doc.text(`Reequilíbrio Econômico-Financeiro Nº ${r.numero || "—"}  |  ${hoje.toLocaleDateString("pt-BR")}`, ML + 40, PB); }
  doc.save("reequilibrio_" + (r.numero || "novo").replace(/\//g, "-") + ".pdf"); toast("PDF gerado.");
}

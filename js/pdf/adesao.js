// Termo de Aceite de Adesão — portado de _gerarTermoAceitePDF.
import { novoDoc, cabecalho, rodape, tabelaPadrao, AZUL, VERDE, ROXO, EMPRESA } from "../core/pdf.js?v=20261113-135731";
import { store } from "../core/store.js?v=20261113-135731";
import { fmt, fmtD, fmtNum } from "../core/utils.js?v=20261113-135731";
import { getLicit, getOrgao, getProp, getAta } from "../core/domain.js?v=20261113-135731";
import { toast } from "../core/ui.js?v=20261113-135731";

function cab(doc) { cabecalho(doc, "TERMO DE ACEITE", "Adesão de Ata de Registro de Preços"); }

export async function gerarTermoAceite(a) {
  const doc = await novoDoc("landscape");
  const ata = getAta(a.ataId) || {}, p = getProp(ata.propostaId) || {}, l = getLicit(p.licitacaoId), o = getOrgao(l.orgaoId);
  const { _W: W, _H: H, _ML: ML, _MR: MR, _CW: CW } = doc;
  const hoje = new Date(); const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  cab(doc); let y = 26;

  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...AZUL); doc.text("TERMO DE ACEITE DE ADESÃO", W / 2, y, { align: "center" }); y += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(100, 116, 139); doc.text(`Adesão nº ${a.numero || "—"}  |  Processo: ${a.processo || "—"}`, W / 2, y, { align: "center" }); y += 3;
  doc.setDrawColor(...AZUL); doc.setLineWidth(.6); doc.line(ML, y, W - MR, y); y += 7;

  const colW = (CW - 6) / 2, xL = ML, xR = ML + colW + 6, bh = 36;
  const lbl = (t, x, yy) => { doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(148, 163, 184); doc.text(t, x, yy); };
  const val = (t, x, yy, sz = 8.5) => { doc.setFont("helvetica", "bold"); doc.setFontSize(sz); doc.setTextColor(30, 41, 59); doc.text(t, x, yy); };
  doc.setFillColor(239, 246, 255); doc.rect(xL, y, colW, bh, "F"); doc.setDrawColor(191, 219, 254); doc.setLineWidth(.3); doc.rect(xL, y, colW, bh, "D");
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...AZUL); doc.text("ATA DE REGISTRO DE PREÇOS — ORIGEM", xL + 4, y + 6);
  lbl("Nº DA ATA", xL + 4, y + 13); lbl("PREGÃO / PROCESSO LICITATÓRIO", xL + 35, y + 13); lbl("UASG GERENCIADORA", xL + 4, y + 24); lbl("VENCIMENTO DA ATA", xL + colW / 2, y + 24);
  val(ata.numero || "—", xL + 4, y + 19); val((l.numero || "—").slice(0, 28), xL + 35, y + 19); val(o.uasg || "—", xL + 4, y + 30); val(fmtD(ata.vencimento), xL + colW / 2, y + 30);
  doc.setFillColor(240, 253, 244); doc.rect(xR, y, colW, bh, "F"); doc.setDrawColor(167, 243, 208); doc.rect(xR, y, colW, bh, "D");
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...VERDE); doc.text("ÓRGÃO ADERENTE (SOLICITANTE)", xR + 4, y + 6);
  lbl("ÓRGÃO ADERENTE", xR + 4, y + 13); lbl("UASG", xR + colW * .55, y + 13); lbl("CNPJ", xR + colW * .72, y + 13);
  val((a.orgaoAderente || "—").slice(0, 32), xR + 4, y + 19); val(a.uasgAderente || "—", xR + colW * .55, y + 19); val(a.cnpjAderente || "—", xR + colW * .72, y + 19);
  lbl("MUNICÍPIO / UF", xR + 4, y + 24); lbl("RESPONSÁVEL", xR + colW * .38, y + 24); lbl("E-MAIL", xR + colW * .65, y + 24);
  val((a.municipioAderente || "—").slice(0, 18), xR + 4, y + 30, 8); val((a.responsavel || "—").slice(0, 22), xR + colW * .38, y + 30, 8); val((a.email || "—").slice(0, 30), xR + colW * .65, y + 30, 8);
  y += bh + 4;

  const vh = 20;
  doc.setFillColor(239, 246, 255); doc.rect(xL, y, colW, vh, "F"); doc.setDrawColor(191, 219, 254); doc.rect(xL, y, colW, vh, "D");
  lbl("ÓRGÃO GERENCIADOR (DETENTOR DA ATA)", xL + 4, y + 6); const nome = doc.splitTextToSize(o.nome || "—", colW - 8); val(nome[0] || "—", xL + 4, y + 13); if (nome[1]) val(nome[1], xL + 4, y + 18);
  doc.setFillColor(250, 245, 255); doc.rect(xR, y, colW, vh, "F"); doc.setDrawColor(221, 214, 254); doc.rect(xR, y, colW, vh, "D");
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...ROXO); doc.text("VIGÊNCIA DA ADESÃO", xR + 4, y + 6);
  const qW = colW / 4; lbl("SOLICITAÇÃO", xR + 4, y + 11); lbl("APROVAÇÃO", xR + qW + 2, y + 11); lbl("VENCIMENTO", xR + qW * 2 + 2, y + 11); lbl("STATUS", xR + qW * 3 + 2, y + 11);
  val(fmtD(a.solicitacao), xR + 4, y + 17); val(a.aprovacao ? fmtD(a.aprovacao) : "Pendente", xR + qW + 2, y + 17); val(a.vencimento ? fmtD(a.vencimento) : "—", xR + qW * 2 + 2, y + 17);
  doc.setTextColor(...(a.status === "Aprovada" ? VERDE : a.status === "Negada" ? [220, 38, 38] : [217, 119, 6])); doc.text(a.status || "—", xR + qW * 3 + 2, y + 17);
  y += vh + 5;

  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...AZUL); doc.text("ITENS AUTORIZADOS PARA ADESÃO", ML, y); doc.setDrawColor(...AZUL); doc.setLineWidth(.3); doc.line(ML, y + 1.5, W - MR, y + 1.5); y += 4;
  const itens = a.itens || []; const tot = itens.reduce((s, it) => s + (it.total || 0), 0);
  doc.autoTable({ ...tabelaPadrao({ footStyles: { fillColor: VERDE, textColor: 255, fontStyle: "bold", fontSize: 8 } }), startY: y, margin: { left: ML, right: MR },
    head: [["Item", "Descrição", "Código", "Marca", "Qtd. ATA", "Limite 50%", "Qtd. Adesão", "Vl. Unit. (R$)", "Total (R$)"]],
    body: itens.map((it) => [it.num || "—", it.nome || "—", it.codigo || "—", it.marca || "—", fmtNum(it.qtdAta), fmtNum(it.limite50 ?? Math.floor((it.qtdAta || 0) * 50) / 100), fmtNum(it.qtdAdesao), fmt(it.precoUnit), fmt(it.total)]),
    foot: [["", "", "", "", "", "", "TOTAL GERAL", "", fmt(tot)]],
    columnStyles: { 0: { cellWidth: 12, halign: "center" }, 1: { cellWidth: 75 }, 2: { cellWidth: 24 }, 3: { cellWidth: 20 }, 4: { cellWidth: 20, halign: "right" }, 5: { cellWidth: 22, halign: "right", textColor: ROXO }, 6: { cellWidth: 22, halign: "right", fontStyle: "bold" }, 7: { cellWidth: 28, halign: "right" }, 8: { cellWidth: 30, halign: "right", textColor: VERDE } } });
  y = doc.lastAutoTable.finalY + 6;

  const nova = (lim) => { if (y > lim) { doc.addPage(); cab(doc); y = 26; } };
  if (a.obs) { nova(160); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...AZUL); doc.text("OBSERVAÇÕES", ML, y); doc.line(ML, y + 1.5, W - MR, y + 1.5); y += 5;
    doc.setFont("helvetica", "normal"); doc.setTextColor(50, 50, 50); const ls = doc.splitTextToSize(a.obs, CW); doc.text(ls, ML, y); y += ls.length * 3.8 + 6; }
  nova(145);
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...AZUL); doc.text("DECLARAÇÃO DE ACEITE", ML, y); doc.setDrawColor(...AZUL); doc.line(ML, y + 1.5, W - MR, y + 1.5); y += 6;
  const txt = `A empresa ${EMPRESA.nome}, inscrita no CNPJ sob o nº ${EMPRESA.cnpj}, por meio deste instrumento, ACEITA expressamente a adesão ao processo licitatório acima identificado, em conformidade com o disposto no art. 86 da Lei nº 14.133/2021 e demais normas regulamentares aplicáveis.\n\nDeclaramos que os preços registrados na Ata de Registro de Preços nº ${ata.numero || "—"}, celebrada com o(a) ${o.nome || "órgão gerenciador"}, permanecem vigentes e serão praticados nas mesmas condições ao(a) ${a.orgaoAderente || "órgão aderente"}, nas quantidades e valores descritos no quadro acima, observado o limite individual de 50% (cinquenta por cento) por órgão aderente e o limite coletivo de 200% (duzentos por cento) somando-se todas as adesões externas, nos termos do art. 86 da Lei nº 14.133/2021.\n\nA presente adesão está condicionada à vigência da Ata de Registro de Preços de origem e não implica qualquer alteração dos seus termos.`;
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(50, 50, 50); const pl = doc.splitTextToSize(txt, CW); doc.text(pl, ML, y); y += pl.length * 3.6 + 8;
  nova(175);
  doc.setFontSize(7.5); doc.setTextColor(55, 65, 81); doc.text(`Itajaí-SC, ${hoje.getDate()} de ${meses[hoje.getMonth()]} de ${hoje.getFullYear()}.`, W - MR, y, { align: "right" }); y += 25;
  const ax = W - MR - 75; doc.setDrawColor(30, 41, 59); doc.setLineWidth(.35); doc.line(ax, y, W - MR, y);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(30, 41, 59); doc.text(EMPRESA.representante, W - MR - 37.5, y + 5, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.text(`CPF: ${EMPRESA.cpf}  -  Representante Legal`, W - MR - 37.5, y + 10, { align: "center" }); doc.text(`${EMPRESA.nome}  -  CNPJ: ${EMPRESA.cnpj}`, W - MR - 37.5, y + 15, { align: "center" });

  // fichas técnicas dos itens
  const prods = store.get("produtos"); let nF = 0;
  for (const it of itens) {
    const pi = (p.itens || []).find((x) => x.num === it.num || x.nome === it.nome);
    const prod = (pi?.produtoId && prods.find((x) => x.id === pi.produtoId)) || prods.find((x) => it.codigo && x.codigo === it.codigo) || prods.find((x) => it.nome && x.nome === it.nome);
    if (!prod?.prodFichaData) continue;
    doc.addPage("a4", "landscape"); nF++;
    doc.setFillColor(5, 150, 105); doc.rect(0, 0, W, 18, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
    doc.text(`FICHA TÉCNICA — Item ${it.num || ""}: ${(it.nome || "").slice(0, 80)}`, 8, 12);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.text(`Código: ${it.codigo || "—"}   Marca: ${it.marca || "—"}   Qtd. Adesão: ${it.qtdAdesao || 0}   Vl. Unit.: ${fmt(it.precoUnit)}   Adesão: ${a.numero || "—"}`, 8, 22);
    try {
      const img = prod.prodFichaData; const tmp = new Image(); await new Promise((r, j) => { tmp.onload = r; tmp.onerror = j; tmp.src = img; });
      const aw = W - 4, ah = H - 26, ratio = Math.min(aw / tmp.width, ah / tmp.height), fw = tmp.width * ratio, fh = tmp.height * ratio;
      doc.addImage(img, img.includes("image/png") ? "PNG" : "JPEG", (W - fw) / 2, 25 + (ah - fh) / 2, fw, fh, "", "NONE");
    } catch { doc.setFontSize(10); doc.setTextColor(150, 150, 150); doc.text("Ficha técnica não disponível para este item.", 8, 50); }
  }
  rodape(doc, `Termo de Aceite — Adesão nº ${a.numero || "—"}`);
  doc.save(`termo_aceite_adesao_${(a.numero || "novo").replace(/\//g, "-")}.pdf`);
  toast(nF ? `Termo de aceite gerado com ${nF} ficha(s) técnica(s).` : "Termo de aceite gerado.");
}

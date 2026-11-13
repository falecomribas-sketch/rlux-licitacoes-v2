// PDF da proposta comercial — portado do legado (gerarPDF), mesmo layout.
import { novoDoc, cabecalho, tituloSecao, assinatura, tabelaPadrao, EMPRESA, AZUL } from "../core/pdf.js?v=20261113-204612";
import { store } from "../core/store.js?v=20261113-204612";
import { fmt, fmtD, toTitleCase } from "../core/utils.js?v=20261113-204612";
import { getLicit, getOrgao, getPortal, propTotal } from "../core/domain.js?v=20261113-204612";
import { toast } from "../core/ui.js?v=20261113-204612";

function numPorExtenso(n) {
  const u = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const d = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const c = ["", "cem", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  if (n === 0) return "zero";
  let s = "";
  if (n >= 1e6) { const m = Math.floor(n / 1e6); s += numPorExtenso(m) + (m > 1 ? " milhões" : " milhão"); n %= 1e6; if (n) s += " e "; }
  if (n >= 1000) { const m = Math.floor(n / 1000); s += m === 1 ? "mil" : numPorExtenso(m) + " mil"; n %= 1000; if (n) s += " e "; }
  if (n >= 100) { const ce = Math.floor(n / 100); n %= 100; s += ce === 1 && n ? "cento" : c[ce]; if (n) s += " e "; }
  if (n >= 20) { s += d[Math.floor(n / 10)]; n %= 10; if (n) s += " e "; }
  if (n > 0) s += u[n];
  return s;
}
export function valorExtenso(v) {
  const reais = Math.floor(v), cent = Math.round((v - reais) * 100);
  let s = numPorExtenso(reais) + (reais === 1 ? " real" : " reais");
  if (cent) s += " e " + numPorExtenso(cent) + (cent === 1 ? " centavo" : " centavos");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function imagemBase64(src) {
  if (!src) return null;
  if (src.startsWith("data:image")) return src;
  try {
    const r = await fetch(src); if (!r.ok) throw 0;
    const blob = await r.blob();
    return await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
  } catch { return null; }
}

export async function gerarPdfProposta(p, opts = { comCusto: false, comMarca: true, comCodigo: true, comFicha: false }) {
  const doc = await novoDoc("landscape");
  const l = getLicit(p.licitacaoId), o = getOrgao(l.orgaoId), portal = getPortal(l.portalId);
  const total = propTotal(p);
  const { _W: W, _ML: ML, _MR: MR, _CW: CW, _H: PH } = doc;

  const desenharCab = () => cabecalho(doc, "PROPOSTA COMERCIAL", "Emitida em " + new Date().toLocaleDateString("pt-BR"));
  const novaPagina = () => { doc.addPage(); desenharCab(); return 26; };
  const checkY = (y, h) => (y + h > PH - 10 ? novaPagina() : y);

  let y = desenharCab();
  y = tituloSecao(doc, y, "DADOS DA LICITAÇÃO");
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(50, 50, 50);
  doc.text(`Órgão: ${toTitleCase(o.nome || "-")}     UASG: ${o.uasg || "-"}     CNPJ: ${o.cnpj || "-"}`, ML, y); y += 4.5;
  doc.text(`Licitação: ${l.numero || "-"}     Tipo: ${l.tipo || "-"}     Portal: ${portal.sigla || "-"}     Data Pregão: ${fmtD(l.data)}`, ML, y); y += 5;
  y = tituloSecao(doc, y, "ITENS DA PROPOSTA") - 2;

  const head = ["Item", "Descrição"]; const cs = { 0: { cellWidth: 10, halign: "center" }, 1: { cellWidth: "auto" } }; let ci = 2;
  if (opts.comCodigo) { const maxLen = Math.max(...(p.itens || []).map((i) => (i.codigo || "").length), 5); head.push("Código"); cs[ci++] = { cellWidth: Math.min(Math.max(maxLen * 2.2, 16), 42), overflow: "ellipsize" }; }
  if (opts.comMarca) { head.push("Marca"); cs[ci++] = { cellWidth: 22 }; }
  head.push("Qtd"); cs[ci++] = { cellWidth: 12, halign: "center" };
  if (opts.comCusto) { head.push("Custo"); cs[ci++] = { cellWidth: 22, halign: "right" }; }
  head.push("Preço Un."); cs[ci++] = { cellWidth: 24, halign: "right" };
  head.push("Total"); cs[ci++] = { cellWidth: 26, halign: "right" };
  const rows = (p.itens || []).map((i) => { const r = [i.num || "", i.nome]; if (opts.comCodigo) r.push(i.codigo || ""); if (opts.comMarca) r.push(i.marca || ""); r.push(i.qtd); if (opts.comCusto) r.push(fmt(i.custo || 0)); r.push(fmt(i.preco), fmt(i.total)); return r; });

  doc.autoTable({ ...tabelaPadrao({ styles: { fontSize: 7.5, cellPadding: 2, overflow: "linebreak", textColor: [30, 41, 59] }, headStyles: { fillColor: AZUL, textColor: 255, fontStyle: "bold", fontSize: 7.5 }, footStyles: { fillColor: AZUL, textColor: 255, fontStyle: "bold", fontSize: 8.5 } }),
    head: [head], body: rows, startY: y, foot: [Array(head.length - 2).fill("").concat(["TOTAL", fmt(total)])],
    columnStyles: cs, margin: { left: ML, right: MR, top: 26 }, showHead: "everyPage", showFoot: "lastPage",
    didDrawPage: (d) => { if (d.pageNumber > 1) desenharCab(); } });
  y = doc.lastAutoTable.finalY + 5;
  if (y + 75 > PH - 8) y = novaPagina() + 2;

  // valor por extenso
  doc.setFillColor(239, 246, 255); doc.setDrawColor(...AZUL); doc.setLineWidth(.6); doc.rect(ML, y, CW, 9, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...AZUL); doc.text(fmt(total), ML + 3, y + 6);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(50, 50, 50);
  const ext = doc.splitTextToSize("(" + valorExtenso(total) + ")", CW - doc.getTextWidth(fmt(total)) - 6);
  doc.text(ext[0], ML + 3 + doc.getTextWidth(fmt(total)) + 3, y + 6); y += 13;

  // dados comerciais
  y = checkY(y, 40); y = tituloSecao(doc, y, "DADOS COMERCIAIS");
  const midX = ML + CW / 2 + 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(30, 41, 59);
  doc.text(EMPRESA.nome, ML, y); doc.text("Dados Bancários Para Depósito", midX, y); y += 4;
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(55, 65, 81);
  doc.text(EMPRESA.endereco, ML, y); doc.text(EMPRESA.bancos[0], midX, y); y += 3.8;
  doc.text(`Telefone: ${EMPRESA.tel}`, ML, y); doc.text(EMPRESA.bancos[1], midX, y); y += 3.8;
  doc.text(`CNPJ: ${EMPRESA.cnpj}   IE: ${EMPRESA.ie}`, ML, y); y += 3.8;
  doc.text(`Email: ${EMPRESA.email}   Site: ${EMPRESA.site}`, ML, y); y += 5;
  [["Validade da Proposta: Conforme Edital", "Prazo de Entrega: Conforme Edital"], ["Prazo Para Pagamento: Conforme Edital", "Prazo de Garantia: Conforme Edital"]]
    .forEach(([a, b]) => { doc.text(a, ML, y); doc.text(b, midX, y); y += 4; });
  y += 3;

  // declarações
  y = checkY(y, 28); y = tituloSecao(doc, y, "DECLARAÇÕES");
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(55, 65, 81);
  const d1 = doc.splitTextToSize("Nos termos do Art. 62 da Lei 14.133/2021, declaramos que esta proposta foi elaborada de boa-fé e que temos plena capacidade para cumprir as obrigações assumidas. Declaramos, ainda, que nos responsabilizamos pela veracidade das informações prestadas e pelo cumprimento integral das condições aqui estabelecidas, nos termos da legislação vigente.", CW);
  doc.text(d1, ML, y); y += d1.length * 3.5 + 2;
  const d2 = doc.splitTextToSize("Declaro que os preços contidos na proposta incluem todos os custos e despesas, e outros necessários ao cumprimento integral do objeto deste Edital e seus Anexos.", CW);
  doc.text(d2, ML, y); y += d2.length * 3.5 + 6;
  y = checkY(y, 18); assinatura(doc, y);

  // fichas técnicas
  if (opts.comFicha) {
    const prods = store.get("produtos");
    for (const item of p.itens || []) {
      const prod = prods.find((x) => x.id === item.produtoId);
      if (!prod?.prodFichaData) continue;
      doc.addPage("a4", "landscape");
      doc.setFillColor(5, 150, 105); doc.rect(0, 0, W, 18, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
      doc.text(`FICHA TÉCNICA — Item ${item.num || ""}: ${(item.nome || "").slice(0, 80)}`, 8, 12);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7);
      doc.text(`Código: ${item.codigo || "—"}   Marca: ${item.marca || "—"}   Qtd: ${item.qtd}   Preço Un.: ${fmt(item.preco)}`, 8, 22);
      try {
        const img = await imagemBase64(prod.prodFichaData);
        if (!img) throw 0;
        const tmp = new Image(); await new Promise((r, j) => { tmp.onload = r; tmp.onerror = j; tmp.src = img; });
        const areaW = W - 4, areaH = PH - 26, ratio = Math.min(areaW / tmp.width, areaH / tmp.height);
        const fw = tmp.width * ratio, fh = tmp.height * ratio;
        doc.addImage(img, img.includes("image/png") ? "PNG" : "JPEG", (W - fw) / 2, 25 + (areaH - fh) / 2, fw, fh, "", "NONE");
      } catch { doc.setFontSize(10); doc.setTextColor(150, 150, 150); doc.text("Ficha técnica não disponível para este item.", 8, 50); }
    }
  }

  doc.save(`proposta_${p.num || p.id.slice(-4)}.pdf`);
  toast("PDF gerado.");
}

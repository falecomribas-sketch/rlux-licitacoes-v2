// Resultados de disputa: leitura da planilha "Exportação de resultados" da Effecti, classificação da perda
// e agregações para o painel Resultados. Os dados ficam em proposta.resultadoDisputa.itens[] (campo concorrencia).
import { store } from "./store.js?v=20261123-122444";
import { abrirExcel } from "./forms.js?v=20261123-122444";
import { getLicit, getOrgao, getPortal } from "./domain.js?v=20261123-122444";
import { piso, getCfg, deduzirFamilia, FAMILIAS_TEC } from "./preco.js?v=20261123-122444";

export const NOS_RE = /rlux/i;
const LANCE_DESISTENCIA = 10000; // lances tipo "100.000" são desistência — ignorados na análise
const norm = (s) => String(s ?? "").trim().toLowerCase();
// número vindo da planilha: já numérico, ou texto "1.234,56" / "1234.56"
const numBR = (v) => { if (typeof v === "number") return v; const t = String(v ?? "").trim().replace(/[R$\s]/g, ""); if (!t) return 0; const br = /,\d{1,2}$/.test(t); return +(br ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "")) || 0; };

// Lê a planilha da Effecti → [{ item, descricao, qtd, lances: [{ pos, empresa, cnpj, porte, marca, valor, total }] }]
export async function lerResultadosEffecti(file) {
  const ex = await abrirExcel(file); const rows = ex.rows || [];
  const hi = rows.findIndex((r) => r.some((c) => /posi[çc][ãa]o/i.test(String(c))) && r.some((c) => /^item$/i.test(String(c).trim())));
  if (hi < 0) throw new Error("Esta não parece a exportação de resultados da Effecti (precisa das colunas Posição, Item, Nome Empresa e Valor Unitário).");
  const cab = rows[hi].map(norm); const col = (re) => cab.findIndex((c) => re.test(c));
  const cPos = col(/posi[çc][ãa]o/), cItem = col(/^item$/), cDesc = col(/descri/), cCnpj = col(/cnpj/), cEmp = col(/nome.*empresa|empresa|licitante|fornecedor/), cPorte = col(/porte/), cMarca = col(/marca/), cModelo = col(/modelo/), cFabr = col(/fabricante/), cQtd = col(/quantidade/), cVal = col(/valor unit/), cTot = col(/valor total/);
  if (cPos < 0 || cItem < 0 || cEmp < 0 || cVal < 0) throw new Error("Planilha de resultados sem as colunas esperadas (Posição, Item, Nome Empresa, Valor Unitário).");
  const itens = []; let cur = null;
  for (const r of rows.slice(hi + 1)) {
    const item = String(r[cItem] ?? "").trim(); const pos = String(r[cPos] ?? "").trim(); const emp = String(r[cEmp] ?? "").trim();
    if (item) { cur = { item: item.replace(/^0+(?=\d)/, ""), itemOriginal: item, descricao: String(r[cDesc] ?? "").trim(), qtd: +r[cQtd] || null, lances: [] }; itens.push(cur); continue; }
    if (!cur || !pos || !emp) continue;
    const valor = numBR(r[cVal]);
    cur.lances.push({ pos: parseInt(pos, 10) || cur.lances.length + 1, empresa: emp, cnpj: String(r[cCnpj] ?? "").trim(), porte: String(r[cPorte] ?? "").trim(), marca: String(r[cMarca] ?? "").trim(), modelo: cModelo >= 0 ? String(r[cModelo] ?? "").trim() : "", fabricante: cFabr >= 0 ? String(r[cFabr] ?? "").trim() : "", valor, total: numBR(r[cTot]) });
  }
  itens.forEach((it) => it.lances.sort((a, b) => a.pos - b.pos));
  return itens.filter((it) => it.lances.length);
}

// Resumo de um item: vencedor, nosso lance/posição, 2º colocado, diferença
export function resumoItem(it) {
  const validos = it.lances.filter((l) => l.valor > 0 && l.valor < LANCE_DESISTENCIA);
  const venc = validos[0] || it.lances[0] || null; const nos = it.lances.find((l) => NOS_RE.test(l.empresa)) || null;
  const outros = validos.filter((l) => !NOS_RE.test(l.empresa)); const melhorOutro = outros[0] || null;
  const segundo = validos[1] || null;
  return {
    vencedor: venc?.empresa || "", cnpjVencedor: venc?.cnpj || "", precoVencedor: venc?.valor ?? null, marcaVencedor: [venc?.marca, venc?.modelo].filter(Boolean).join(" ") + (venc?.fabricante && venc.fabricante !== venc.marca ? ` (${venc.fabricante})` : ""), nossaMarca: [nos?.marca, nos?.modelo].filter(Boolean).join(" "),
    nossaPosicao: nos?.pos ?? null, nossoPreco: nos?.valor ?? null, ganhamos: !!nos && NOS_RE.test(venc?.empresa || ""),
    precoSegundo: segundo?.valor ?? null, melhorConcorrente: melhorOutro?.empresa || "", precoMelhorConcorrente: melhorOutro?.valor ?? null,
    nLances: validos.length, participamos: !!nos,
  };
}

// Classe da perda: empate (≤ 2 centavos ou ≤ 0,3%), acima_piso, entre_custo_piso, abaixo_custo
export function classificarPerda({ precoVencedor, nossoPreco, custo, piso: ps }) {
  if (!(precoVencedor > 0)) return "";
  if (nossoPreco > 0 && (nossoPreco - precoVencedor <= 0.02 || (nossoPreco - precoVencedor) / precoVencedor <= 0.003)) return "empate";
  if (ps > 0 && precoVencedor >= ps) return "acima_piso";
  if (custo > 0 && precoVencedor >= custo) return "entre_custo_piso";
  if (custo > 0) return "abaixo_custo";
  return "";
}
export const CLASSE_ROTULO = { empate: ["Empate / centavos", "tag-amber", "Perdemos no desempate ou por centavos: mecânica de lance, não preço."], acima_piso: ["Acima do piso", "tag-blue", "O vencedor fechou acima do nosso piso: nosso lance parou cedo."], entre_custo_piso: ["Entre custo e piso", "tag-orange", "Vencedor abaixo do nosso piso, mas acima do custo: piso gordo nessa família/região."], abaixo_custo: ["Abaixo do custo", "tag-red", "Vencedor abaixo do nosso custo: problema de compra/produto (ou preço inexequível)."], ganho: ["Ganho", "tag-green", ""], convocado: ["Ganho por convocação", "tag-teal", "Perdemos na disputa, mas fomos convocados como remanescente (vencedor desclassificado/desistente)."] };

// Lance de desempate: evita valor "redondo" (centavos terminados em 0 ou 5), que costuma coincidir com o limite do concorrente,
// descendo até `folga` centavos abaixo do piso arredondado. Com folga 0, devolve o piso arredondado.
export function lanceDesempate(valor, folga = (getCfg().folgaDesempate ?? 3)) {
  const v = Math.ceil(valor * 100 - 1e-9) / 100; if (!(folga > 0)) return +v.toFixed(2);
  for (let k = 0; k <= folga; k++) { const c = Math.round(v * 100 - k); if (c > 0 && c % 5 !== 0) return c / 100; }
  return +v.toFixed(2);
}

// Linhas analíticas: um registro por item disputado com resultado registrado
export function linhasResultados() {
  const out = [];
  store.get("propostas").forEach((p) => {
    const rd = p.resultadoDisputa; if (!rd?.itens?.length) return;
    const l = getLicit(p.licitacaoId), o = getOrgao(l?.orgaoId); const uf = o?.estado || ""; const portal = getPortal(l?.portalId)?.sigla || "";
    const todos = [...(p.itens || []), ...(rd.perdidos || [])];
    rd.itens.forEach((h) => {
      const it = todos.find((x) => String(x.num ?? "") === String(h.num ?? "") && (!h.codigo || x.codigo === h.codigo)) || todos.find((x) => String(x.num ?? "") === String(h.num ?? "")) || {};
      const prod = it.produtoId ? store.find("produtos", it.produtoId) : null;
      const custo = +(h.concorrencia?.custo ?? it.custo ?? prod?.custo) || 0; const ps = +(h.concorrencia?.piso ?? (custo ? piso(custo, getCfg(), uf) : 0)) || 0;
      const c = h.concorrencia || {}; const nosso = +(c.nossoPreco ?? h.precoFinal ?? h.precoInicial) || 0;
      const classeDisputa = h.perdido ? (c.precoVencedor ? classificarPerda({ precoVencedor: c.precoVencedor, nossoPreco: nosso, custo, piso: ps }) : "") : "ganho";
      const classe = h.convocado ? "convocado" : classeDisputa; const perdido = !!h.perdido && !h.convocado;
      const fam = prod?.familia || deduzirFamilia(`${it.nome || ""} ${it.descricao || ""}`) || "";
      const marcaNossa = c.nossaMarca || it.marca || prod?.marca || "";
      out.push({ p, l, o, uf, portal, marcaNossa, data: rd.data || l?.data || "", num: h.num, nome: it.nome || h.codigo || "", codigo: it.codigo || h.codigo || "", qtd: +it.qtd || +c.qtd || 0, custo, piso: ps, precoInicial: +h.precoInicial || 0, nosso, perdido, perdidoDisputa: !!h.perdido, convocado: !!h.convocado, precoConvocacao: +h.precoConvocacao || 0, classeDisputa, classe, familia: fam, familiaNome: FAMILIAS_TEC[fam]?.nome.split(" (")[0] || (fam || "Outros"), ...c,
        difPct: c.precoVencedor && nosso ? (nosso - c.precoVencedor) / c.precoVencedor * 100 : null, valor: (+it.qtd || +c.qtd || 0) * (h.convocado ? (+h.precoConvocacao || nosso) : h.perdido ? (c.precoVencedor || nosso) : nosso) });
    });
  });
  return out;
}

// Agrupa linhas por chave → { chave, itens, ganhos, perdidos, valorGanho, valorPerdido, difMedia, classes{} }
export function agrupar(linhas, chaveFn) {
  const m = new Map();
  linhas.forEach((r) => { const k = chaveFn(r) || "—"; const g = m.get(k) || { chave: k, itens: 0, ganhos: 0, perdidos: 0, valorGanho: 0, valorPerdido: 0, difs: [], classes: {} };
    g.itens++; if (r.perdido) { g.perdidos++; g.valorPerdido += r.valor; if (r.difPct !== null && r.difPct !== undefined) g.difs.push(r.difPct); if (r.classe) g.classes[r.classe] = (g.classes[r.classe] || 0) + 1; } else { g.ganhos++; g.valorGanho += r.valor; }
    m.set(k, g); });
  return [...m.values()].map((g) => ({ ...g, exito: g.itens ? g.ganhos / g.itens * 100 : 0, difMedia: g.difs.length ? g.difs.reduce((a, b) => a + b, 0) / g.difs.length : null })).sort((a, b) => b.itens - a.itens);
}

// ---------- Concorrentes ----------
const LIMIAR_DESISTENCIA = 10000;
const normEmp = (s) => String(s || "").toUpperCase().replace(/[.,\-\/]/g, " ").replace(/\b(LTDA|ME|EPP|EIRELI|S\/?A|SA|EIRELLI|LIMITADA|COMERCIO|COMÉRCIO|COM|DE|DA|DO|E|&)\b/g, " ").replace(/\s+/g, " ").trim();
export const chaveEmpresa = (l) => { const d = String(l.cnpj || "").replace(/\D/g, ""); return d.length >= 8 ? `c:${d.slice(0, 8)}` : `n:${normEmp(l.empresa)}`; };
export const somosNos = (l) => NOS_RE.test(l.empresa || "");

// Uma linha por participação de concorrente em um item (a partir de concorrencia.lances; sem tabela, usa só o vencedor)
// tabela de lances de uma linha (arquivos antigos só têm vencedor + nosso lance)
const tabelaDe = (r) => Array.isArray(r.lances) && r.lances.length ? r.lances
  : r.perdidoDisputa && r.vencedor ? [{ pos: 1, empresa: r.vencedor, cnpj: r.cnpjVencedor || "", valor: r.precoVencedor, marca: r.marcaVencedor || "" }, ...(r.nosso ? [{ pos: r.nossaPosicao || 2, empresa: "RLUX ILUMINACAO LTDA", valor: r.nosso }] : [])]
  : !r.perdidoDisputa && r.nosso ? [{ pos: 1, empresa: "RLUX ILUMINACAO LTDA", valor: r.nosso, marca: r.marcaNossa || "" }] : [];

export function participacoes(linhas = linhasResultados(), { incluirNos = false } = {}) {
  const out = [];
  // mesma empresa com e sem CNPJ em arquivos diferentes → unifica pelo nome normalizado quando algum lance trouxe o CNPJ
  const cnpjPorNome = {}; linhas.forEach((r) => tabelaDe(r).forEach((l) => { const d = String(l.cnpj || "").replace(/\D/g, ""); if (d.length >= 8) cnpjPorNome[normEmp(l.empresa)] = d.slice(0, 8); }));
  const chave = (l) => { if (somosNos(l)) return "nos"; const d = String(l.cnpj || "").replace(/\D/g, ""); if (d.length >= 8) return `c:${d.slice(0, 8)}`; const n = normEmp(l.empresa); return cnpjPorNome[n] ? `c:${cnpjPorNome[n]}` : `n:${n}`; };
  linhas.forEach((r) => {
    const tab = tabelaDe(r);
    const validos = tab.filter((l) => l.valor > 0 && l.valor < LIMIAR_DESISTENCIA);
    const venc = validos[0]; const nos = tab.find(somosNos);
    validos.forEach((l) => { const eu = somosNos(l); if (eu && !incluirNos) return;
      out.push({ r, chave: chave(l), empresa: eu ? "RLUX Iluminação (nós)" : l.empresa, nos: eu, cnpj: eu ? "" : (l.cnpj || ""), porte: l.porte || "", marca: l.marca || "", valor: l.valor, pos: l.pos, nLances: validos.length,
        venceu: venc && l === venc, valorItem: (r.qtd || 0) * l.valor, nossoLance: nos?.valor ?? r.nosso ?? null, nosParticipamos: !!nos || !!r.nosso,
        ganhouDeNos: !eu && !!(venc && l === venc && (nos || r.nosso)), perdeuParaNos: !eu && !r.perdidoDisputa && !!(nos || r.nosso) });
    });
  });
  return out;
}

// Agrega por empresa → ranking
export function rankingConcorrentes(parts = participacoes()) {
  const m = new Map();
  parts.forEach((x) => {
    const g = m.get(x.chave) || { chave: x.chave, nos: !!x.nos, nomes: {}, cnpj: "", porte: "", itens: 0, vitorias: 0, valorGanho: 0, sobreNos: 0, paraNos: 0, confrontos: 0, difs: [], ufs: {}, familias: {}, marcas: {}, produtos: {}, classes: {}, disputas: new Set(), ultima: "", orgaos: {}, posicoes: [], itensVencidos: [] };
    g.nomes[x.empresa] = (g.nomes[x.empresa] || 0) + 1; if (x.cnpj) g.cnpj = x.cnpj; if (x.porte) g.porte = x.porte;
    g.itens++; g.disputas.add(x.r.p.id); g.posicoes.push(x.pos); if ((x.r.data || "") > g.ultima) g.ultima = x.r.data || "";
    if (x.nosParticipamos) { g.confrontos++; if (x.ganhouDeNos) g.sobreNos++; if (x.perdeuParaNos) g.paraNos++; }
    if (x.venceu) { g.vitorias++; g.valorGanho += x.valorItem; const uf = x.r.uf || "—"; g.ufs[uf] = (g.ufs[uf] || 0) + x.valorItem; g.familias[x.r.familiaNome] = (g.familias[x.r.familiaNome] || 0) + x.valorItem;
      if (x.marca) g.marcas[x.marca] = (g.marcas[x.marca] || 0) + 1; const pn = (x.r.nome || "").slice(0, 60) || "—"; g.produtos[pn] = (g.produtos[pn] || 0) + 1; const on = x.r.o?.nome || "—"; g.orgaos[on] = (g.orgaos[on] || 0) + x.valorItem;
      if (x.ganhouDeNos) { if (x.r.classe) g.classes[x.r.classe] = (g.classes[x.r.classe] || 0) + 1; if (x.nossoLance) g.difs.push((x.valor - x.nossoLance) / x.nossoLance * 100); }
      g.itensVencidos.push(x); }
    m.set(x.chave, g);
  });
  return [...m.values()].map((g) => ({ ...g, nome: Object.entries(g.nomes).sort((a, b) => b[1] - a[1])[0][0], disputas: g.disputas.size, posMedia: g.posicoes.length ? g.posicoes.reduce((a, b) => a + b, 0) / g.posicoes.length : null, difMedia: g.difs.length ? g.difs.reduce((a, b) => a + b, 0) / g.difs.length : null,
    itensVencidos: g.itensVencidos.sort((a, b) => String(b.r.data).localeCompare(String(a.r.data))) }));
}

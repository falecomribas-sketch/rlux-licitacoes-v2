// Pré-filtro de candidatos por família (feito em código, antes da IA) e cálculo do custo/piso por item.
import { store } from "./store.js?v=20261113-162935";
import { deduzirFamilia, FAMILIAS_TEC, piso } from "./preco.js?v=20261113-162935";

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const PALAVRAS = ["pilha", "bateria", "lampada", "led", "bulbo", "tubular", "painel", "plafon", "refletor", "luminaria", "disjuntor", "idr", "dps", "contator", "fotocelula", "rele", "acoplador", "plug", "tomada", "barramento", "pente", "fita", "emergencia", "publica", "arandela", "mr16", "gu10", "e27", "g13", "t8", "t5", "9v", "aa", "aaa", "palito", "alcalina", "selada"];

// Candidatos para um item: produtos da mesma família técnica, ordenados por palavras em comum (máx. 40)
export function candidatosPara(item) {
  const fam = deduzirFamilia(item.descricao); const d = norm(item.descricao);
  const termos = PALAVRAS.filter((w) => new RegExp(`(^|[^a-z0-9])${w}([^a-z0-9]|$)`).test(d));
  const nums = (d.match(/\d+(?:[.,]\d+)?\s*(w|k|v|a|ah|ma|mm|cm|m)\b/g) || []).map((x) => x.replace(/\s+/g, ""));
  const pontua = (p) => { const t = norm(`${p.nome} ${p.descricaoTecnica || ""} ${JSON.stringify(p.tecnico || {})}`); let s = 0;
    termos.forEach((w) => { if (t.includes(w)) s += 2; }); nums.forEach((n) => { if (t.replace(/\s+/g, "").includes(n)) s += 3; }); return s; };
  const prods = store.get("produtos").filter((p) => (p.familia || deduzirFamilia(`${p.nome} ${p.descricaoTecnica || ""}`)) === fam);
  return { familia: fam, candidatos: prods.map((p) => ({ p, s: pontua(p) })).sort((a, b) => b.s - a.s).slice(0, 40).map(({ p }) => ({ id: p.id, nome: p.nome, descricaoTecnica: p.descricaoTecnica || "", unidade: p.unidade || "", tecnico: Object.entries(p.tecnico || {}).map(([k, v]) => `${k}=${v}`).join(", "), custo: +p.custo || 0, preferido: !!p.preferido })) };
}
export const nomeFamilia = (f) => FAMILIAS_TEC[f]?.nome.split(" (")[0] || f;

// Último preço praticado para o produto em propostas vencidas (qualquer órgão) e no órgão informado
export function historicoProduto(produtoId, orgaoNome) {
  const venc = ["Vencida", "Enviei Docs", "Faturado Parcial", "Faturado Total"]; let geral = null, orgao = null;
  store.get("propostas").filter((p) => venc.includes(p.status)).sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || "")).forEach((p) => {
    const it = (p.itens || []).find((i) => i.produtoId === produtoId); if (!it) return;
    const l = store.find("licitacoes", p.licitacaoId) || {}; const o = store.find("orgaos", l.orgaoId) || {};
    const reg = { preco: it.preco, data: p.criadoEm?.slice(0, 10), licit: l.numero, orgao: o.nome };
    if (!geral) geral = reg; if (!orgao && orgaoNome && norm(o.nome).includes(norm(orgaoNome).slice(0, 18))) orgao = reg; });
  return { geral, orgao };
}
export const pisoProduto = (p) => piso(p?.custo || 0);

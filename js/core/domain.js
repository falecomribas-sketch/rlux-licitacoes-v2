// Regras de negócio compartilhadas entre módulos.
// Portadas 1:1 da versão atual — os números têm que bater durante a convivência.
import { store } from "./store.js?v=20261113-164426";

// ---------- lookups ----------
export const getOrgao = (id) => store.find("orgaos", id) || {};
export const getLicit = (id) => store.find("licitacoes", id) || {};
export const getPortal = (id) => store.find("portais", id) || {};
export const getProp = (id) => store.find("propostas", id);
export const getCat = (id) => store.find("categorias", id) || {};
export const getAta = (id) => store.find("atas", id);

// Proposta -> licitação -> órgão (a cadeia que quase toda tela precisa)
export function propCtx(p) {
  const l = getLicit(p?.licitacaoId);
  const o = getOrgao(l?.orgaoId);
  const portal = getPortal(l?.portalId);
  return { p, l, o, portal };
}

// ---------- propostas ----------
export const STATUS_VENCIDO = ["Vencida", "Enviei Docs", "Faturado Parcial", "Faturado Total"];
export const isVencido = (p) => STATUS_VENCIDO.includes(p?.status);

// Proposta-espelho: criada por renovação de ATA (2ª vigência em diante).
// Fica oculta das listas de propostas por padrão.
export const isEspelho = (p) => !!(p && p.espelhoDeAtaId);

export const propTotal = (p) => (p?.itens || []).reduce((s, i) => s + (i.total || 0), 0);

// (receita/custo - 1) * 100; null se não houver custo
export function propMargem(p) {
  let venda = 0, custo = 0;
  (p?.itens || []).forEach((i) => { const q = i.qtd || 0; venda += q * (i.preco || 0); custo += q * (i.custo || 0); });
  if (custo <= 0) return null;
  return (venda / custo - 1) * 100;
}

// valorRecebido = valor financeiro do empenho (nome herdado; ver comentário no legado)
export const propEmpenhado = (propId) =>
  store.get("empenhos").filter((e) => e.propostaId === propId)
    .reduce((s, e) => s + (e.valorRecebido || e.valorEmpenho || 0), 0);

export const propSaldo = (p) => propTotal(p) - propEmpenhado(p?.id);

export const ataDaProposta = (propId) => store.get("atas").find((a) => a.propostaId === propId) || null;

// ---------- ATAs ----------
export const ataGeracao = (a) => a?.geracao || 1;
export const ataFoiRenovada = (ata) => store.get("atas").some((x) => x.ataOrigemId === ata.id);

export function ataValores(a) {
  const p = getProp(a.propostaId);
  const valor = propTotal(p);
  const empenhado = store.get("empenhos").filter((e) => e.propostaId === a.propostaId)
    .reduce((s, e) => s + (e.valorRecebido || 0), 0);
  return { p, valor, empenhado, saldo: valor - empenhado };
}

// ---------- adesões ----------
export const adesaoTotal = (a) => (a?.itens || []).reduce((s, it) => s + (it.total || 0), 0);
export const adesaoEmpenhado = (adesaoId) =>
  store.get("empenhos").filter((e) => e.adesaoId === adesaoId)
    .reduce((s, e) => s + (e.valorRecebido || e.valorEmpenho || 0), 0);
export const adesaoSaldo = (a) => adesaoTotal(a) - adesaoEmpenhado(a.id);

// ---------- saldo por item (régua / e-mails) ----------
export function calcSaldoItens(p) {
  const emps = store.get("empenhos").filter((e) => e.propostaId === p.id);
  return (p.itens || []).map((item, idx) => {
    const emp = emps.reduce((s, e) => s + ((e.itensRecebidos || [])[idx] || 0), 0);
    const saldo = Math.max(0, (item.qtd || 0) - emp);
    return { ...item, qtdEmpenhada: emp, saldo, valorSaldo: saldo * (item.preco || 0) };
  }).filter((i) => i.saldo > 0);
}

// Saldo por item só é confiável se TODOS os empenhos trazem itensRecebidos.
export function propSaldoDetalhado(p) {
  const emps = store.get("empenhos").filter((e) => e.propostaId === p.id);
  const detalhado = emps.every((e) => Array.isArray(e.itensRecebidos) && e.itensRecebidos.length > 0);
  if (!detalhado) return { detalhado: false, itens: [], valor: propSaldo(p) };
  const itens = calcSaldoItens(p);
  return { detalhado: true, itens, valor: itens.reduce((s, i) => s + i.valorSaldo, 0) };
}

// ---------- status visual ----------
export const STATUS_CLASS = {
  "Vencida": "tag-green", "Perdida": "tag-red", "Faturado Total": "tag-teal",
  "Faturado Parcial": "tag-orange", "Enviei Docs": "tag-purple",
  "Ag. Solic. Docs": "tag-amber", "Em Andamento": "tag-blue",
};

// Precificação e famílias técnicas dos produtos.
// Configuração em Firestore: config/precificacao { simples, fretePct, freteMin, lucroMin, descontoRef, custoValidadeDias }
import { store } from "./store.js?v=20261113-162740";
import { hojeIso } from "./utils.js?v=20261113-162740";

export const CFG_PADRAO = { simples: 11.35, fretePct: 6, freteMin: 50, lucroMin: 7, descontoRef: 0, custoValidadeDias: 90, lucroMinReq: 7, altaCustoReq: 10 };
let cfg = { ...CFG_PADRAO }; let iniciado = false; const ouvintes = new Set();
export function iniciarPreco() { if (iniciado) return; iniciado = true; store.watchObj("config", "precificacao", (d) => { cfg = { ...CFG_PADRAO, ...(d || {}) }; ouvintes.forEach((f) => f(cfg)); }); }
export const getCfg = () => cfg;
export function onCfg(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }
export async function salvarCfg(novo) { cfg = { ...CFG_PADRAO, ...novo }; await store.setObj("config", "precificacao", { ...cfg, _atualizado: new Date().toISOString() }); }

// Piso de venda: custo ÷ (1 − simples − frete − lucro). Os percentuais incidem sobre o preço de venda.
export function divisor(c = cfg) { return Math.max(0.05, 1 - (c.simples + c.fretePct + c.lucroMin) / 100); }
export const piso = (custo, c = cfg) => (custo || 0) / divisor(c);
// Piso ajustado ao frete mínimo: se 6% do total do pedido < frete mínimo, a diferença é rateada
export function pisoComFreteMin(custo, totalPedido, c = cfg) {
  const base = piso(custo, c); if (!totalPedido || totalPedido <= 0) return base;
  const freteCalc = totalPedido * c.fretePct / 100; if (freteCalc >= c.freteMin) return base;
  const fator = (c.freteMin - freteCalc) / totalPedido; // fração extra sobre o preço
  return (custo || 0) / Math.max(0.05, divisor(c) - fator);
}
export const pedidoMinimoSemAjuste = (c = cfg) => c.fretePct > 0 ? c.freteMin / (c.fretePct / 100) : 0;

// Custo vencido?
export function diasCusto(p) { if (!p?.custoData) return null; return Math.floor((new Date(hojeIso() + "T00:00:00") - new Date(String(p.custoData).slice(0, 10) + "T00:00:00")) / 864e5); }
export function custoVencido(p, c = cfg) { const d = diasCusto(p); return d === null || d > c.custoValidadeDias; }

// Famílias técnicas: campos-chave usados para filtrar/excluir antes da IA
export const FAMILIAS_TEC = {
  iluminacao: { nome: "Iluminação (lâmpadas, painéis, refletores, luminárias)", campos: [["potenciaW", "Potência (W)", "num"], ["corK", "Temperatura de cor (K)", "num"], ["base", "Base / soquete", "txt"], ["ip", "Grau IP", "txt"], ["tensaoV", "Tensão (V / bivolt)", "txt"], ["lumens", "Fluxo luminoso (lm)", "num"], ["dimensao", "Dimensão / comprimento", "txt"], ["certificacao", "Certificação (Inmetro/Procel)", "txt"], ["garantia", "Garantia", "txt"]] },
  protecao: { nome: "Proteção (disjuntores, DR/IDR, DPS)", campos: [["correnteA", "Corrente nominal (A)", "num"], ["polos", "Polos", "txt"], ["curva", "Curva", "txt"], ["kA", "Capacidade de interrupção (kA)", "txt"], ["tensaoV", "Tensão (V)", "txt"], ["montagem", "Montagem (DIN/caixa moldada)", "txt"], ["certificacao", "Norma / certificação", "txt"]] },
  comando: { nome: "Comando (contatores, relés)", campos: [["correnteA", "Corrente nominal (A)", "num"], ["bobinaV", "Tensão da bobina (V)", "txt"], ["polos", "Polos / contatos principais", "txt"], ["classe", "Classe (AC-3/AC-4)", "txt"], ["auxiliar", "Contato auxiliar", "txt"], ["certificacao", "Norma", "txt"]] },
  conexao: { nome: "Conexão industrial (plugs, tomadas, acopladores)", campos: [["correnteA", "Corrente (A)", "num"], ["polos", "Polos (2P+T, 3P+T…)", "txt"], ["tensaoV", "Tensão (V)", "txt"], ["ip", "Grau IP", "txt"], ["posicaoH", "Posição horária", "txt"]] },
  barramento: { nome: "Barramentos e acessórios de quadro", campos: [["tipo", "Tipo (neutro, terra, pente…)", "txt"], ["pinos", "Pinos / vias", "num"], ["correnteA", "Corrente (A)", "num"], ["montagem", "Montagem", "txt"]] },
  pilhas: { nome: "Pilhas e baterias", campos: [["formato", "Formato (AA, AAA, 9V, D…)", "txt"], ["tensaoV", "Tensão (V)", "txt"], ["ah", "Capacidade (Ah)", "num"], ["embalagem", "Embalagem (un./blister/cartela)", "txt"], ["quimica", "Química (alcalina, selada…)", "txt"]] },
  outros: { nome: "Outros (fita isolante, acessórios)", campos: [["tensaoV", "Tensão (V)", "txt"], ["dimensao", "Dimensão / metragem", "txt"]] },
};
// Deduz a família técnica pelo nome da categoria ou do produto
export function deduzirFamilia(txt) {
  const t = String(txt || "").toLowerCase();
  const ilum = /l[aâ]mpada|\bled\b|bulbo|tubular|painel|plafon|refletor|lumin[aá]ria|emerg[eê]ncia|arandela|mr16|fotoc[eé]lula|bocal|soquete/;
  if (ilum.test(t.slice(0, 14))) return "iluminacao"; // o que o item É vem no começo da descrição
  if (/pilha|bateria/.test(t)) return "pilhas";
  if (/disjuntor|\bidr\b|\bdr\b|\bdps\b|surto|caixa moldada/.test(t)) return "protecao";
  if (/contator|rel[eé] t[eé]rmico|comando/.test(t)) return "comando";
  if (/acoplador|plug|tomada|conector industrial|iec ?60309|steck/.test(t)) return "conexao";
  if (/barramento|pente|trilho|barra de/.test(t)) return "barramento";
  if (/l[aâ]mpada|led|bulbo|tubular|painel|plafon|refletor|lumin[aá]ria|emerg[eê]ncia|p[uú]blica|arandela|mr16|fotoc[eé]lula|bocal|soquete/.test(t)) return "iluminacao";
  return "outros";
}

// Produtos por frequência em propostas vencidas nos últimos N anos (prioridade de cadastro)
export function frequenciaVendas(anos = 2) {
  const lim = new Date(); lim.setFullYear(lim.getFullYear() - anos); const m = {};
  store.get("propostas").forEach((p) => { if (!["Vencida", "Enviei Docs", "Faturado Parcial", "Faturado Total"].includes(p.status)) return; if (p.criadoEm && new Date(p.criadoEm) < lim) return; (p.itens || []).forEach((i) => { if (i.produtoId) m[i.produtoId] = (m[i.produtoId] || 0) + 1; }); });
  return m;
}

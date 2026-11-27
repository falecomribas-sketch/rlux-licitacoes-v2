// Balanço patrimonial da RLUX (último exercício) — alimenta as declarações de índices econômicos / capacidade financeira.
// Configuração em Firestore: config/balanco { exercicio, encerramento, registro, ativoCirculante, realizavelLP, ativoTotal,
//   passivoCirculante, passivoNaoCirculante, patrimonioLiquido, capitalSocial, contadorNome, contadorCRC, contadorCPF }
import { store } from "./store.js?v=20261127-134052";

export const BALANCO_PADRAO = { exercicio: "", encerramento: "", registro: "", ativoCirculante: 0, realizavelLP: 0, ativoTotal: 0, passivoCirculante: 0, passivoNaoCirculante: 0, patrimonioLiquido: 0, capitalSocial: 0, contadorNome: "", contadorCRC: "", contadorCPF: "" };
let bal = { ...BALANCO_PADRAO }; let iniciado = false; const ouvintes = new Set();
let carregado; let resolver;
export function iniciarBalanco() { if (iniciado) return carregado; iniciado = true; carregado = new Promise((r) => { resolver = r; }); store.watchObj("config", "balanco", (d) => { bal = { ...BALANCO_PADRAO, ...(d || {}) }; ouvintes.forEach((f) => f(bal)); resolver?.(bal); resolver = null; }); return carregado; }
// Para quem precisa do balanço já carregado (PDF): inicia o watcher se preciso e espera a primeira leitura (no máximo 3 s).
export async function balancoPronto() { await Promise.race([iniciarBalanco(), new Promise((r) => setTimeout(r, 3000))]); return bal; }
export const getBalanco = () => bal;
export function onBalanco(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }
export async function salvarBalanco(novo) { bal = { ...BALANCO_PADRAO, ...novo }; await store.setObj("config", "balanco", { ...bal, _atualizado: new Date().toISOString() }); }
export const temBalanco = (b = bal) => !!(b && b.exercicio && +b.ativoTotal > 0);

const n = (v) => +v || 0;
const div = (a, b) => (b > 0 ? a / b : null); // sem passivo exigível, o índice tende ao infinito: devolve null e tratamos no texto
// Fórmulas usuais dos editais (IN SEGES 3/2018, art. 69 / Lei 14.133 art. 69): LG, SG, LC e grau de endividamento.
export function indices(b = bal) {
  const AC = n(b.ativoCirculante), RLP = n(b.realizavelLP), AT = n(b.ativoTotal), PC = n(b.passivoCirculante), PNC = n(b.passivoNaoCirculante);
  const PL = n(b.patrimonioLiquido) || Math.max(0, AT - PC - PNC);
  return { AC, RLP, AT, PC, PNC, PL, capitalSocial: n(b.capitalSocial), LG: div(AC + RLP, PC + PNC), SG: div(AT, PC + PNC), LC: div(AC, PC), GE: AT > 0 ? (PC + PNC) / AT : null };
}
export const fmtIdx = (v) => (v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Texto para a IA (entra em DADOS DA EMPRESA quando o balanço está cadastrado).
export function dadosBalancoIA(b = bal) {
  if (!temBalanco(b)) return {};
  const i = indices(b); const semExig = i.PC + i.PNC <= 0;
  const idx = (v) => (v == null ? "não se aplica (sem passivo exigível)" : fmtIdx(v));
  return {
    "Balanço patrimonial (exercício de referência)": `${b.exercicio}${b.encerramento ? `, encerrado em ${b.encerramento}` : ""}${b.registro ? ` — ${b.registro}` : ""}`,
    "Contas do balanço (R$)": `Ativo Circulante ${brl(i.AC)}; Realizável a Longo Prazo ${brl(i.RLP)}; Ativo Total ${brl(i.AT)}; Passivo Circulante ${brl(i.PC)}; Passivo Não Circulante ${brl(i.PNC)}; Patrimônio Líquido ${brl(i.PL)}${i.capitalSocial ? `; Capital Social ${brl(i.capitalSocial)}` : ""}`,
    "Índices calculados": `LG = (AC + RLP) ÷ (PC + PNC) = ${idx(i.LG)}; SG = AT ÷ (PC + PNC) = ${idx(i.SG)}; LC = AC ÷ PC = ${idx(i.LC)}; Grau de endividamento = (PC + PNC) ÷ AT = ${idx(i.GE)}${semExig ? ". Sem passivo exigível, os índices de liquidez/solvência são ilimitados: declare 'superiores a 1'." : ""}`,
    "Como usar os índices": "Em declarações de índices econômicos/capacidade financeira, preencha os valores acima (não deixe [PREENCHER]); se o edital usar fórmula diferente, recalcule a partir das contas informadas e cite a fórmula do edital. Se algum índice exigido ficar abaixo do mínimo, informe o Patrimônio Líquido e o Capital Social acima.",
    ...(b.contadorNome ? { "Contador responsável": `${b.contadorNome}${b.contadorCRC ? `, CRC ${b.contadorCRC}` : ""}${b.contadorCPF ? `, CPF ${b.contadorCPF}` : ""}` } : {}),
  };
}

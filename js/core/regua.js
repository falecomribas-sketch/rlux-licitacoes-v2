// Régua de relacionamento: quem precisa receber e-mail (acompanhamento mensal,
// renovação D-60/D-30, agradecimento) e os textos dos e-mails.
// Portado do legado. Estado em Firestore: config/reguaEnvios (último carimbo por
// tipo) e config/reguaHist (histórico acumulado). Sem localStorage.
import { store } from "./store.js";
import { fmt, fmtD, hojeIso, diasAte } from "./utils.js";
import { getLicit, getOrgao, getProp, getAta, isVencido, propTotal, propEmpenhado, propSaldo, propSaldoDetalhado, adesaoSaldo, ataFoiRenovada } from "./domain.js";
import { EMPRESA } from "./pdf.js";
import { toast } from "./ui.js";

// ---------- estado ----------
let envios = {}, hist = {}; let carregado = false;
const ouvintes = new Set();
export function iniciarRegua() {
  if (carregado) return; carregado = true;
  store.watchObj("config", "reguaEnvios", (d) => { const { _atualizado, ...r } = d || {}; envios = r; ouvintes.forEach((f) => f()); });
  store.watchObj("config", "reguaHist", (d) => { const { _atualizado, ...r } = d || {}; hist = r; ouvintes.forEach((f) => f()); });
}
export function onRegua(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }
export const getEnvios = () => envios;

const chave = (tipo, refId, origem) => `${origem === "adesao" ? "ad_" : ""}${tipo === "agradecimento" ? "agrad" : tipo === "renovacao60" ? "renov60" : tipo === "renovacao30" ? "renov30" : "ultimo"}_${refId}`;

export async function registrarEnvio(refId, tipo, origem = "proposta") {
  const agora = new Date().toISOString(); const pre = origem === "adesao" ? "ad_" : "";
  const novo = { ...envios, [chave(tipo, refId, origem)]: agora, [`${pre}ultimo_${refId}`]: agora }; // qualquer e-mail conta como último contato
  const k = pre + refId; const h = { ...hist, [k]: [...(Array.isArray(hist[k]) ? hist[k] : []), { data: agora, tipo, origem }] };
  envios = novo; hist = h; ouvintes.forEach((f) => f());
  await store.setObj("config", "reguaEnvios", { ...novo, _atualizado: agora });
  await store.setObj("config", "reguaHist", { ...h, _atualizado: agora });
}

// Envios de um registro (histórico; se vazio, reconstrói dos carimbos antigos)
export function enviosDe(refId, origem = "proposta") {
  const pre = origem === "adesao" ? "ad_" : ""; const log = hist[pre + refId];
  if (Array.isArray(log) && log.length) return log.slice().sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const vistos = new Set(), out = [];
  [["agradecimento", `${pre}agrad_${refId}`], ["renovacao60", `${pre}renov60_${refId}`], ["renovacao30", `${pre}renov30_${refId}`], ["acompanhamento", `${pre}ultimo_${refId}`]].forEach(([tipo, k]) => { const v = envios[k]; if (!v || vistos.has(v)) return; vistos.add(v); out.push({ data: v, tipo, origem, retro: true }); });
  return out.sort((a, b) => String(a.data).localeCompare(String(b.data)));
}
const isoDe = (v) => { try { const d = new Date(v); if (isNaN(d)) return null; return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; } catch { return null; } };
const addDias = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return isoDe(d); };
const diff = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);
export const INTERVALO = 30;
export const TIPO_ROTULO = { acompanhamento: "Acompanhamento", renovacao60: "Renovação D-60", renovacao30: "Renovação D-30", agradecimento: "Agradecimento" };

// ---------- saldos por item (adesões) ----------
export function calcSaldoItensAdesao(a) {
  const emps = store.get("empenhos").filter((e) => e.adesaoId === a.id);
  return (a.itens || []).map((it, idx) => { const f = emps.reduce((s, e) => s + ((e.itensRecebidos || [])[idx] || 0), 0); const saldo = Math.max(0, (it.qtdAdesao || 0) - f);
    return { ...it, qtd: it.qtdAdesao || 0, preco: it.precoUnit || 0, qtdEmpenhada: f, saldo, valorSaldo: saldo * (it.precoUnit || 0) }; }).filter((i) => i.saldo > 0);
}
export function adesaoSaldoDetalhado(a) {
  const emps = store.get("empenhos").filter((e) => e.adesaoId === a.id);
  const det = emps.every((e) => Array.isArray(e.itensRecebidos) && e.itensRecebidos.length > 0);
  if (!det) return { detalhado: false, itens: [], valor: adesaoSaldo(a) };
  const itens = calcSaldoItensAdesao(a); return { detalhado: true, itens, valor: itens.reduce((s, i) => s + i.valorSaldo, 0) };
}
const itensFornecidos = (p) => { const emps = store.get("empenhos").filter((e) => e.propostaId === p.id); return (p.itens || []).map((it, idx) => { const f = emps.reduce((s, e) => s + ((e.itensRecebidos || [])[idx] || 0), 0); return { ...it, qtdFornecida: f, valorFornecido: f * (it.preco || 0) }; }).filter((i) => i.qtdFornecida > 0); };
const itensFornecidosAdesao = (a) => { const emps = store.get("empenhos").filter((e) => e.adesaoId === a.id); return (a.itens || []).map((it, idx) => { const f = emps.reduce((s, e) => s + ((e.itensRecebidos || [])[idx] || 0), 0); return { ...it, qtdFornecida: f, valorFornecido: f * (it.precoUnit || 0) }; }).filter((i) => i.qtdFornecida > 0); };

// ---------- universo da régua ----------
// Cada linha: { origem, refId, titulo, subtitulo, dataRef, orgao, orgaoNome, ataNum, vencIso,
//   saldo, total, houveEmpenho, statusManual, envios, qtd, ultimo, diasVenc, proximo, tipoProx, encerrada, motivo, retro }
export function linhasRegua() {
  const hoje = hojeIso(); const atas = store.get("atas"), emps = store.get("empenhos"); const out = [];
  store.get("propostas").filter((p) => isVencido(p)).forEach((p) => {
    const ata = atas.find((a) => a.propostaId === p.id); if (ata && ataFoiRenovada(ata)) return; // régua passa para a nova vigência
    const l = getLicit(p.licitacaoId), o = getOrgao(l.orgaoId);
    out.push(montar({ origem: "proposta", refId: p.id, p, ata, l, o, titulo: l.numero || "—", subtitulo: l.tipo || "", dataRef: l.data || null, orgao: o, orgaoNome: null, ataNum: ata?.numero || null, vencIso: ata?.vencimento || null, saldo: propSaldoDetalhado(p).valor, total: propTotal(p), houveEmpenho: emps.some((e) => e.propostaId === p.id), statusManual: p.status, hoje }));
  });
  store.get("adesoes").filter((a) => ["Aprovada", "Em Análise"].includes(a.status)).forEach((a) => {
    const ata = getAta(a.ataId); const p = ata ? getProp(ata.propostaId) : null; const l = p ? getLicit(p.licitacaoId) : null;
    out.push(montar({ origem: "adesao", refId: a.id, a, ata, l, o: getOrgao(a.orgaoId), titulo: a.numero || "Adesão", subtitulo: l?.numero ? `ATA ${l.numero}` : "Adesão", dataRef: a.solicitacao || null, orgao: getOrgao(a.orgaoId), orgaoNome: a.orgaoAderente || null, ataNum: ata?.numero || null, vencIso: a.vencimento || null, saldo: adesaoSaldoDetalhado(a).valor, total: (a.itens || []).reduce((s, it) => s + (it.total || 0), 0), houveEmpenho: emps.some((e) => e.adesaoId === a.id), statusManual: a.status, hoje }));
  });
  return out;
}
function montar(c) {
  const pre = c.origem === "adesao" ? "ad_" : ""; const env = enviosDe(c.refId, c.origem); const ultimo = env.length ? isoDe(env[env.length - 1].data) : null;
  const diasVenc = c.vencIso ? diff(c.hoje, c.vencIso) : null; const concluido = c.houveEmpenho && c.total > 0 && (c.saldo <= 0 || c.statusManual === "Faturado Total");
  let proximo = null, tipoProx = "acompanhamento", encerrada = false, motivo = "";
  if (concluido) { if (!envios[`${pre}agrad_${c.refId}`]) { proximo = c.hoje; tipoProx = "agradecimento"; } else { encerrada = true; motivo = "Agradecimento enviado"; } }
  else if (c.saldo <= 0) { encerrada = true; motivo = "Sem saldo"; }
  else if (diasVenc !== null && diasVenc < 0) { encerrada = true; motivo = "Vigência encerrada"; }
  else if (c.origem === "proposta" && diasVenc !== null && diasVenc <= 60 && diasVenc > 30 && !envios[`renov60_${c.refId}`]) { proximo = c.hoje; tipoProx = "renovacao60"; }
  else if (c.origem === "proposta" && diasVenc !== null && diasVenc <= 30 && diasVenc >= 0 && !envios[`renov30_${c.refId}`]) { proximo = c.hoje; tipoProx = "renovacao30"; }
  else { proximo = ultimo ? addDias(ultimo, INTERVALO) : c.hoje; }
  return { ...c, envios: env, qtd: env.length, ultimo, diasVenc, proximo, tipoProx, encerrada, motivo, retro: env.some((e) => e.retro), ultimos90: diasVenc !== null && diasVenc >= 0 && diasVenc <= 90 };
}
export function situacaoRegua(li) {
  if (li.encerrada) return { txt: li.motivo || "Encerrada", cls: "tag-gray", ord: 5 };
  const d = diff(hojeIso(), li.proximo); if (d === null || isNaN(d)) return { txt: "Sem data", cls: "tag-gray", ord: 4 };
  if (d < 0) return { txt: `Atrasado ${-d}d`, cls: "tag-red", ord: 0 };
  if (d === 0) return { txt: li.qtd ? "Enviar hoje" : "1º contato", cls: "tag-blue", ord: 1 };
  if (d <= 7) return { txt: `Em ${d}d`, cls: "tag-amber", ord: 2 };
  return { txt: `Em ${d}d`, cls: "tag-teal", ord: 3 };
}
// Pendentes para hoje (o que o legado mostrava no dashboard)
export const pendentesHoje = () => linhasRegua().filter((li) => !li.encerrada && diff(hojeIso(), li.proximo) <= 0);

// ---------- e-mails ----------
const SIGLAS = new Set(["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO", "TRT", "TRE", "TRF", "TJ", "TCE", "TCU", "TCM", "MPF", "MPT", "MPE", "MPU", "DPU", "AGU", "INSS", "IBGE", "IBAMA", "ICMBIO", "IF", "IFSC", "IFPR", "IFSP", "IFRS", "IFMG", "UFSC", "UFPR", "UFRJ", "UFMG", "UFRGS", "UNB", "USP", "SESC", "SENAC", "SENAI", "SESI", "SEBRAE", "PM", "PC", "PF", "PRF", "CBM", "CBMDF", "PMDF", "SUS", "UPA", "EB", "FAB", "CMB", "HU", "HC", "SAAE", "DER", "DNIT", "ANATEL", "ANEEL", "CNPQ", "EMBRAPA", "FIOCRUZ"]);
const MINUSC = ["de", "da", "do", "das", "dos", "e", "em", "por", "com", "para", "a", "o", "na", "no"];
export const ASSINATURA = `Atenciosamente,\n${EMPRESA.representante}\nRLUX Iluminação Ltda.\n${EMPRESA.tel}\n${EMPRESA.email} | www.rlux.com.br`;
const CTA = "Para adquirir, basta responder este e-mail com a Nota de Empenho ou Ordem de Compra. A entrega é feita no prazo previsto no edital.\n\nSe precisar de ficha técnica ou documentação de habilitação, é só pedir.";
function nomeOrgao(nome) { const n = String(nome || "").trim().replace(/^\d{4,}\s*[-–—]\s*/, ""); if (!n) return "—";
  return n.split(/\s+/).map((w, i) => { const limpo = w.toUpperCase().replace(/[^A-ZÀ-Ü0-9]/g, ""); if (SIGLAS.has(limpo)) return w.toUpperCase(); if (/^[A-ZÀ-Ü]{2,5}$/.test(w) && !/[AEIOUÁÉÍÓÚÂÊÔÃÕ]/.test(w)) return w; const lw = w.toLowerCase(); if (i > 0 && MINUSC.includes(lw)) return lw; return lw.charAt(0).toUpperCase() + lw.slice(1); }).join(" "); }
const uasgDe = (uasg, nome) => uasg ? String(uasg).trim() : (String(nome || "").match(/^(\d{4,})\s*[-–—]/)?.[1] || "");
const cabecalho = (nome, uasg) => { const u = uasgDe(uasg, nome); return `${nomeOrgao(nome)}${u ? ` (UASG ${u})` : ""}\n\nPrezados(as),`; };
const refLicit = (l) => { const tipo = (l?.tipo || "Pregão").trim(); return l?.numero ? `${tipo} nº ${l.numero}` : tipo; };
function ref(l, ata) { const lic = refLicit(l); const n = String(ata?.numero || "").replace(/^ata\s*(n[º°.]?\s*)?[-–:]?\s*/i, "").trim(); if (n) return { txt: `ATA de Registro de Preços nº ${n} (${lic})`, art: "a", curto: `ATA ${n} – ${lic}` }; const fem = /^(dispensa|tomada|concorr|inexigib|cota)/i.test((l?.tipo || "").trim()); return { txt: lic, art: fem ? "a" : "o", curto: lic }; }
const em = (n) => n <= 0 ? "hoje" : n === 1 ? "em 1 dia" : `em ${n} dias`;
const faltam = (n) => n <= 0 ? "o encerramento é hoje" : n === 1 ? "falta 1 dia para o encerramento" : `faltam ${n} dias para o encerramento`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const suj = (r) => `${r.art} ${r.txt}`, de = (r) => `${r.art === "a" ? "da" : "do"} ${r.txt}`, ao = (r) => `${r.art === "a" ? "à" : "ao"} ${r.txt}`;
function nomeItem(nome) { const s = String(nome || "").replace(/\s+/g, " ").trim(); if (!s) return "—";
  const corte = s.search(/\s(?:Modelo|Tens[ãa]o|Pot[êe]ncia|Tipo|Formato|Fluxo|Abertura|Comprimento|Equival[êe]ncia|Cor|Temperatura|Material|Base|Bulbo|Dimens|Grau|Vida|Corrente|Frequ[êe]ncia|Fator|[ÍI]ndice|Largura|Altura|Di[âa]metro|Peso|Acabamento|Garantia|Marca|Refer[êe]ncia)\b[^:]{0,25}:/i);
  const base = corte > 2 ? s.slice(0, corte) : (s.includes(":") ? s.slice(0, s.indexOf(":")).split(" ").slice(0, -1).join(" ") || s : s);
  const pega = (re) => (s.match(re)?.[1] || "").trim();
  const formato = pega(/Formato:\s*(.+?)(?=\s+[A-ZÀ-Üa-zà-ü][\wÀ-ü]*:|$)/i), pot = pega(/Pot[êe]ncia(?:\s+Nominal)?:\s*([\d.,]+\s*W)\b/i).replace(/\s+/g, ""), comp = pega(/Comprimento:\s*([\d.,]+\s*MM)\b/i).replace(/\s+/g, "").toLowerCase();
  const partes = [base]; [formato, pot, comp].forEach((x) => { if (x && !base.toLowerCase().includes(x.toLowerCase())) partes.push(x); });
  let out = partes.join(" "); if (out.length > 70) out = out.slice(0, 67).trim() + "..."; return out; }
const linhaItem = (num, nome, codigo, qtd, preco) => `• Item ${num} – ${nomeItem(nome)}${codigo ? ` (${codigo})` : ""}\n  ${Number(qtd || 0).toLocaleString("pt-BR")} un. × ${fmt(preco || 0)} = ${fmt((qtd || 0) * (preco || 0))}`;

export function montarEmail(refId, origem = "proposta", ultimos90 = false, tipo = "acompanhamento") {
  if (origem === "adesao") return montarEmailAdesao(refId, ultimos90, tipo);
  const p = getProp(refId); if (!p) return null;
  const l = getLicit(p.licitacaoId), o = getOrgao(l.orgaoId), ata = store.get("atas").find((a) => a.propostaId === refId);
  const r = ref(l, ata), cab = cabecalho(o.nome, o.uasg), vencStr = ata?.vencimento ? fmtD(ata.vencimento) : null, diasVenc = ata?.vencimento ? diasAte(ata.vencimento) : null;
  const para = (o.contatos || []).filter((c) => c.email).map((c) => c.email).join(";");
  if (tipo === "agradecimento") {
    const itens = itensFornecidos(p); const tot = itens.length ? itens.reduce((s, i) => s + i.valorFornecido, 0) : propEmpenhado(p.id);
    const lista = itens.map((i, idx) => linhaItem(i.num || idx + 1, i.nome, i.codigo, i.qtdFornecida, i.preco)).join("\n\n");
    return { para, assunto: `Agradecimento pelo fornecimento – ${r.curto}`, corpo: `${cab}\n\nAgradecemos a confiança na RLUX Iluminação. Concluímos o fornecimento referente ${ao(r)}${itens.length ? ":" : "."}\n${itens.length ? `\n${lista}\n` : ""}${tot > 0 ? `\nTotal fornecido: ${fmt(tot)}\n` : ""}\nFoi um prazer atendê-los. Seguimos à disposição para novas contratações e para qualquer suporte sobre os produtos entregues.\n\n${ASSINATURA}` };
  }
  if (tipo === "renovacao60" || tipo === "renovacao30") {
    const urgente = tipo === "renovacao30"; const itens = p.itens || []; const lista = itens.map((i, idx) => linhaItem(i.num || idx + 1, i.nome, i.codigo, i.qtd, i.preco)).join("\n\n"); const saldo = propSaldoDetalhado(p).valor;
    return { para, assunto: `${urgente ? "[Atenção] " : ""}Vigência encerra ${em(diasVenc)} – ${r.curto}`, corpo: `${cab}\n\n${cap(suj(r))} tem vigência até ${vencStr || "—"}: ${faltam(diasVenc)}.\n\nItens registrados:\n\n${lista}\n${saldo > 0 ? `\nSaldo ainda disponível para aquisição: ${fmt(saldo)}\n` : ""}\nCaso haja interesse em manter o fornecimento, podemos tratar da prorrogação da ATA, nos termos do art. 84 da Lei nº 14.133/2021, com antecedência suficiente para evitar interrupção.\n\nSe o órgão já tiver novo processo em andamento ou não houver interesse, basta desconsiderar esta mensagem.\n\n${ASSINATURA}` };
  }
  const sd = propSaldoDetalhado(p); const lista = sd.itens.map((i, idx) => linhaItem(i.num || idx + 1, i.nome, i.codigo, i.saldo, i.preco)).join("\n\n"); const bloco = sd.itens.length ? `\n${lista}\n` : "";
  if (ultimos90 && diasVenc !== null) return { para, assunto: `Vigência encerra ${em(diasVenc)} – ${r.curto} – saldo de ${fmt(sd.valor)}`, corpo: `${cab}\n\nA vigência ${de(r)} encerra ${em(diasVenc)} (${vencStr}). Até essa data, ainda é possível adquirir pelo preço registrado${sd.itens.length ? ":" : "."}\n${bloco}\nSaldo total: ${fmt(sd.valor)}\n\nApós o encerramento, novas aquisições exigirão outro processo licitatório.\n\n${CTA}\n\n${ASSINATURA}` };
  return { para, assunto: `Saldo disponível – ${r.curto} – ${fmt(sd.valor)} a preço registrado`, corpo: `${cab}\n\nInformamos que ${suj(r)} ainda possui saldo disponível para aquisição pelo preço registrado${vencStr ? `, válido até ${vencStr}` : ""}${sd.itens.length ? ":" : "."}\n${bloco}\nSaldo total: ${fmt(sd.valor)}\n\n${CTA}\n\n${ASSINATURA}` };
}
function montarEmailAdesao(adesaoId, ultimos90, tipo) {
  const a = store.find("adesoes", adesaoId); if (!a) return null;
  const ata = getAta(a.ataId) || {}, pAta = ata.propostaId ? getProp(ata.propostaId) : null, l = pAta ? getLicit(pAta.licitacaoId) : null, o = getOrgao(a.orgaoId);
  const cab = cabecalho(a.orgaoAderente || o.nome, a.uasgAderente || o.uasg), vencStr = a.vencimento ? fmtD(a.vencimento) : null, diasVenc = a.vencimento ? diasAte(a.vencimento) : null;
  // Número sem a palavra "ADESÃO"/"ATA" na frente, para o texto não repetir ("Adesão ADESÃO - 159/2025")
  const numAd = String(a.numero || "").replace(/^ades[ãa]o\s*(n[º°.]?\s*)?[-–:]?\s*/i, "").trim() || "—";
  const numAta = String(ata.numero || "").replace(/^ata\s*(n[º°.]?\s*)?[-–:]?\s*/i, "").trim();
  const refAta = numAta ? ` à ATA de Registro de Preços nº ${numAta}${l?.numero ? ` (${refLicit(l)})` : ""}` : ""; const r = { txt: `adesão nº ${numAd}${refAta}`, art: "a", curto: `Adesão ${numAd}${numAta ? ` – ATA ${numAta}` : ""}` };
  const emails = (o.contatos || []).filter((c) => c.email).map((c) => c.email); if (a.email) emails.unshift(a.email); const para = [...new Set(emails)].join(";");
  if (tipo === "agradecimento") {
    const itens = itensFornecidosAdesao(a); const tot = itens.length ? itens.reduce((s, i) => s + i.valorFornecido, 0) : store.get("empenhos").filter((e) => e.adesaoId === a.id).reduce((s, e) => s + (e.valorRecebido || 0), 0);
    const lista = itens.map((i, idx) => linhaItem(i.num || idx + 1, i.nome, i.codigo, i.qtdFornecida, i.precoUnit)).join("\n\n");
    return { para, assunto: `Agradecimento pelo fornecimento – ${r.curto}`, corpo: `${cab}\n\nAgradecemos a confiança na RLUX Iluminação. Concluímos o fornecimento referente ${ao(r)}${itens.length ? ":" : "."}\n${itens.length ? `\n${lista}\n` : ""}${tot > 0 ? `\nTotal fornecido: ${fmt(tot)}\n` : ""}\nFoi um prazer atendê-los. Seguimos à disposição para novas contratações e adesões, e para qualquer suporte sobre os produtos entregues.\n\n${ASSINATURA}` };
  }
  const sd = adesaoSaldoDetalhado(a); const lista = sd.itens.map((i, idx) => linhaItem(i.num || idx + 1, i.nome, i.codigo, i.saldo, i.preco)).join("\n\n"); const bloco = sd.itens.length ? `\n${lista}\n` : "";
  if (ultimos90 && diasVenc !== null) return { para, assunto: `Vigência encerra ${em(diasVenc)} – ${r.curto} – saldo de ${fmt(sd.valor)}`, corpo: `${cab}\n\nA vigência ${de(r)} encerra ${em(diasVenc)} (${vencStr}). Até essa data, ainda é possível adquirir pelo preço registrado${sd.itens.length ? ":" : "."}\n${bloco}\nSaldo total: ${fmt(sd.valor)}\n\nApós o encerramento, a aquisição pelos preços registrados não será mais possível.\n\n${CTA}\n\n${ASSINATURA}` };
  return { para, assunto: `Saldo disponível – ${r.curto} – ${fmt(sd.valor)} a preço registrado`, corpo: `${cab}\n\nInformamos que a ${r.txt} ainda possui saldo disponível para aquisição pelo preço registrado${vencStr ? `, válido até ${vencStr}` : ""}${sd.itens.length ? ":" : "."}\n${bloco}\nSaldo total: ${fmt(sd.valor)}\n\n${CTA}\n\n${ASSINATURA}` };
}

// ---------- cliente de e-mail / área de transferência ----------
export async function copiarTexto(txt) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(txt); return true; } } catch {}
  try { const ta = document.createElement("textarea"); ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); return true; } catch { return false; }
}
const MAILTO_LIMITE = 1800;
// Abre o cliente de e-mail. Corpo longo demais para o mailto -> vai para a área de transferência.
export function abrirClienteEmail(email, ccExtra = []) {
  const dest = String(email.para || "").split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  const cc = [...new Set([...ccExtra, EMPRESA.email])].filter((m) => m && !dest.includes(m));
  const base = `mailto:${dest.map(encodeURIComponent).join(",")}?subject=${encodeURIComponent(email.assunto)}${cc.length ? `&cc=${cc.map(encodeURIComponent).join(",")}` : ""}`;
  const completo = `${base}&body=${encodeURIComponent(email.corpo)}`;
  if (completo.length <= MAILTO_LIMITE) { window.open(completo, "_blank"); return true; }
  copiarTexto(email.corpo);
  window.open(`${base}&body=${encodeURIComponent('[Conteúdo copiado para a área de transferência — cole aqui com Ctrl+V. Se não colar, use o botão "Copiar" no sistema.]')}`, "_blank");
  return false;
}
export async function enviarPelaRegua(refId, origem, tipo, ultimos90) {
  const email = montarEmail(refId, origem, ultimos90, tipo); if (!email) return toast("Registro não encontrado.", "erro");
  await registrarEnvio(refId, tipo, origem);
  const inteiro = abrirClienteEmail(email);
  toast(inteiro ? "E-mail aberto e registrado como enviado." : "Texto longo: corpo copiado — cole com Ctrl+V no e-mail que abriu.", inteiro ? "ok" : "info", 6000);
}
export async function copiarPelaRegua(refId, origem, tipo, ultimos90) {
  const email = montarEmail(refId, origem, ultimos90, tipo); if (!email) return toast("Registro não encontrado.", "erro");
  await copiarTexto(`Para: ${email.para}\nAssunto: ${email.assunto}\n\n${email.corpo}`);
  await registrarEnvio(refId, tipo, origem);
  toast("E-mail copiado e registrado como enviado.");
}

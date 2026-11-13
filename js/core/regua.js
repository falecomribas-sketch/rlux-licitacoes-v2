// Régua de relacionamento: quem precisa receber e-mail (acompanhamento mensal,
// renovação D-60/D-30, agradecimento) e os textos dos e-mails.
// Portado do legado. Estado em Firestore: config/reguaEnvios (último carimbo por
// tipo) e config/reguaHist (histórico acumulado). Sem localStorage.
import { store } from "./store.js?v=20261113-114511";
import { fmt, fmtD, hojeIso, diasAte } from "./utils.js?v=20261113-114511";
import { getLicit, getOrgao, getProp, getAta, isVencido, propTotal, propEmpenhado, propSaldo, propSaldoDetalhado, adesaoSaldo, ataFoiRenovada } from "./domain.js?v=20261113-114511";
import { EMPRESA } from "./pdf.js?v=20261113-114511";
import { toast } from "./ui.js?v=20261113-114511";

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
export const ASSINATURA = `Atenciosamente,\n${EMPRESA.representante} · RLUX Iluminação Ltda.\n${EMPRESA.tel}\n${EMPRESA.emailLicitacoes} | www.rlux.com.br`;
function nomeOrgao(nome) { const n = String(nome || "").trim().replace(/^\d{4,}\s*[-–—]\s*/, ""); if (!n) return "—";
  return n.split(/\s+/).map((w, i) => { const limpo = w.toUpperCase().replace(/[^A-ZÀ-Ü0-9]/g, ""); if (SIGLAS.has(limpo)) return w.toUpperCase(); if (/^[A-ZÀ-Ü]{2,5}$/.test(w) && !/[AEIOUÁÉÍÓÚÂÊÔÃÕ]/.test(w)) return w; const lw = w.toLowerCase(); if (i > 0 && MINUSC.includes(lw)) return lw; return lw.charAt(0).toUpperCase() + lw.slice(1); }).join(" "); }
const uasgDe = (uasg, nome) => uasg ? String(uasg).trim() : (String(nome || "").match(/^(\d{4,})\s*[-–—]/)?.[1] || "");
// Cabeçalho: órgão + saudação (pelo nome quando há um único contato com e-mail)
function cabecalho(nome, uasg, contatos = []) { const u = uasgDe(uasg, nome); const comEmail = contatos.filter((c) => c.email);
  const nomeC = comEmail.length === 1 && comEmail[0].nome ? String(comEmail[0].nome).trim().split(/\s+/)[0] : "";
  const saud = nomeC ? `Prezado(a) ${nomeC.charAt(0).toUpperCase() + nomeC.slice(1).toLowerCase()},` : "Prezados(as),";
  return `${nomeOrgao(nome)}${u ? ` (UASG ${u})` : ""}\n\n${saud}`; }
const refLicit = (l) => { const tipo = (l?.tipo || "Pregão").trim(); const n = String(l?.numero || "").trim(); return n ? (/^[A-Za-z]/.test(n) ? `${tipo} ${n}` : `${tipo} nº ${n}`) : tipo; };
const semPrefixo = (n, re) => String(n || "").replace(re, "").trim();
function ref(l, ata) { const lic = refLicit(l); const n = semPrefixo(ata?.numero, /^ata\s*(n[º°.]?\s*)?[-–:]?\s*/i);
  if (n) return { txt: `ATA de Registro de Preços nº ${n} (${lic})`, art: "a", curto: `ATA ${n} – ${lic}`, intro: `A RLUX Iluminação é a fornecedora registrada na ATA de Registro de Preços nº ${n}, decorrente do ${lic}.` };
  const fem = /^(dispensa|tomada|concorr|inexigib|cota)/i.test((l?.tipo || "").trim());
  return { txt: lic, art: fem ? "a" : "o", curto: lic, intro: `A RLUX Iluminação é a empresa vencedora ${fem ? "da" : "do"} ${lic}, com preços registrados para este órgão.` }; }
const em = (n) => n <= 0 ? "hoje" : n === 1 ? "em 1 dia" : `em ${n} dias`;
const dias = (n) => n <= 0 ? "encerra hoje" : n === 1 ? "1 dia" : `${n} dias`;
const ao = (r) => `${r.art === "a" ? "à" : "ao"} ${r.txt}`;
// Nome do item limpo (sem a ficha técnica) e sem caixa alta
function nomeItem(nome) { const s = String(nome || "").replace(/\s+/g, " ").trim(); if (!s) return "—";
  const corte = s.search(/\s(?:Modelo|Tens[ãa]o|Pot[êe]ncia|Tipo|Formato|Fluxo|Abertura|Comprimento|Equival[êe]ncia|Cor|Temperatura|Material|Base|Bulbo|Dimens|Grau|Vida|Corrente|Frequ[êe]ncia|Fator|[ÍI]ndice|Largura|Altura|Di[âa]metro|Peso|Acabamento|Garantia|Marca|Refer[êe]ncia)\b[^:]{0,25}:/i);
  const base = corte > 2 ? s.slice(0, corte) : (s.includes(":") ? s.slice(0, s.indexOf(":")).split(" ").slice(0, -1).join(" ") || s : s);
  const pega = (re) => (s.match(re)?.[1] || "").trim();
  const formato = pega(/Formato:\s*(.+?)(?=\s+[A-ZÀ-Üa-zà-ü][\wÀ-ü]*:|$)/i), pot = pega(/Pot[êe]ncia(?:\s+Nominal)?:\s*([\d.,]+\s*W)\b/i).replace(/\s+/g, ""), comp = pega(/Comprimento:\s*([\d.,]+\s*MM)\b/i).replace(/\s+/g, "").toLowerCase();
  const partes = [base]; [formato, pot, comp].forEach((x) => { if (x && !base.toLowerCase().includes(x.toLowerCase())) partes.push(x); });
  let out = partes.join(" "); if (out.length > 70) out = out.slice(0, 67).trim() + "..."; return capitalizar(out); }
const MANTEM = new Set(["LED", "IP65", "IP66", "IP67", "IP20", "IP44", "RGB", "UV", "AC", "DC", "USB", "PVC", "ABS", "SMD", "COB", "LM", "IRC", "CRI", "G13", "E27", "E40", "GU10", "HO", "T8", "T5", "MR16", "AR111", "PAR20", "PAR30", "PAR38", "BIVOLT"]);
function capitalizar(txt) { return txt.split(" ").map((w, i) => { const up = w.toUpperCase().replace(/[^A-Z0-9À-Ü]/g, ""); if (/\d/.test(w) || MANTEM.has(up) || (w.length <= 2 && i > 0 && !MINUSC.includes(w.toLowerCase()))) return w.toUpperCase() === w ? w : w; const lw = w.toLowerCase(); if (i > 0 && MINUSC.includes(lw)) return lw; return lw.charAt(0).toUpperCase() + lw.slice(1); }).join(" "); }
const linhaItem = (num, nome, qtd, preco) => `  Item ${num} – ${nomeItem(nome)}\n  ${Number(qtd || 0).toLocaleString("pt-BR")} un. × ${fmt(preco || 0)} = ${fmt((qtd || 0) * (preco || 0))}`;
const bloco = (titulo, corpo) => corpo ? `${titulo}\n${corpo}` : "";
const fatos = (pares) => pares.filter(([, v]) => v).map(([k, v]) => `  ${k}: ${v}`).join("\n");
const COMO_ADQUIRIR = bloco("COMO ADQUIRIR", "  Basta responder este e-mail com a Nota de Empenho ou a\n  Ordem de Compra. A entrega segue o prazo previsto no edital.\n  Ficha técnica e documentos de habilitação, é só pedir.");
const juntar = (...partes) => partes.filter(Boolean).join("\n\n");

// Monta o e-mail a partir de um contexto comum (proposta ou adesão)
function montarTexto(c, tipo, ultimos90) {
  const { cab, r, vencStr, diasVenc, para } = c;
  if (tipo === "agradecimento") {
    const lista = c.fornecidos.map((i, idx) => linhaItem(i.num || idx + 1, i.nome, i.qtdFornecida, i.preco)).join("\n\n");
    return { para, assunto: `${r.curto} – agradecimento pelo fornecimento`, corpo: juntar(cab,
      `Agradecemos a confiança na RLUX Iluminação. Concluímos o fornecimento referente ${ao(r)}.`,
      bloco("ITENS FORNECIDOS", lista), c.totalFornecido > 0 ? fatos([["Total fornecido", fmt(c.totalFornecido)]]) : "",
      `Foi um prazer atendê-los. Seguimos à disposição para novas contratações${c.origem === "adesao" ? " e adesões" : ""} e para qualquer suporte sobre os produtos entregues.`, ASSINATURA) };
  }
  if (tipo === "renovacao60" || tipo === "renovacao30") {
    const urgente = tipo === "renovacao30"; const lista = c.registrados.map((i, idx) => linhaItem(i.num || idx + 1, i.nome, i.qtd, i.preco)).join("\n\n");
    return { para, assunto: `${urgente ? "[Atenção] " : ""}${r.curto} – vigência encerra ${em(diasVenc)} – prorrogação`, corpo: juntar(cab, r.intro,
      fatos([["Vigência da ATA", `até ${vencStr || "—"} (${dias(diasVenc)})`], ["Saldo ainda disponível", c.saldo > 0 ? fmt(c.saldo) : ""]]),
      bloco("ITENS REGISTRADOS", lista),
      bloco("PRORROGAÇÃO", "  Havendo interesse em manter o fornecimento, podemos tratar da\n  prorrogação da ATA, nos termos do art. 84 da Lei nº 14.133/2021,\n  com antecedência suficiente para evitar interrupção."),
      "Se o órgão já tiver novo processo em andamento ou não houver interesse, basta desconsiderar esta mensagem.", ASSINATURA) };
  }
  const lista = c.comSaldo.map((i, idx) => linhaItem(i.num || idx + 1, i.nome, i.saldo, i.preco)).join("\n\n");
  const encerra = ultimos90 && diasVenc !== null;
  return { para,
    assunto: encerra ? `${r.curto} – vigência encerra ${em(diasVenc)} – saldo de ${fmt(c.saldo)}` : `${r.curto} – saldo de ${fmt(c.saldo)} a preço registrado`,
    corpo: juntar(cab, r.intro,
      fatos([[c.origem === "adesao" ? "Vigência da adesão" : "Vigência", vencStr ? `até ${vencStr}${diasVenc !== null ? ` (${dias(diasVenc)})` : ""}` : ""], ["Saldo disponível", `${fmt(c.saldo)} (preço registrado)`]]),
      bloco(c.comSaldo.length > 1 ? "ITENS COM SALDO" : "ITEM COM SALDO", lista), COMO_ADQUIRIR,
      encerra ? `Após ${vencStr} a aquisição pelo preço registrado não será mais possível${c.origem === "adesao" ? "" : " e novas compras exigirão outro processo licitatório"}.` : "", ASSINATURA) };
}

export function montarEmail(refId, origem = "proposta", ultimos90 = false, tipo = "acompanhamento") {
  if (origem === "adesao") return montarEmailAdesao(refId, ultimos90, tipo);
  const p = getProp(refId); if (!p) return null;
  const l = getLicit(p.licitacaoId), o = getOrgao(l.orgaoId), ata = store.get("atas").find((a) => a.propostaId === refId);
  const forn = itensFornecidos(p); const sd = propSaldoDetalhado(p);
  return montarTexto({ origem, cab: cabecalho(o.nome, o.uasg, o.contatos), r: ref(l, ata), vencStr: ata?.vencimento ? fmtD(ata.vencimento) : null, diasVenc: ata?.vencimento ? diasAte(ata.vencimento) : null,
    para: (o.contatos || []).filter((c) => c.email).map((c) => c.email).join(";"), fornecidos: forn, totalFornecido: forn.length ? forn.reduce((s, i) => s + i.valorFornecido, 0) : propEmpenhado(p.id),
    registrados: p.itens || [], comSaldo: sd.itens, saldo: sd.valor }, tipo, ultimos90);
}
function montarEmailAdesao(adesaoId, ultimos90, tipo) {
  const a = store.find("adesoes", adesaoId); if (!a) return null;
  const ata = getAta(a.ataId) || {}, pAta = ata.propostaId ? getProp(ata.propostaId) : null, l = pAta ? getLicit(pAta.licitacaoId) : null, o = getOrgao(a.orgaoId);
  // Número sem a palavra "ADESÃO"/"ATA" na frente, para o texto não repetir ("Adesão ADESÃO - 159/2025")
  const numAd = semPrefixo(a.numero, /^ades[ãa]o\s*(n[º°.]?\s*)?[-–:]?\s*/i) || "—", numAta = semPrefixo(ata.numero, /^ata\s*(n[º°.]?\s*)?[-–:]?\s*/i);
  const r = { txt: `adesão nº ${numAd}${numAta ? ` à ATA de Registro de Preços nº ${numAta}` : ""}`, art: "a", curto: `Adesão ${numAd}${numAta ? ` – ATA ${numAta}` : ""}`,
    intro: numAta ? `A RLUX Iluminação é a fornecedora registrada na ATA de Registro de Preços nº ${numAta}${l?.numero ? ` (${refLicit(l)})` : ""}, à qual este órgão aderiu pela Adesão nº ${numAd}.` : `A RLUX Iluminação é a fornecedora da Adesão nº ${numAd} deste órgão.` };
  const emails = (o.contatos || []).filter((c) => c.email).map((c) => c.email); if (a.email) emails.unshift(a.email);
  const forn = itensFornecidosAdesao(a).map((i) => ({ ...i, preco: i.precoUnit })); const sd = adesaoSaldoDetalhado(a);
  return montarTexto({ origem: "adesao", cab: cabecalho(a.orgaoAderente || o.nome, a.uasgAderente || o.uasg, a.email ? [{ nome: a.contato, email: a.email }] : o.contatos), r, vencStr: a.vencimento ? fmtD(a.vencimento) : null, diasVenc: a.vencimento ? diasAte(a.vencimento) : null,
    para: [...new Set(emails)].join(";"), fornecidos: forn, totalFornecido: forn.length ? forn.reduce((s, i) => s + i.valorFornecido, 0) : store.get("empenhos").filter((e) => e.adesaoId === a.id).reduce((s, e) => s + (e.valorRecebido || 0), 0),
    registrados: (a.itens || []).map((i) => ({ ...i, qtd: i.qtdAdesao, preco: i.precoUnit })), comSaldo: sd.itens, saldo: sd.valor }, tipo, ultimos90);
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

// Funções de servidor do Rlux Licitações.
// A chave da API da Anthropic fica no Secret Manager (ANTHROPIC_API_KEY) e nunca chega ao navegador.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk");
const { PDFParse } = require("pdf-parse");
const { FAMILIAS_PADRAO, NAO_LOCALIZADO, systemPrompt, TOOL, auditoria } = require("./edital.js");

admin.initializeApp({ storageBucket: "rlux-licitacoes.firebasestorage.app" });
setGlobalOptions({ region: "southamerica-east1", maxInstances: 5 });
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

const MODELO_PADRAO = "claude-haiku-5-5";
const MAX_PDF_MB = 30;

// Texto por página (modo econômico: a IA recebe texto, não o PDF). Páginas sem texto (escaneadas)
// são renderizadas como imagem só quando necessário.
async function lerPdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const r = await parser.getText();
    const paginas = (r.pages || []).map((pg) => (pg.text || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim());
    const semTexto = paginas.map((t, i) => (t.length < 80 ? i + 1 : null)).filter(Boolean);
    let imagens = [];
    if (semTexto.length && semTexto.length <= 20) { // renderiza só as páginas escaneadas (limite para não explodir o custo)
      try { const sc = await parser.getScreenshot({ partial: semTexto, desiredWidth: 1200, imageDataUrl: false }); imagens = (sc.pages || []).map((pg) => ({ pagina: pg.pageNumber, png: Buffer.from(pg.data).toString("base64") })); }
      catch (e) { console.warn("screenshot falhou", e.message); }
    }
    return { paginas, semTexto, imagens };
  } finally { await parser.destroy().catch(() => {}); }
}

exports.analisarEdital = onCall({ secrets: [ANTHROPIC_API_KEY], memory: "1GiB", timeoutSeconds: 540, cors: true, invoker: "public" }, async (req) => {
  try { return await analisar(req); }
  catch (e) { if (e instanceof HttpsError) throw e; console.error("analisarEdital:", e); throw new HttpsError("internal", `Erro no servidor: ${e.message || e}`, { etapa: e.etapa || "" }); }
});

const escolherModelo = (m) => ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5"].includes(m) ? m : MODELO_PADRAO;

async function analisar(req) {
  if (!req.auth) throw new HttpsError("unauthenticated", "Faça login para analisar editais.");
  const { arquivos, familias, prompt } = req.data || {}; const modelo = escolherModelo(req.data?.modelo);
  if (!Array.isArray(arquivos) || !arquivos.length) throw new HttpsError("invalid-argument", "Envie ao menos um PDF.");
  if (arquivos.length > 4) throw new HttpsError("invalid-argument", "No máximo 4 PDFs por análise.");

  // Baixa os PDFs do Storage (o site já os enviou para anexos/editais/{id}/)
  const bucket = admin.storage().bucket();
  const docs = [];
  for (const a of arquivos) {
    if (typeof a.path !== "string" || !a.path.startsWith("anexos/editais/")) throw new HttpsError("invalid-argument", "Caminho de arquivo inválido.");
    let buf; try { [buf] = await bucket.file(a.path).download(); } catch (e) { e.etapa = "download"; e.message = `não consegui ler ${a.path} do Storage: ${e.message}`; throw e; }
    if (buf.length > MAX_PDF_MB * 1024 * 1024) throw new HttpsError("invalid-argument", `${a.nome || a.path}: acima de ${MAX_PDF_MB} MB.`);
    let lido = { paginas: [], semTexto: [], imagens: [] }, falhou = false;
    try { lido = await lerPdf(buf); } catch (e) { console.warn("pdf-parse falhou", a.path, e.message); falhou = true; }
    docs.push({ nome: a.nome || a.path.split("/").pop(), buf, ...lido, falhou });
  }
  const fams = Array.isArray(familias) && familias.length ? familias : FAMILIAS_PADRAO;
  const todasPaginas = docs.flatMap((d) => d.paginas);
  const semTexto = docs.map((d) => ({ nome: d.nome, paginas: d.paginas.length, semTexto: d.semTexto.length, modo: d.falhou || (d.paginas.length && d.semTexto.length > d.paginas.length * 0.5) ? "pdf" : "texto" }));

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
  const content = [];
  docs.forEach((d, i) => {
    const info = semTexto[i];
    if (info.modo === "pdf") { // PDF escaneado ou ilegível: manda o arquivo inteiro (mais caro, mas é o único jeito)
      content.push({ type: "text", text: `Documento ${i + 1}: ${d.nome} (PDF sem texto extraível — lido por imagem)` });
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: d.buf.toString("base64") }, title: d.nome });
      return;
    }
    const texto = d.paginas.map((t, k) => `--- Documento ${i + 1}: ${d.nome} — página ${k + 1} ---\n${t || "[página sem texto]"}`).join("\n\n");
    content.push({ type: "text", text: texto });
    d.imagens.forEach((img) => { content.push({ type: "text", text: `Documento ${i + 1}, página ${img.pagina} (imagem — página sem texto):` }); content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: img.png } }); });
  });
  // Sem cache de prompt: cada chamada lê o edital uma única vez e gravar cache custa 25% a mais sem reaproveitamento.
  content.push({ type: "text", text: "Analise os documentos acima (o número da página está no marcador de cada trecho) e registre a análise completa com a ferramenta registrar_analise." });

  const t0 = Date.now();
  let resp;
  try {
    resp = await client.messages.stream({
      model: modelo, max_tokens: 24000, system: systemPrompt(fams, prompt),
      tools: [TOOL], tool_choice: { type: "auto" },
      messages: [{ role: "user", content }],
    }).finalMessage();
  } catch (e) {
    console.error("Anthropic:", e);
    throw new HttpsError("internal", `Falha na IA: ${e.status || ""} ${e.message || e}`);
  }
  const uso = resp.usage || {};
  const textoLivre = (resp.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  console.log("analisar: blocos", (resp.content || []).map((c) => c.type).join(","), "textoLivre", textoLivre.length, "stop", resp.stop_reason, "saida", uso.output_tokens);
  const bloco = (resp.content || []).find((c) => c.type === "tool_use");
  let r = bloco?.input;
  if (!r) { // modelo respondeu em texto: tenta extrair o JSON
    const m = textoLivre.match(/\{[\s\S]*\}/); try { r = m ? JSON.parse(m[0]) : null; } catch { r = null; }
    if (!r) throw new HttpsError("internal", "A IA não devolveu a análise estruturada. Início da resposta: " + textoLivre.slice(0, 300));
  }
  let complemento = null;
  // Resposta cortada no limite antes de chegar ao resumo (itens vêm primeiro): pede só o resumo numa 2ª chamada curta
  if (resp.stop_reason === "max_tokens" && !(r.resumo && r.resumo.orgao)) {
    try {
      const content2 = content.slice(0, -1).concat([{ type: "text", text: "Os itens já foram extraídos em outra etapa. Agora registre com a ferramenta registrar_analise APENAS: o resumo (PARTE 1), a documentação especial (PARTE 2) e as observações. Envie \"itens\" como lista vazia []." }]);
      const resp2 = await client.messages.stream({ model: modelo, max_tokens: 6000, system: systemPrompt(fams, prompt), tools: [TOOL], tool_choice: { type: "auto" }, messages: [{ role: "user", content: content2 }] }).finalMessage();
      const b2 = (resp2.content || []).find((c) => c.type === "tool_use"); const r2 = b2?.input;
      if (r2) { r.resumo = r2.resumo || r.resumo; r.documentacaoEspecial = r2.documentacaoEspecial || r.documentacaoEspecial; r.observacoes = [r.observacoes, r2.observacoes].filter(Boolean).join(" "); }
      complemento = resp2.usage || {};
    } catch (e) { console.warn("complemento do resumo falhou", e.message); }
  }

  r.resumo = r.resumo || {};
  ["validadeProposta", "exigeAmostra", "entrega", "garantiaContratual"].forEach((k) => { if (!r.resumo[k]) r.resumo[k] = NAO_LOCALIZADO; });
  r.itens = (r.itens || []).map((i) => ({ ...i, item: String(i.item ?? "") }));
  r.auditoria = auditoria(todasPaginas, r.itens, fams);
  r.documentos = semTexto;
  const c2 = complemento || {};
  r.meta = { modelo: resp.model, tokensEntrada: (uso.input_tokens || 0) + (c2.input_tokens || 0), tokensSaida: (uso.output_tokens || 0) + (c2.output_tokens || 0), tokensCache: (uso.cache_read_input_tokens || 0) + (uso.cache_creation_input_tokens || 0) + (c2.cache_read_input_tokens || 0) + (c2.cache_creation_input_tokens || 0), segundos: Math.round((Date.now() - t0) / 1000), paginas: todasPaginas.length, stopReason: resp.stop_reason, complementoResumo: !!complemento, textoLivre: textoLivre.length };
  return r;
}

// Etapa C — casa itens do edital com produtos do cadastro. O site manda, por item, os candidatos já filtrados.
const { systemPromptCasar, TOOL_CASAR } = require("./edital.js");
exports.casarItens = onCall({ secrets: [ANTHROPIC_API_KEY], memory: "512MiB", timeoutSeconds: 300, cors: true, invoker: "public" }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Faça login para usar a IA.");
  const { itens, regras, prompt } = req.data || {};
  if (!Array.isArray(itens) || !itens.length) throw new HttpsError("invalid-argument", "Nenhum item para casar.");
  if (itens.length > 60) throw new HttpsError("invalid-argument", "No máximo 60 itens por chamada.");
  const modelo = ["claude-sonnet-5-5", "claude-haiku-5-5"].includes(req.data?.modelo) ? req.data.modelo : MODELO_PADRAO;
  const texto = itens.map((it, i) => `ITEM ${it.item} (${i + 1}/${itens.length})\nDescrição no edital: ${it.descricao}\nUnidade: ${it.unidade || "—"} · Quantidade: ${it.quantidade ?? "—"}${it.marcaReferencia ? ` · Marca de referência: ${it.marcaReferencia}` : ""}\nCANDIDATOS:\n${(it.candidatos || []).map((c) => `  - id=${c.id} | ${c.nome}${c.descricaoTecnica ? ` | ${c.descricaoTecnica}` : ""}${c.tecnico ? ` | ${c.tecnico}` : ""}${c.unidade ? ` | un: ${c.unidade}` : ""}`).join("\n") || "  (nenhum candidato na família)"}`).join("\n\n");
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
  const t0 = Date.now();
  let resp;
  try {
    resp = await client.messages.stream({ model: modelo, max_tokens: 12000, system: systemPromptCasar(regras, prompt), tools: [TOOL_CASAR], tool_choice: { type: "auto" }, messages: [{ role: "user", content: texto + "\n\nRegistre a correspondência de todos os itens com a ferramenta registrar_correspondencia." }] }).finalMessage();
  } catch (e) { console.error("Anthropic:", e); throw new HttpsError("internal", `Falha na IA: ${e.status || ""} ${e.message || e}`); }
  const bloco = (resp.content || []).find((c) => c.type === "tool_use"); let r = bloco?.input;
  if (!r) { const txt = (resp.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n"); const m = txt.match(/\{[\s\S]*\}/); try { r = m ? JSON.parse(m[0]) : null; } catch { r = null; } if (!r) throw new HttpsError("internal", "A IA não devolveu a correspondência estruturada."); }
  const uso = resp.usage || {};
  return { itens: r.itens || [], meta: { modelo: resp.model, tokensEntrada: (uso.input_tokens || 0) + (uso.cache_read_input_tokens || 0) + (uso.cache_creation_input_tokens || 0), tokensSaida: uso.output_tokens || 0, segundos: Math.round((Date.now() - t0) / 1000) } };
});

// Seleciona, sem IA, as páginas que podem conter declarações (ou a exigência delas) + 1 página de contexto de cada lado.
// Se o filtro deixar passar quase tudo, manda tudo (sem perda); se cortar demais, garante ao menos as páginas com "declar".
const RE_FORTE = /declara[çc][ãa]o|declaro|declaramos|declarante/i;
const RE_SECAO = /(documenta[çc][ãa]o|documentos?)\s+(de|para|relativ[ao]s?\s+[àa])\s+habilita|^\s*(\d+[.\d]*\s*[-–.]?\s*)?da\s+habilita[çc][ãa]o|habilita[çc][ãa]o\s+jur[íi]dica|qualifica[çc][ãa]o\s+(t[ée]cnica|econ[ôo]mico)/im;
const RE_ANEXO_INICIO = /^\s*anexo\s+[ivxlc\d]+/i;
function paginasDeclaracoes(paginas) {
  const sel = new Set();
  paginas.forEach((t, k) => {
    const txt = t || ""; const inicio = txt.slice(0, 400);
    if (RE_FORTE.test(txt) || RE_SECAO.test(txt) || RE_ANEXO_INICIO.test(inicio)) { sel.add(k); if (k + 1 < paginas.length && RE_FORTE.test(txt)) sel.add(k + 1); }
  });
  if (!sel.size || sel.size >= paginas.length * 0.8) return paginas.map((_, k) => k); // filtro inútil → manda tudo
  return [...sel].sort((a, b) => a - b);
}

// Declarações: relê os mesmos PDFs já guardados no Storage e devolve as declarações preenchidas
const { systemPromptDeclaracoes, TOOL_DECL } = require("./edital.js");
exports.extrairDeclaracoes = onCall({ secrets: [ANTHROPIC_API_KEY], memory: "1GiB", timeoutSeconds: 540, cors: true, invoker: "public" }, async (req) => {
  try {
    if (!req.auth) throw new HttpsError("unauthenticated", "Faça login para usar a IA.");
    const { arquivos, empresa, prompt } = req.data || {}; const modelo = escolherModelo(req.data?.modelo);
    if (!Array.isArray(arquivos) || !arquivos.length) throw new HttpsError("invalid-argument", "A análise não tem os PDFs guardados; analise o edital novamente.");
    if (arquivos.length > 4) throw new HttpsError("invalid-argument", "No máximo 4 PDFs.");
    const bucket = admin.storage().bucket(); const content = []; let paginasTotal = 0, paginasEnviadas = 0;
    for (let i = 0; i < arquivos.length; i++) {
      const a = arquivos[i]; if (typeof a.path !== "string" || !a.path.startsWith("anexos/editais/")) throw new HttpsError("invalid-argument", "Caminho de arquivo inválido.");
      let buf; try { [buf] = await bucket.file(a.path).download(); } catch (e) { throw new HttpsError("not-found", `Não encontrei ${a.nome || a.path} no Storage (os PDFs da análise podem ter sido apagados).`); }
      let lido = { paginas: [], semTexto: [], imagens: [] }, falhou = false; try { lido = await lerPdf(buf); } catch (e) { falhou = true; }
      const nome = a.nome || a.path.split("/").pop();
      if (falhou || (lido.paginas.length && lido.semTexto.length > lido.paginas.length * 0.5)) { content.push({ type: "text", text: `Documento ${i + 1}: ${nome} (lido por imagem)` }); content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") }, title: nome }); continue; }
      const sel = paginasDeclaracoes(lido.paginas); paginasTotal += lido.paginas.length; paginasEnviadas += sel.length;
      content.push({ type: "text", text: sel.map((k) => `--- Documento ${i + 1}: ${nome} — página ${k + 1} ---\n${lido.paginas[k] || "[página sem texto]"}`).join("\n\n") || `--- Documento ${i + 1}: ${nome} — nenhuma página com menção a declarações ---` });
      lido.imagens.forEach((img) => { content.push({ type: "text", text: `Documento ${i + 1}, página ${img.pagina} (imagem):` }); content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: img.png } }); });
    }
    content.push({ type: "text", text: `Os trechos acima são as páginas dos documentos que mencionam declarações, habilitação ou anexos (${paginasEnviadas} de ${paginasTotal} páginas; o número da página está no marcador). Localize todas as declarações exigidas da licitante e registre-as preenchidas com a ferramenta registrar_declaracoes.` });
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() }); const t0 = Date.now();
    let resp;
    try { resp = await client.messages.stream({ model: modelo, max_tokens: 24000, system: systemPromptDeclaracoes(empresa, prompt), tools: [TOOL_DECL], tool_choice: { type: "auto" }, messages: [{ role: "user", content }] }).finalMessage(); }
    catch (e) { console.error("Anthropic:", e); throw new HttpsError("internal", `Falha na IA: ${e.status || ""} ${e.message || e}`); }
    const bloco = (resp.content || []).find((c) => c.type === "tool_use"); let r = bloco?.input;
    if (!r) { const txt = (resp.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n"); const m = txt.match(/\{[\s\S]*\}/); try { r = m ? JSON.parse(m[0]) : null; } catch { r = null; } if (!r) throw new HttpsError("internal", "A IA não devolveu as declarações estruturadas."); }
    const uso = resp.usage || {};
    return { declaracoes: (r.declaracoes || []).map((d) => ({ titulo: String(d.titulo || "Declaração"), referencia: d.referencia || "", fase: d.fase || "outra", destinatario: d.destinatario || "", texto: String(d.texto || ""), pendencias: Array.isArray(d.pendencias) ? d.pendencias : [], quemAssina: d.quemAssina === "contador" ? "contador" : "representante" })), observacoes: r.observacoes || "", meta: { modelo: resp.model, tokensEntrada: (uso.input_tokens || 0) + (uso.cache_read_input_tokens || 0) + (uso.cache_creation_input_tokens || 0), tokensSaida: uso.output_tokens || 0, segundos: Math.round((Date.now() - t0) / 1000), stopReason: resp.stop_reason, paginas: paginasEnviadas, paginasTotal } };
  } catch (e) { if (e instanceof HttpsError) throw e; console.error("extrairDeclaracoes:", e); throw new HttpsError("internal", `Erro no servidor: ${e.message || e}`); }
});

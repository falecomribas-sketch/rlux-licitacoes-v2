// Funções de servidor do Rlux Licitações.
// A chave da API da Anthropic fica no Secret Manager (ANTHROPIC_API_KEY) e nunca chega ao navegador.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk");
const { PDFParse } = require("pdf-parse");
const { FAMILIAS_PADRAO, PERGUNTAS, NAO_LOCALIZADO, systemPrompt, TOOL, auditoria } = require("./edital.js");

admin.initializeApp({ storageBucket: "rlux-licitacoes.firebasestorage.app" });
setGlobalOptions({ region: "southamerica-east1", maxInstances: 5 });
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

const MODELO_PADRAO = "claude-sonnet-5-5";
const MAX_PDF_MB = 30;

// Texto por página (para contar páginas, detectar PDF escaneado e fazer a auditoria por palavra-chave)
async function textoPorPagina(buffer) {
  const parser = new PDFParse({ data: buffer });
  try { const r = await parser.getText(); return (r.pages || []).map((pg) => pg.text || ""); }
  finally { await parser.destroy().catch(() => {}); }
}

exports.analisarEdital = onCall({ secrets: [ANTHROPIC_API_KEY], memory: "1GiB", timeoutSeconds: 540, cors: true, invoker: "public" }, async (req) => {
  try { return await analisar(req); }
  catch (e) { if (e instanceof HttpsError) throw e; console.error("analisarEdital:", e); throw new HttpsError("internal", `Erro no servidor: ${e.message || e}`, { etapa: e.etapa || "" }); }
});

async function analisar(req) {
  if (!req.auth) throw new HttpsError("unauthenticated", "Faça login para analisar editais.");
  const { arquivos, familias, modelo } = req.data || {};
  if (!Array.isArray(arquivos) || !arquivos.length) throw new HttpsError("invalid-argument", "Envie ao menos um PDF.");
  if (arquivos.length > 4) throw new HttpsError("invalid-argument", "No máximo 4 PDFs por análise.");

  // Baixa os PDFs do Storage (o site já os enviou para anexos/editais/{id}/)
  const bucket = admin.storage().bucket();
  const docs = [];
  for (const a of arquivos) {
    if (typeof a.path !== "string" || !a.path.startsWith("anexos/editais/")) throw new HttpsError("invalid-argument", "Caminho de arquivo inválido.");
    let buf; try { [buf] = await bucket.file(a.path).download(); } catch (e) { e.etapa = "download"; e.message = `não consegui ler ${a.path} do Storage: ${e.message}`; throw e; }
    if (buf.length > MAX_PDF_MB * 1024 * 1024) throw new HttpsError("invalid-argument", `${a.nome || a.path}: acima de ${MAX_PDF_MB} MB.`);
    let paginas = [];
    try { paginas = await textoPorPagina(buf); } catch (e) { console.warn("pdf-parse falhou", a.path, e.message); }
    docs.push({ nome: a.nome || a.path.split("/").pop(), buf, paginas });
  }
  const fams = Array.isArray(familias) && familias.length ? familias : FAMILIAS_PADRAO;
  const todasPaginas = docs.flatMap((d) => d.paginas);
  const semTexto = docs.map((d) => ({ nome: d.nome, paginas: d.paginas.length, semTexto: d.paginas.filter((t) => (t || "").trim().length < 80).length }));

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
  const content = [];
  docs.forEach((d, i) => {
    content.push({ type: "text", text: `Documento ${i + 1}: ${d.nome} (${d.paginas.length || "?"} páginas)` });
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: d.buf.toString("base64") }, title: d.nome, cache_control: i === docs.length - 1 ? { type: "ephemeral" } : undefined });
  });
  content.push({ type: "text", text: "Analise os documentos acima e registre a análise completa com a ferramenta registrar_analise." });

  const t0 = Date.now();
  let resp;
  try {
    resp = await client.messages.create({
      model: modelo || MODELO_PADRAO, max_tokens: 16000, system: systemPrompt(fams),
      tools: [TOOL], tool_choice: { type: "auto" },
      messages: [{ role: "user", content }],
    });
  } catch (e) {
    console.error("Anthropic:", e);
    throw new HttpsError("internal", `Falha na IA: ${e.status || ""} ${e.message || e}`);
  }
  const uso = resp.usage || {};
  const bloco = (resp.content || []).find((c) => c.type === "tool_use");
  let r = bloco?.input;
  if (!r) { // modelo respondeu em texto: tenta extrair o JSON
    const txt = (resp.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    const m = txt.match(/\{[\s\S]*\}/); try { r = m ? JSON.parse(m[0]) : null; } catch { r = null; }
    if (!r) throw new HttpsError("internal", "A IA não devolveu a análise estruturada. Início da resposta: " + txt.slice(0, 300));
  }

  // Garante as 8 perguntas na ordem, mesmo que a IA pule alguma
  const respondidas = Array.isArray(r.perguntas) ? r.perguntas : [];
  r.perguntas = PERGUNTAS.map((p) => respondidas.find((x) => (x.pergunta || "").toLowerCase().startsWith(p.toLowerCase().slice(0, 12))) || { pergunta: p, resposta: NAO_LOCALIZADO, base: "" });
  r.itens = (r.itens || []).map((i) => ({ ...i, item: String(i.item ?? "") }));
  r.auditoria = auditoria(todasPaginas, r.itens, fams);
  r.documentos = semTexto;
  r.meta = { modelo: resp.model, tokensEntrada: uso.input_tokens || 0, tokensSaida: uso.output_tokens || 0, tokensCache: (uso.cache_read_input_tokens || 0) + (uso.cache_creation_input_tokens || 0), segundos: Math.round((Date.now() - t0) / 1000), paginas: todasPaginas.length, stopReason: resp.stop_reason };
  return r;
}

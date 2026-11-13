// Ponte com as funções de servidor (IA). O navegador nunca vê a chave da API:
// envia os PDFs para o Storage e pede ao servidor que analise.
import { app, storage } from "./firebase.js?v=20261113-004029";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import { ref, uploadBytes } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { newId } from "./store.js?v=20261113-004029";

const functions = getFunctions(app, "southamerica-east1");
export const LIMITE_PDF = 30 * 1024 * 1024;

// Envia os PDFs e chama a análise. onProgresso(texto) recebe mensagens de andamento.
export async function analisarEdital(files, { familias, modelo, prompt, onProgresso } = {}) {
  const id = newId(); const arquivos = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) throw new Error(`${f.name}: envie apenas PDF.`);
    if (f.size > LIMITE_PDF) throw new Error(`${f.name}: acima de 30 MB.`);
    onProgresso?.(`Enviando ${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)…`);
    const path = `anexos/editais/${id}/${i + 1}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
    await uploadBytes(ref(storage, path), f, { contentType: "application/pdf", customMetadata: { nome: f.name } });
    arquivos.push({ path, nome: f.name });
  }
  onProgresso?.("Lendo o edital com a IA — isso leva de 1 a 3 minutos…");
  const fn = httpsCallable(functions, "analisarEdital", { timeout: 540000 });
  try {
    const r = await fn({ arquivos, familias, modelo, prompt: prompt || undefined });
    return { id, arquivos, ...r.data };
  } catch (e) {
    const msg = [e?.message, e?.details?.etapa ? `(etapa: ${e.details.etapa})` : ""].filter(Boolean).join(" ") || String(e);
    if (/not-found|NOT_FOUND|404/i.test(msg)) throw new Error("A função de IA ainda não foi publicada no Firebase (Etapa A pendente).");
    if (/unauthenticated/i.test(msg)) throw new Error("Faça login novamente para usar a IA.");
    throw new Error(msg.replace(/^FirebaseError:\s*/, ""));
  }
}

// Etapa C — correspondência. candidatosPorItem: [{ item, descricao, unidade, quantidade, marcaReferencia, candidatos:[{id,nome,descricaoTecnica,tecnico,unidade}] }]
export async function casarItens(itens, { regras, modelo, prompt } = {}) {
  const fn = httpsCallable(functions, "casarItens", { timeout: 300000 });
  try { const r = await fn({ itens, regras, modelo, prompt: prompt || undefined }); return r.data; }
  catch (e) { throw new Error((e?.message || String(e)).replace(/^FirebaseError:\s*/, "")); }
}

// Declarações exigidas no edital — usa os PDFs já guardados na análise (arquivos: [{path,nome}])
export async function extrairDeclaracoes(arquivos, { empresa, prompt, modelo, certame } = {}) {
  const fn = httpsCallable(functions, "extrairDeclaracoes", { timeout: 540000 });
  try { const r = await fn({ arquivos, empresa, certame, prompt: prompt || undefined, modelo }); return r.data; }
  catch (e) { const msg = (e?.message || String(e)).replace(/^FirebaseError:\s*/, ""); if (/not-found|NOT_FOUND|404/i.test(msg) && !/Storage/.test(msg)) throw new Error("A função de declarações ainda não foi publicada no servidor."); throw new Error(msg); }
}

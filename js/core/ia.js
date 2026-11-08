// Ponte com as funções de servidor (IA). O navegador nunca vê a chave da API:
// envia os PDFs para o Storage e pede ao servidor que analise.
import { app, storage } from "./firebase.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import { ref, uploadBytes } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { newId } from "./store.js";

const functions = getFunctions(app, "southamerica-east1");
export const LIMITE_PDF = 30 * 1024 * 1024;

// Envia os PDFs e chama a análise. onProgresso(texto) recebe mensagens de andamento.
export async function analisarEdital(files, { familias, onProgresso } = {}) {
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
    const r = await fn({ arquivos, familias });
    return { id, arquivos, ...r.data };
  } catch (e) {
    const msg = [e?.message, e?.details?.etapa ? `(etapa: ${e.details.etapa})` : ""].filter(Boolean).join(" ") || String(e);
    if (/not-found|NOT_FOUND|404/i.test(msg)) throw new Error("A função de IA ainda não foi publicada no Firebase (Etapa A pendente).");
    if (/unauthenticated/i.test(msg)) throw new Error("Faça login novamente para usar a IA.");
    throw new Error(msg.replace(/^FirebaseError:\s*/, ""));
  }
}

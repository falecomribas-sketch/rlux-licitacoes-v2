// Anexos: upload para o Firebase Storage e exibição de anexos antigos.
//
// Compatibilidade com o legado: um campo de anexo pode conter
//   - uma URL https do Storage (formato novo e do legado após sincronizar), ou
//   - um JSON {name,type,data:"data:..."} (anexo antigo guardado em base64).
import { storage } from "./firebase.js?v=20261113-153534";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { icon } from "./ui.js?v=20261113-153534";
import { esc } from "./utils.js?v=20261113-153534";

export const LIMITE_ANEXO = 15 * 1024 * 1024; // 15 MB

// uploadAnexo("licitacoes", id, "editalData", file) -> URL
export async function uploadAnexo(colecao, id, campo, file) {
  if (file.size > LIMITE_ANEXO) throw new Error("Arquivo muito grande (máximo 15 MB).");
  const r = ref(storage, `anexos/${colecao}/${id}/${campo}`);
  await uploadBytes(r, file, { contentType: file.type || "application/octet-stream", customMetadata: { nome: file.name } });
  return getDownloadURL(r);
}

// Interpreta o valor salvo no campo
export function anexoInfo(valor, nome = "") {
  if (!valor) return null;
  if (typeof valor === "string" && valor.startsWith("https://")) return { url: valor, nome: nome || "", legado: false };
  try { const o = JSON.parse(valor); if (o?.data) return { data: o.data, nome: o.name || nome || "arquivo", tipo: o.type || "", legado: true }; } catch {}
  return null;
}

// Botões "ver" / "baixar" para um anexo
export function anexoBotoes(valor, rotulo = "Anexo", nome = "") {
  const a = anexoInfo(valor, nome);
  if (!a) return "";
  if (!a.legado) return `<a class="tag tag-green" href="${esc(a.url)}" target="_blank" rel="noopener" title="${esc(a.nome || rotulo)}">${icon("link", "ic-inline")} ${esc(rotulo)}</a>`;
  return `<button type="button" class="tag tag-green" data-anexo-legado="${esc(valor)}" title="${esc(a.nome)}">${icon("file", "ic-inline")} ${esc(rotulo)}</button>`;
}

// Abre anexos antigos (base64) em nova aba
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-anexo-legado]");
  if (!b) return;
  const a = anexoInfo(b.dataset.anexoLegado);
  if (!a?.data) return;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(a.tipo.includes("pdf") ? `<iframe src="${a.data}" style="width:100%;height:100%;border:0"></iframe>` : `<img src="${a.data}" style="max-width:100%">`);
});

// Campo de arquivo (dropzone) para formulários. Retorna HTML; o módulo lê
// o <input type=file> pelo name e decide se faz upload ao salvar.
export function campoAnexo(label, name, valorAtual = "", nomeAtual = "") {
  const a = anexoInfo(valorAtual, nomeAtual);
  return `<div class="field"><span>${esc(label)}</span>
    <label class="dropzone dz-anexo">
      <input type="file" name="${esc(name)}" hidden>
      <span class="dz-anexo-txt">${a ? `${icon("check", "ic-inline")} ${esc(a.nome || "Anexo atual")} — clique para substituir` : "Clique para anexar"}</span>
    </label>
    ${a && !a.legado ? `<a class="help" href="${esc(a.url)}" target="_blank" rel="noopener">abrir anexo atual</a>` : ""}
  </div>`;
}

// Liga a troca de arquivo ao texto da dropzone
export function ligarDropzones(form) {
  form.querySelectorAll(".dz-anexo input[type=file]").forEach((inp) => inp.addEventListener("change", () => {
    const f = inp.files[0]; const txt = inp.closest(".dz-anexo").querySelector(".dz-anexo-txt");
    txt.textContent = f ? `${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB) — será enviado ao salvar` : "Clique para anexar";
  }));
}

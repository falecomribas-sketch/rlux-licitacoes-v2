// Histórico interno de um registro (reequilíbrio, e futuramente empenhos/cobranças): anotações carimbadas com data, hora e usuário,
// mais entradas automáticas do sistema. Uso interno — nunca entra em PDF, e-mail ou documento.
// Formato: r.historico = [{ data: ISO, por: e-mail, tipo: "nota" | "sistema", texto }]
import { store } from "./store.js?v=20261126-090827";
import { esc } from "./utils.js?v=20261126-090827";
import { isAdmin, currentUser } from "./auth.js?v=20261126-090827";
import { confirmar } from "./ui.js?v=20261126-090827";

export const quem = () => store.usuarioAtual || currentUser?.email || "";
export const entrada = (texto, tipo = "nota", data = new Date().toISOString()) => ({ data, por: tipo === "sistema" ? "sistema" : quem(), tipo, texto: String(texto || "").trim() });

// Entradas do registro, mais recentes primeiro. O campo antigo "obs" (texto solto) vira a primeira entrada, se ainda não migrou.
export function entradasDe(r) {
  const h = Array.isArray(r?.historico) ? r.historico.slice() : [];
  if (r?.obs && !h.some((e) => e.migradoDeObs)) h.push({ data: r._atualizadoEm || r.criadoEm || new Date().toISOString(), por: r._atualizadoPor || quem(), tipo: "nota", texto: r.obs, migradoDeObs: true });
  return h.filter((e) => e && e.texto).sort((a, b) => String(b.data).localeCompare(String(a.data)));
}
// Devolve o array a gravar: histórico existente (com o obs migrado) + novas entradas. Zera "obs".
export function comEntradas(r, novas = []) {
  const base = entradasDe(r).filter((e) => e.texto).map((e) => ({ data: e.data, por: e.por, tipo: e.tipo || "nota", texto: e.texto, ...(e.migradoDeObs ? { migradoDeObs: true } : {}) }));
  return [...novas.filter((e) => e && e.texto), ...base].sort((a, b) => String(b.data).localeCompare(String(a.data)));
}
export const ultimaEntrada = (r) => entradasDe(r)[0] || null;
export function diasDesdeUltima(r) { const u = ultimaEntrada(r); if (!u) return null; return Math.floor((Date.now() - new Date(u.data).getTime()) / 86400000); }

const nomeCurto = (por) => (!por ? "—" : por === "sistema" ? "sistema" : String(por).split("@")[0]);
const quando = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); };

// Bloco HTML do formulário: lista + campo "Nova anotação" (name=nota). Excluir entrada só para admin (data-hist-rm=índice na lista exibida).
export function blocoHistorico(r, { rotulo = "Histórico interno", nome = "nota" } = {}) {
  const lista = entradasDe(r);
  return `<div class="field" style="grid-column:1/-1"><span>${rotulo ? `${esc(rotulo)} · ` : ""}<span class="muted" style="font-weight:400">uso interno — não sai em documentos, e-mails nem PDFs</span></span>
    <div class="hist-lista" id="hist-lista">${lista.length ? lista.map((e, i) => `<div class="hist-item ${e.tipo === "sistema" ? "hist-sis" : ""}"><div class="hist-meta"><span>${quando(e.data)}</span> · <span>${esc(nomeCurto(e.por))}</span>${isAdmin() && e.tipo !== "sistema" ? `<button type="button" class="icon-btn hist-rm" data-hist-rm="${i}" title="Excluir esta anotação (somente administrador)">×</button>` : ""}</div><div class="hist-txt">${esc(e.texto).replace(/\n/g, "<br>")}</div></div>`).join("") : `<div class="muted" style="font-size:12.5px;padding:6px 2px">Nenhuma anotação ainda.</div>`}</div>
    <textarea name="${nome}" rows="2" placeholder="Nova anotação — ex.: liguei para a gestora; parecer previsto para sexta. Fica registrada com data, hora e seu usuário ao salvar."></textarea></div>`;
}
// Liga a exclusão de entradas (admin). salvar(novoHistorico) deve gravar o registro.
export function ligarHistorico(form, r, salvar) {
  form.querySelector("#hist-lista")?.addEventListener("click", async (e) => { const b = e.target.closest("[data-hist-rm]"); if (!b || !isAdmin()) return;
    const lista = entradasDe(r); const alvo = lista[+b.dataset.histRm]; if (!alvo) return;
    if (!await confirmar(`Excluir a anotação de ${quando(alvo.data)}? "${alvo.texto.slice(0, 120)}"`, { ok: "Excluir", perigo: true })) return;
    const novo = comEntradas(r).filter((x) => !(x.data === alvo.data && x.texto === alvo.texto)); await salvar(novo); b.closest(".hist-item").remove(); });
}

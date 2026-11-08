// Analisar edital (IA) — Etapa A: leitura do edital e dos anexos, sem gravar nada no banco.
// Aba Resumo: 7 campos (órgão, nº, município/UF, validade, amostra, entrega, garantia) com base, documentação especial, observações.
// Aba Itens: itens do portfólio encontrados, com página. A proposta (Etapa D) virá depois.
import { analisarEdital, casarItens } from "../core/ia.js";
import { candidatosPara, nomeFamilia, historicoProduto } from "../core/casar.js";
import { iniciarPreco, piso, custoVencido, getCfg } from "../core/preco.js";
import { getRegras, iniciarRegras } from "./parametros.js";
import { store } from "../core/store.js";
import { ssel } from "../core/ssel.js";
import { podeEditar } from "../core/auth.js";
import { exportarExcel } from "../core/forms.js";
import { toast, icon, tag, vazio } from "../core/ui.js";
import { esc, fmt, fmtNum, fmtD } from "../core/utils.js";
import { copiarTexto } from "../core/regua.js";

let ultima = null, arquivos = [], ocupado = false, aba = "edital", modelo = "claude-haiku-5-5";
const MODELOS = [["claude-haiku-5-5", "Haiku — econômico (padrão)"], ["claude-sonnet-5-5", "Sonnet — mais preciso (~3× o custo)"]];
const NAO_LOC = /não localizado/i;

export default {
  id: "edital", titulo: "Analisar edital (IA)", grupo: "Licitações", icone: "bulb",
  render(el) {
    iniciarPreco(); iniciarRegras();
    el.innerHTML = `
      <div class="page-head"><h2>Analisar edital (IA)</h2><div class="actions" id="acoes"></div></div>
      <div class="card" id="entrada"><div class="card-body">
        <p class="muted" style="margin:0 0 10px;font-size:13px">Envie o edital e, se houver, o termo de referência e anexos (até 4 PDFs, 30 MB cada). A IA lê tudo no servidor e devolve as respostas com a cláusula/página. Nada é gravado: use para decidir se vale participar e quais itens cotar.</p>
        <label class="dropzone" id="dz" style="display:block">${icon("upload")} <span id="dz-txt">Clique para escolher os PDFs ou arraste aqui</span><input type="file" accept="application/pdf,.pdf" multiple hidden></label>
        <div id="lista" style="margin-top:10px"></div>
        <div style="display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap"><button class="btn btn-primary" id="btn-analisar" disabled>${icon("bulb")} Analisar edital</button><label class="field field-inline"><span>Modelo</span><select id="sel-modelo">${MODELOS.map(([v, t]) => `<option value="${v}" ${modelo === v ? "selected" : ""}>${t}</option>`).join("")}</select></label><span class="muted" id="progresso" style="font-size:13px"></span></div>
      </div></div>
      <div id="resultado" style="margin-top:16px"></div>`;
    const inp = el.querySelector("input[type=file]"), dz = el.querySelector("#dz"), btn = el.querySelector("#btn-analisar"), prog = el.querySelector("#progresso");
    const lista = () => { el.querySelector("#lista").innerHTML = arquivos.length ? `<div class="list">${arquivos.map((f, i) => `<div class="list-item"><div class="list-main"><div class="list-title">${esc(f.name)}</div><div class="list-sub">${(f.size / 1024 / 1024).toFixed(1)} MB</div></div><button class="icon-btn sm danger" data-rm="${i}" title="Remover">${icon("x")}</button></div>`).join("")}</div>` : ""; btn.disabled = !arquivos.length || ocupado; };
    const add = (files) => { for (const f of files) { if (arquivos.length >= 4) { toast("No máximo 4 PDFs.", "erro"); break; } if (!/\.pdf$/i.test(f.name)) { toast(`${f.name} não é PDF.`, "erro"); continue; } arquivos.push(f); } lista(); };
    inp.addEventListener("change", () => { add(inp.files); inp.value = ""; });
    dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("over"); }); dz.addEventListener("dragleave", () => dz.classList.remove("over"));
    dz.addEventListener("drop", (e) => { e.preventDefault(); dz.classList.remove("over"); add(e.dataTransfer.files); });
    el.querySelector("#lista").addEventListener("click", (e) => { const b = e.target.closest("[data-rm]"); if (b) { arquivos.splice(+b.dataset.rm, 1); lista(); } });
    el.querySelector("#sel-modelo").addEventListener("change", (e) => { modelo = e.target.value; });
    btn.addEventListener("click", async () => {
      ocupado = true; lista(); prog.textContent = "Preparando…";
      try { ultima = await analisarEdital(arquivos, { modelo, onProgresso: (t) => { prog.textContent = t; } }); ultima.arquivosNomes = arquivos.map((f) => f.name); prog.textContent = ""; toast("Análise concluída."); }
      catch (e) { prog.textContent = ""; toast(e.message, "erro", 8000); }
      ocupado = false; lista(); mostrar(el);
    });
    const agir = (act, id) => {
      if (act === "aba") { aba = id; mostrar(el); }
      if (act === "excel") exportarExcel((ultima.itens || []).map((i) => ({ Item: i.item, Lote: i.lote || "", "Descrição EDITAL": i.descricao, Unidade: i.unidade || "", Quantidade: i.quantidade ?? "", "Preço de Referência": i.precoReferencia ?? "", "ME/EPP": i.exclusivoMeEpp || "", "Marca ref.": i.marcaReferencia || "", Família: i.familia || "", Página: i.pagina ?? "" })), "Itens", "itens_edital");
      if (act === "copiar") copiarTexto(textoResumo(ultima)).then(() => toast("Resumo copiado."));
      if (act === "nova") { ultima = null; arquivos = []; lista(); mostrar(el); }
      if (act === "casar") casar(el);
      if (act === "excel-corr") exportarExcel(linhasCorr().map((x) => ({ Item: x.it.item, "Descrição EDITAL": x.it.descricao, Quantidade: x.it.quantidade ?? "", Unidade: x.it.unidade || "", "Preço de Referência": x.it.precoReferencia ?? "", "Nosso Item": x.p ? `${x.p.codigo} — ${x.p.nome}` : "", Custo: x.p?.custo ?? "", Piso: x.p ? +piso(x.p.custo).toFixed(2) : "", CONFIANÇA: x.c?.confianca || "", JUSTIFICATIVA: x.c?.justificativa || "", Observação: x.c?.observacao || "" })), "Correspondência", "cruzamento_rlux");
    };
    el.addEventListener("click", (e) => { const b = e.target.closest("#resultado [data-act], #acoes [data-act]"); if (b) agir(b.dataset.act, b.dataset.id); });
    lista(); mostrar(el);
  },
  destroy() {},
};

// Tira modalidade repetida e o processo do número ("Pregão Eletrônico nº 009/2026 (Processo nº 15…)" → "009/2026")
const numeroCurto = (n) => { let t = String(n || "").replace(/\(.*?\)/g, "").replace(/[-–—]\s*processo.*$/i, ""); t = t.replace(/^(preg[ãa]o\s*(eletr[ôo]nico|presencial)?|dispensa\s*(eletr[ôo]nica)?|concorr[êe]ncia|credenciamento|tomada de pre[çc]os)\s*/i, "").replace(/^n[º°.]?\s*/i, "").trim(); return t; };
const modalidadeCurta = (m) => { const t = String(m || ""); if (/preg[ãa]o/i.test(t)) return "Pregão Eletrônico"; if (/dispensa/i.test(t)) return "Dispensa Eletrônica"; if (/concorr/i.test(t)) return "Concorrência"; if (/credenc/i.test(t)) return "Credenciamento"; return t.split(/[(,–-]/)[0].trim() || "Licitação"; };
const sim = (t) => /^\s*sim/i.test(t || "") && !NAO_LOC.test(t || "");
function semaforo(r) {
  const R = r.resumo || {}; const vermelho = [], amarelo = [];
  if (sim(R.exigeAmostra)) vermelho.push("Exige amostra");
  if (!(r.itens || []).length) vermelho.push("Nenhum item do portfólio");
  if (R.multiplosEnderecos) amarelo.push("Múltiplos endereços de entrega");
  if (sim(R.garantiaContratual)) amarelo.push("Garantia contratual");
  (r.documentacaoEspecial || []).forEach((d) => amarelo.push(d.documento));
  if (vermelho.length) return { cor: "tag-red", txt: "Atenção antes de participar", lista: vermelho.concat(amarelo) };
  if (amarelo.length) return { cor: "tag-amber", txt: "Participar com cuidado", lista: amarelo };
  return { cor: "tag-green", txt: "Sem exigências incomuns", lista: [] };
}

function mostrar(el) {
  const box = el.querySelector("#resultado"), acoes = el.querySelector("#acoes"); if (!box) return;
  if (!ultima) { box.innerHTML = ""; acoes.innerHTML = ""; return; }
  const r = ultima, L = r.resumo || {}, s = semaforo(r), m = r.meta || {};
  acoes.innerHTML = `<button class="btn btn-ghost" data-act="copiar">${icon("file")} Copiar resumo</button><button class="btn btn-ghost" data-act="excel">${icon("download")} Excel dos itens</button><button class="btn btn-ghost" data-act="nova">${icon("plus")} Nova análise</button>`;
  const semTexto = (r.documentos || []).filter((d) => d.semTexto > 0);
  box.innerHTML = `
    <div class="card" style="margin-bottom:16px"><div class="card-body" style="display:flex;flex-wrap:wrap;gap:16px;align-items:center">
      <div style="flex:1;min-width:260px"><div style="font-size:16px;font-weight:600">${esc(modalidadeCurta(L.modalidade))}${numeroCurto(L.numero) ? " nº " + esc(numeroCurto(L.numero)) : ""}</div><div class="muted">${esc(L.orgao || "")}${L.uasg && !NAO_LOC.test(L.uasg) ? " · UASG " + esc(L.uasg) : ""}${L.municipio ? " · " + esc(L.municipio) + (L.estado ? "/" + esc(L.estado) : "") : L.estado ? " · " + esc(L.estado) : ""}${L.dataSessao ? " · sessão " + fmtD(L.dataSessao) + (L.horaSessao ? " " + esc(L.horaSessao) : "") : ""}</div></div>
      <div style="text-align:right;max-width:420px">${tag(s.txt, s.cor)}${s.lista.length ? `<ul class="muted" style="font-size:12px;margin:6px 0 0;padding-left:18px;text-align:left">${s.lista.slice(0, 4).map((x) => `<li>${esc(x.length > 90 ? x.slice(0, 87) + "…" : x)}</li>`).join("")}${s.lista.length > 4 ? `<li>+ ${s.lista.length - 4} — veja o alerta completo abaixo</li>` : ""}</ul>` : ""}</div>
    </div>
    ${semTexto.length ? `<div class="card-body" style="padding-top:0"><div class="info-box" style="border-color:var(--amber)"><div><div class="k">PDF lido por imagem — confira as referências</div>${semTexto.map((d) => `${esc(d.nome)}: ${d.semTexto} de ${d.paginas} páginas sem texto`).join(" · ")}</div></div></div>` : ""}</div>
    <div class="tabs"><button class="tab ${aba === "edital" ? "active" : ""}" data-act="aba" data-id="edital">Resumo do edital</button><button class="tab ${aba === "itens" ? "active" : ""}" data-act="aba" data-id="itens">Itens do portfólio (${(r.itens || []).length})</button><button class="tab ${aba === "corr" ? "active" : ""}" data-act="aba" data-id="corr">Correspondência${r.correspondencia ? ` (${r.correspondencia.filter((c) => c.produtoId).length}/${(r.itens || []).length})` : ""}</button></div>
    ${aba === "edital" ? abaEdital(r, L) : aba === "itens" ? abaItens(r) : abaCorr(r, el)}
    <p class="muted" style="font-size:11.5px;margin-top:12px">${esc(m.modelo || "")} · ${m.paginas || 0} página(s) · ${fmtNum((m.tokensEntrada || 0) + (m.tokensCache || 0))} tokens lidos · ${fmtNum(m.tokensSaida)} gerados${(r.documentos || []).some((d) => d.modo === "pdf") ? " · <strong>modo PDF (escaneado)</strong>" : ""} · ${m.segundos || 0}s${m.stopReason === "max_tokens" ? " · <strong style=\"color:var(--red)\">resposta truncada — edital muito extenso, divida os PDFs</strong>" : ""} · arquivos: ${esc((r.arquivosNomes || []).join(", "))}</p>`;
  if (aba === "corr") ligarCorr(el);
}

// ---------- Etapa C: correspondência ----------
let casando = false;
const linhasCorr = () => (ultima?.itens || []).map((it) => { const c = (ultima.correspondencia || []).find((x) => String(x.item) === String(it.item)); const p = c?.produtoId ? store.find("produtos", c.produtoId) : null; return { it, c, p }; });
async function casar(el) {
  if (!ultima || casando) return; casando = true; mostrar(el);
  try {
    const itens = ultima.itens.map((it) => { const { familia, candidatos } = candidatosPara(it); return { item: it.item, descricao: it.descricao, unidade: it.unidade, quantidade: it.quantidade, marcaReferencia: it.marcaReferencia, familia, candidatos }; });
    const r = await casarItens(itens, { regras: getRegras(), modelo });
    ultima.correspondencia = (r.itens || []).map((c) => ({ ...c, item: String(c.item) })); ultima.metaCorr = r.meta; ultima.candidatosEnviados = itens.reduce((s, i) => s + i.candidatos.length, 0);
    toast("Correspondência concluída.");
  } catch (e) { toast(e.message, "erro", 8000); }
  casando = false; mostrar(el);
}
function abaCorr(r) {
  const L = r.resumo || {}; const linhas = linhasCorr(); const tem = !!r.correspondencia;
  const CONF = { alta: "tag-green", media: "tag-amber", baixa: "tag-orange", nenhuma: "tag-red" };
  if (!tem) return `<div class="card"><div class="card-body" style="text-align:center;padding:36px"><p class="muted" style="margin:0 0 14px">Para cada item do edital, o sistema separa os produtos da mesma família e a IA escolhe o mais aderente, aplicando as regras de <strong>Parâmetros</strong>. Você confirma ou troca.</p><button class="btn btn-primary" data-act="casar" ${casando || !r.itens?.length ? "disabled" : ""}>${icon("bulb")} ${casando ? "Casando itens…" : `Casar ${r.itens?.length || 0} item(ns) com o cadastro`}</button></div></div>`;
  const m = r.metaCorr || {};
  return `
    <div class="card"><div class="card-head"><h2>Correspondência item → produto RLUX</h2><div style="display:flex;gap:8px"><button class="btn btn-ghost btn-sm" data-act="excel-corr">${icon("download")} Excel</button><button class="btn btn-ghost btn-sm" data-act="casar" ${casando ? "disabled" : ""}>${icon("refresh")} Refazer</button></div></div>
    <div class="card-body flush"><div class="table-wrap"><table><thead><tr><th>Item</th><th style="min-width:260px">Descrição no edital</th><th style="min-width:300px">Nosso produto</th><th>Conf.</th><th class="num">Custo</th><th class="num">Piso</th><th class="num">Ref. edital</th><th>Histórico</th></tr></thead><tbody>
    ${linhas.map(({ it, c, p }) => { const h = p ? historicoProduto(p.id, L.orgao) : {}; const ref = it.precoReferencia; const ps = p ? piso(p.custo) : null;
      return `<tr data-item="${esc(it.item)}"><td><strong>${esc(it.item)}</strong>${it.quantidade != null ? `<div class="muted" style="font-size:11px">${fmtNum(it.quantidade)} ${esc(it.unidade || "")}</div>` : ""}</td>
        <td style="font-size:12.5px">${esc(it.descricao)}</td>
        <td><div class="corr-ssel" data-item="${esc(it.item)}"></div><div class="muted" style="font-size:11.5px;margin-top:3px">${esc(c?.justificativa || "")}${c?.observacao ? ` <span style="color:var(--amber-txt)">· ${esc(c.observacao)}</span>` : ""}</div></td>
        <td>${tag(c?.confianca || "nenhuma", CONF[c?.confianca] || "tag-red")}</td>
        <td class="num">${p ? `${fmt(p.custo)}${custoVencido(p) ? `<div style="font-size:10.5px;color:var(--red)">custo vencido</div>` : ""}` : "—"}</td>
        <td class="num"><strong>${ps != null ? fmt(ps) : "—"}</strong></td>
        <td class="num" style="${ref != null && ps != null && ref < ps ? "color:var(--red);font-weight:600" : ""}">${ref != null ? fmt(ref) : "—"}${ref != null && ps != null && ref < ps ? `<div style="font-size:10.5px">abaixo do piso</div>` : ""}</td>
        <td class="muted" style="font-size:11.5px">${h.orgao ? `Neste órgão: <strong>${fmt(h.orgao.preco)}</strong> (${fmtD(h.orgao.data)})<br>` : ""}${h.geral ? `Último: ${fmt(h.geral.preco)} · ${esc(h.geral.licit || "")}` : (p ? "sem histórico" : "")}</td></tr>`; }).join("")}
    </tbody></table></div></div></div>
    <p class="muted" style="font-size:11.5px;margin-top:8px">${esc(m.modelo || "")} · ${fmtNum(m.tokensEntrada)} tokens lidos · ${fmtNum(m.tokensSaida)} gerados · ${m.segundos || 0}s · ${r.candidatosEnviados || 0} candidato(s) enviados · piso = custo ÷ ${(1 - (getCfg().simples + getCfg().fretePct + getCfg().lucroMin) / 100).toFixed(4)}</p>`;
}
function ligarCorr(el) {
  const opcoes = store.get("produtos").map((p) => ({ id: p.id, label: `${p.codigo} — ${p.nome}`, sub: p.descricaoTecnica || "", extra: p.marca })).sort((a, b) => a.label.localeCompare(b.label));
  el.querySelectorAll(".corr-ssel").forEach((host) => { const item = host.dataset.item; const c = (ultima.correspondencia || []).find((x) => x.item === item);
    const sel = ssel(host, { placeholder: "Nenhum produto — buscar…", itens: opcoes, value: c?.produtoId || "", disabled: !podeEditar(), onSelect: (id) => { const cc = (ultima.correspondencia ||= []).find((x) => x.item === item); if (cc) { cc.produtoId = id; cc.confianca = id ? "alta" : "nenhuma"; cc.justificativa = id ? "Escolhido manualmente" : "Sem produto"; } else ultima.correspondencia.push({ item, produtoId: id, confianca: "alta", justificativa: "Escolhido manualmente" }); mostrar(el); } });
    if (!c?.produtoId && c?.alternativas?.length) sel.enable(`Sugestões: ${c.alternativas.map((id) => store.find("produtos", id)?.codigo).filter(Boolean).join(", ")} — buscar…`); });
}

function abaEdital(r, L) {
  const linha = (k, v, base) => `<tr><td style="width:220px"><strong>${k}</strong></td><td style="${NAO_LOC.test(v || "") ? "color:var(--muted)" : ""}">${esc(v || "—")}</td><td class="muted" style="font-size:12px;width:240px">${esc(base || "")}</td></tr>`;
  const entrega = `${L.entrega || "—"}${L.multiplosEnderecos ? " — múltiplos endereços" : ""}${L.entregaDetalhe ? ` (${L.entregaDetalhe})` : ""}`;
  const extras = [L.criterioJulgamento ? `Julgamento: ${L.criterioJulgamento}` : "", L.srp === true ? "Registro de preços" : L.srp === false ? "Não é registro de preços" : "", L.valorEstimado ? `Valor estimado: ${L.valorEstimado}` : ""].filter(Boolean);
  return `
    <div class="card" style="margin-bottom:16px"><div class="card-head"><h2>Resumo</h2>${extras.length ? `<span class="muted" style="font-size:12.5px">${esc(extras.join(" · "))}</span>` : ""}</div><div class="card-body flush"><div class="table-wrap"><table><thead><tr><th>Campo</th><th>Resposta</th><th>Base no edital</th></tr></thead><tbody>
      ${linha("Órgão", `${L.orgao || "—"}${L.uasg && !NAO_LOC.test(L.uasg) ? ` (UASG ${L.uasg})` : ""}`)}
      ${linha("Nº do pregão / dispensa", `${modalidadeCurta(L.modalidade)} ${numeroCurto(L.numero) || ""}`)}
      ${linha("Município / UF", [L.municipio, L.estado].filter(Boolean).join(" / "))}
      ${linha("Validade da proposta", L.validadeProposta, L.validadeBase)}
      ${linha("Exige amostra", L.exigeAmostra, L.amostraBase)}
      ${linha("Endereço de entrega", entrega, L.entregaBase)}
      ${linha("Garantia contratual", L.garantiaContratual, L.garantiaBase)}
    </tbody></table></div></div></div>
    ${(r.documentacaoEspecial || []).length ? `<div class="card" style="margin-bottom:16px;border-left:3px solid var(--red)"><div class="card-head"><h2>Documentação especial (risco de inabilitação)</h2></div><div class="card-body flush"><div class="table-wrap"><table><thead><tr><th>Documento</th><th style="width:140px">Fase</th><th style="width:220px">Cláusula</th></tr></thead><tbody>
      ${r.documentacaoEspecial.map((d) => `<tr><td><strong>${esc(d.documento)}</strong></td><td>${esc(d.fase || "")}</td><td class="muted" style="font-size:12px">${esc(d.clausula || "")}${d.pagina ? ` · pág. ${d.pagina}` : ""}</td></tr>`).join("")}</tbody></table></div></div></div>` : ""}
    ${(r.observacoes || []).length ? `<div class="card"><div class="card-head"><h2>Observações</h2></div><div class="card-body"><ul style="margin:0;padding-left:18px;font-size:13.5px">${r.observacoes.map((o) => `<li>${esc(o)}</li>`).join("")}</ul></div></div>` : ""}`;
}

function abaItens(r) {
  const itens = r.itens || [], aud = r.auditoria || [];
  const total = itens.reduce((s, i) => s + (i.quantidade || 0) * (i.precoReferencia || 0), 0);
  return `
    ${aud.length ? `<div class="info-box" style="margin-bottom:12px;border-color:var(--amber)"><div><div class="k">Ocorrências não classificadas — confira se são itens licitados</div>${aud.map((a) => `${esc(a.familia)}: “${esc(a.termo)}” na pág. ${a.pagina}`).join(" · ")}</div></div>` : ""}
    <div class="card"><div class="card-head"><h2>Itens das famílias RLUX</h2>${total ? `<span class="muted">Referência total: <strong>${fmt(total)}</strong></span>` : ""}</div><div class="card-body flush">
      ${itens.length ? `<div class="table-wrap"><table><thead><tr><th>Item</th><th>Descrição no edital</th><th>Un.</th><th class="num">Qtd</th><th class="num">Ref. unit.</th><th class="num">Ref. total</th><th>ME/EPP</th><th>Família</th><th>Pág.</th></tr></thead><tbody>
      ${itens.map((i) => `<tr><td><strong>${esc(i.item)}</strong>${i.lote ? `<div class="muted" style="font-size:11px">Lote ${esc(i.lote)}</div>` : ""}</td><td style="max-width:420px">${esc(i.descricao)}${i.marcaReferencia ? `<div class="muted" style="font-size:11px">Ref.: ${esc(i.marcaReferencia)}${i.aceitaSimilar ? " (ou similar)" : ""}</div>` : ""}</td><td>${esc(i.unidade || "—")}</td><td class="num">${i.quantidade != null ? fmtNum(i.quantidade) : "—"}</td><td class="num">${i.precoReferencia != null ? fmt(i.precoReferencia) : "—"}</td><td class="num">${i.quantidade != null && i.precoReferencia != null ? fmt(i.quantidade * i.precoReferencia) : "—"}</td><td>${i.exclusivoMeEpp ? tag(i.exclusivoMeEpp, "tag-purple") : ""}</td><td class="muted" style="font-size:12px">${esc(i.familia || "")}</td><td class="muted">${i.pagina || ""}</td></tr>`).join("")}</tbody></table></div>` : vazio("Nenhum item das famílias RLUX neste edital")}
    </div></div>`;
}

function textoResumo(r) {
  const L = r.resumo || {};
  return [`${L.orgao || ""}${L.uasg && !NAO_LOC.test(L.uasg) ? " (UASG " + L.uasg + ")" : ""}`, `${modalidadeCurta(L.modalidade)} nº ${numeroCurto(L.numero) || "—"} — ${[L.municipio, L.estado].filter(Boolean).join("/")}`, L.dataSessao ? `Sessão: ${fmtD(L.dataSessao)} ${L.horaSessao || ""}` : "", "",
    `Validade da proposta: ${L.validadeProposta || "—"}${L.validadeBase ? ` [${L.validadeBase}]` : ""}`, `Exige amostra: ${L.exigeAmostra || "—"}${L.amostraBase ? ` [${L.amostraBase}]` : ""}`,
    `Entrega: ${L.entrega || "—"}${L.multiplosEnderecos ? " — múltiplos endereços" : ""}${L.entregaDetalhe ? ` (${L.entregaDetalhe})` : ""}${L.entregaBase ? ` [${L.entregaBase}]` : ""}`, `Garantia contratual: ${L.garantiaContratual || "—"}${L.garantiaBase ? ` [${L.garantiaBase}]` : ""}`, "",
    (r.documentacaoEspecial || []).length ? "DOCUMENTAÇÃO ESPECIAL:\n" + r.documentacaoEspecial.map((d) => `- ${d.documento} (${d.fase}${d.clausula ? ", " + d.clausula : ""}${d.pagina ? ", pág. " + d.pagina : ""})`).join("\n") : "",
    (r.itens || []).length ? `\nITENS (${r.itens.length}):\n` + r.itens.map((i) => `${i.item} | ${i.descricao} | ${i.quantidade ?? ""} ${i.unidade || ""} | ${i.precoReferencia != null ? fmt(i.precoReferencia) : ""}`).join("\n") : "",
  ].filter((x) => x !== null).join("\n");
}

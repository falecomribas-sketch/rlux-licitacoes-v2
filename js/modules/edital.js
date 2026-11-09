// Analisar edital (IA) — Etapa A: leitura do edital e dos anexos, sem gravar nada no banco.
// Aba Resumo: 7 campos (órgão, nº, município/UF, validade, amostra, entrega, garantia) com base, documentação especial, observações.
// Aba Itens: itens do portfólio encontrados, com página. A proposta (Etapa D) virá depois.
import { analisarEdital, casarItens } from "../core/ia.js";
import { candidatosPara, nomeFamilia, historicoProduto } from "../core/casar.js";
import { iniciarPreco, piso, pisoComFreteMin, custoVencido, getCfg } from "../core/preco.js";
import { getRegras, iniciarRegras, getPrompts, iniciarPrompts } from "./parametros.js";
import { store } from "../core/store.js";
import { ssel } from "../core/ssel.js";
import { podeEditar, currentUser } from "../core/auth.js";
import { formModal, lerForm, campo, inputTxt, inputNum, inputData, select, linha, exportarExcel, exportarExcelFormatado, abrirExcel, salvarWorkbook, XL, UFS } from "../core/forms.js";
import { newId } from "../core/store.js";
import { navigate } from "../core/router.js";
import { opcoesOrgaos, TIPOS } from "./licitacoes.js";
import { toTitleCase } from "../core/utils.js";
import { toast, icon, tag, vazio, closeModal, confirmar } from "../core/ui.js";
import { esc, fmt, fmtNum, fmtD } from "../core/utils.js";
import { copiarTexto } from "../core/regua.js";

let ultima = null, arquivos = [], ocupado = false, aba = "edital", modelo = "claude-haiku-5-5";
const MODELOS = [["claude-haiku-5-5", "Haiku — econômico (padrão)"], ["claude-sonnet-5-5", "Sonnet — mais preciso (~3× o custo)"]];
const NAO_LOC = /não localizado/i;

export default {
  id: "edital", titulo: "Analisar edital (IA)", grupo: "Licitações", icone: "bulb",
  render(el) {
    iniciarPreco(); iniciarRegras(); iniciarPrompts();
    el.innerHTML = `
      <div class="page-head"><h2>Analisar edital (IA)</h2><div class="actions" id="acoes"></div></div>
      <div class="card" id="entrada"><div class="card-body">
        <p class="muted" style="margin:0 0 10px;font-size:13px">Envie o edital e, se houver, o termo de referência e anexos (até 4 PDFs, 30 MB cada). A IA lê tudo no servidor e devolve as respostas com a cláusula/página. Nada é gravado: use para decidir se vale participar e quais itens cotar.</p>
        <label class="dropzone" id="dz" style="display:block">${icon("upload")} <span id="dz-txt">Clique para escolher os PDFs ou arraste aqui</span><input type="file" accept="application/pdf,.pdf" multiple hidden></label>
        <div id="lista" style="margin-top:10px"></div>
        <div style="display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap"><button class="btn btn-primary" id="btn-analisar" disabled>${icon("bulb")} Analisar edital</button><label class="field field-inline"><span>Modelo</span><select id="sel-modelo">${MODELOS.map(([v, t]) => `<option value="${v}" ${modelo === v ? "selected" : ""}>${t}</option>`).join("")}</select></label><span class="muted" id="progresso" style="font-size:13px"></span></div>
      </div></div>
      <div id="resultado" style="margin-top:16px"></div>
      <div class="card" id="historico" style="margin-top:16px"></div>`;
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
      try { ultima = await analisarEdital(arquivos, { modelo, prompt: getPrompts().analise, onProgresso: (t) => { prog.textContent = t; } }); ultima.arquivosNomes = arquivos.map((f) => f.name); ultima.criadoEm = new Date().toISOString(); ultima.usuario = currentUser?.email || ""; await salvarAnalise(); prog.textContent = ""; toast("Análise concluída."); }
      catch (e) { prog.textContent = ""; toast(e.message, "erro", 8000); }
      ocupado = false; lista(); mostrar(el);
    });
    const agir = (act, id) => {
      if (act === "aba") { aba = id; mostrar(el); }
      if (act === "excel") exportarExcel((ultima.itens || []).map((i) => ({ Item: i.item, Lote: i.lote || "", "Descrição EDITAL": i.descricao, Unidade: i.unidade || "", Quantidade: i.quantidade ?? "", "Preço de Referência": i.precoReferencia ?? "", "ME/EPP": i.exclusivoMeEpp || "", "Marca ref.": i.marcaReferencia || "", Família: i.familia || "", Página: i.pagina ?? "" })), "Itens", "itens_edital");
      if (act === "copiar") copiarTexto(textoResumo(ultima)).then(() => toast("Resumo copiado."));
      if (act === "nova") { ultima = null; arquivos = []; lista(); mostrar(el); }
      if (act === "casar") casar(el);
      if (act === "nova-licitacao") novaLicitacao(el);
      if (act === "disputa") { const inp = el.querySelector("#disputa-file"); if (inp) { inp.onchange = () => { if (inp.files[0]) preencherDisputa(inp.files[0]); inp.value = ""; }; inp.click(); } }
      if (act === "effecti") { const inp = el.querySelector("#effecti-file"); if (inp) { inp.onchange = () => { if (inp.files[0]) preencherEffecti(inp.files[0]); inp.value = ""; }; inp.click(); } }
      if (act === "excel-corr") { const ls = linhasCorr(); const CONF = { alta: "ALTA", media: "MÉDIA", baixa: "BAIXA", nenhuma: "—" };
        exportarExcelFormatado([
          { nome: "ITENS_ENCONTRADOS", colunas: [{ chave: "item", titulo: "ITEM", largura: 7 }, { chave: "desc", titulo: "Descrição EDITAL", largura: 60 }, { chave: "qtd", titulo: "Quantidade", largura: 12 }, { chave: "ref", titulo: "Preço de Referência", largura: 18, moeda: true }, { chave: "nosso", titulo: "Nosso Item", largura: 45 }, { chave: "junto", titulo: "JUNTO", largura: 26 }, { chave: "custo", titulo: "Custo", largura: 12, moeda: true }, { chave: "piso", titulo: "Piso de venda", largura: 14, moeda: true }, { chave: "conf", titulo: "CONFIANÇA", largura: 12 }, { chave: "just", titulo: "JUSTIFICATIVA", largura: 60 }, { chave: "obs", titulo: "Observação", largura: 40 }],
            rows: ls.filter((x) => x.p).map((x) => ({ item: x.it.item, desc: x.it.descricao, qtd: `${x.it.quantidade ?? ""} ${x.it.unidade || ""}`.trim(), ref: x.it.precoReferencia ?? "", nosso: x.p.nome, junto: `${x.p.marca || ""} / ${x.p.codigo}`, custo: x.p.custo ?? "", piso: +piso(x.p.custo).toFixed(2), conf: CONF[x.c?.confianca] || "", just: x.c?.justificativa || "", obs: x.c?.observacao || "" })) },
          { nome: "ITENS_NAO_LOCALIZADOS", colunas: [{ chave: "item", titulo: "ITEM", largura: 7 }, { chave: "desc", titulo: "Descrição EDITAL", largura: 60 }, { chave: "qtd", titulo: "Quantidade", largura: 12 }, { chave: "motivo", titulo: "MOTIVO", largura: 50 }],
            rows: ls.filter((x) => !x.p).map((x) => ({ item: x.it.item, desc: x.it.descricao, qtd: `${x.it.quantidade ?? ""} ${x.it.unidade || ""}`.trim(), motivo: x.c?.justificativa || "Sem candidato na família" })) },
        ], "RESULTADO_CRUZAMENTO_RLUX"); }
    };
    el.addEventListener("click", (e) => { const b = e.target.closest("#resultado [data-act], #acoes [data-act]"); if (b) agir(b.dataset.act, b.dataset.id); });
    el.querySelector("#historico").addEventListener("click", async (e) => {
      const x = e.target.closest("[data-excluir]");
      if (x) { const a = store.find("analises", x.dataset.excluir); if (!a) return; if (!await confirmar(`Excluir a análise de ${modalidadeCurta(a.resumo?.modalidade)} ${numeroCurto(a.resumo?.numero) || ""}?${a.criada ? " A licitação e a proposta criadas a partir dela continuam existindo." : ""}`, { ok: "Excluir", perigo: true })) return; await store.remove("analises", a.id); if (ultima?.id === a.id) { ultima = null; mostrar(el); } toast("Análise excluída."); return; }
      const b = e.target.closest("[data-abrir]"); if (!b) return; const a = store.find("analises", b.dataset.abrir); if (!a) return; ultima = JSON.parse(JSON.stringify(a)); aba = "edital"; mostrar(el); window.scrollTo({ top: 0, behavior: "smooth" }); });
    const hist = () => historico(el); hist(); unsubH = store.on("analises", hist);
    lista(); mostrar(el);
  },
  destroy() { unsubH?.(); unsubH = null; },
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
  acoes.innerHTML = `<button class="btn btn-ghost" data-act="copiar">${icon("file")} Copiar resumo</button><button class="btn btn-ghost" data-act="excel">${icon("download")} Excel dos itens</button><button class="btn btn-ghost" data-act="nova">${icon("plus")} Nova análise</button>${r.correspondencia && podeEditar() && !r.criada ? `<button class="btn btn-primary" data-act="nova-licitacao">${icon("plus")} Nova licitação</button>` : ""}${r.criada ? `<a class="btn btn-primary" href="#propostas">${icon("doc")} Ver proposta #${r.criada.num}</a>` : ""}`;
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
let casando = false, unsubH = null;
async function salvarAnalise() {
  if (!ultima) return; if (!ultima.id) ultima.id = newId();
  const { arquivosNomes, ...dados } = ultima; // tudo é serializável (sem File)
  try { await store.setItem("analises", { ...dados, arquivosNomes: arquivosNomes || [], atualizadoEm: new Date().toISOString() }); } catch (e) { console.error(e); toast("Não consegui gravar a análise (ela continua na tela).", "erro"); }
}
function historico(el) {
  const box = el.querySelector("#historico"); if (!box) return;
  const lst = store.get("analises").slice().sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || "")).slice(0, 40);
  box.innerHTML = `<div class="card-head"><h2>Análises recentes</h2><span class="muted" style="font-size:12px">${lst.length} de ${store.get("analises").length}</span></div>` + (lst.length ? `<div class="card-body flush"><div class="table-wrap"><table><thead><tr><th>Data</th><th>Licitação</th><th>Órgão</th><th class="num">Itens</th><th>Correspondência</th><th>Situação</th><th></th></tr></thead><tbody>
    ${lst.map((a) => { const L = a.resumo || {}; const n = (a.itens || []).length, c = (a.correspondencia || []).filter((x) => x.produtoId).length;
      return `<tr class="${ultima?.id === a.id ? "row-active" : ""}"><td>${fmtD((a.criadoEm || "").slice(0, 10))}<div class="muted" style="font-size:11px">${esc((a.usuario || "").split("@")[0])}</div></td><td><strong>${esc(modalidadeCurta(L.modalidade))} ${esc(numeroCurto(L.numero) || "—")}</strong>${L.dataSessao ? `<div class="muted" style="font-size:11px">sessão ${fmtD(L.dataSessao)}</div>` : ""}</td><td>${esc((L.orgao || "—").slice(0, 50))}<div class="muted" style="font-size:11px">${esc([L.municipio, L.estado].filter(Boolean).join("/"))}</div></td><td class="num">${n}</td><td>${a.correspondencia ? tag(`${c}/${n}`, c === n && n ? "tag-green" : "tag-amber") : `<span class="muted">—</span>`}</td><td>${a.criada ? tag(`Proposta #${a.criada.num}`, "tag-teal") : n ? tag("Analisado", "tag-blue") : tag("Sem itens", "tag-gray")}</td><td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-abrir="${esc(a.id)}">Abrir</button> <button class="btn btn-ghost btn-sm btn-icon" data-excluir="${esc(a.id)}" title="Excluir análise">${icon("trash")}</button></td></tr>`; }).join("")}
  </tbody></table></div></div>` : `<div class="card-body"><p class="muted" style="margin:0;font-size:13px">As análises feitas a partir de agora ficam guardadas aqui.</p></div>`);
}
const linhasCorr = () => (ultima?.itens || []).map((it) => { const c = (ultima.correspondencia || []).find((x) => String(x.item) === String(it.item)); const p = c?.produtoId ? store.find("produtos", c.produtoId) : null; return { it, c, p }; });
async function casar(el) {
  if (!ultima || casando) return; casando = true; mostrar(el);
  try {
    const itens = ultima.itens.map((it) => { const { familia, candidatos } = candidatosPara(it); return { item: it.item, descricao: it.descricao, unidade: it.unidade, quantidade: it.quantidade, marcaReferencia: it.marcaReferencia, familia, candidatos }; });
    const r = await casarItens(itens, { regras: getRegras(), modelo, prompt: getPrompts().casar });
    ultima.correspondencia = (r.itens || []).map((c) => ({ ...c, item: String(c.item) })); ultima.metaCorr = r.meta; ultima.candidatosEnviados = itens.reduce((s, i) => s + i.candidatos.length, 0);
    await salvarAnalise(); toast("Correspondência concluída.");
  } catch (e) { toast(e.message, "erro", 8000); }
  casando = false; mostrar(el);
}
function abaCorr(r) {
  const L = r.resumo || {}; const linhas = linhasCorr(); const tem = !!r.correspondencia;
  const CONF = { alta: "tag-green", media: "tag-amber", baixa: "tag-orange", nenhuma: "tag-red" };
  if (!tem) return `<div class="card"><div class="card-body" style="text-align:center;padding:36px"><p class="muted" style="margin:0 0 14px">Para cada item do edital, o sistema separa os produtos da mesma família e a IA escolhe o mais aderente, aplicando as regras de <strong>Parâmetros</strong>. Você confirma ou troca.</p><button class="btn btn-primary" data-act="casar" ${casando || !r.itens?.length ? "disabled" : ""}>${icon("bulb")} ${casando ? "Casando itens…" : `Casar ${r.itens?.length || 0} item(ns) com o cadastro`}</button></div></div>`;
  const m = r.metaCorr || {};
  return `
    <div class="card"><div class="card-head"><h2>Correspondência item → produto RLUX</h2><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" data-act="effecti" title="Sobe a planilha exportada da Effecti e devolve preenchida">${icon("upload")} Preencher planilha da Effecti</button><input type="file" id="effecti-file" accept=".xlsx,.xls" hidden><button class="btn btn-ghost btn-sm" data-act="disputa" title="Sobe a planilha de disputa da Effecti e devolve com o Valor limite = lance mínimo (piso)">${icon("upload")} Preencher lance mínimo (disputa)</button><input type="file" id="disputa-file" accept=".xlsx,.xls" hidden><button class="btn btn-ghost btn-sm" data-act="excel-corr">${icon("download")} Excel</button><button class="btn btn-ghost btn-sm" data-act="casar" ${casando ? "disabled" : ""}>${icon("refresh")} Refazer</button></div></div>
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
    ${podeEditar() && !r.criada ? `<div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn btn-primary" data-act="nova-licitacao">${icon("plus")} Nova licitação — criar licitação e proposta com estes itens</button></div>` : r.criada ? `<div class="info-box" style="margin-top:12px"><div><div class="k">Criado</div>Licitação ${esc(r.criada.numero)} e proposta #${r.criada.num} (rascunho gerado por IA). <a href="#propostas">Abrir Propostas</a></div></div>` : ""}
    <p class="muted" style="font-size:11.5px;margin-top:8px">${esc(m.modelo || "")} · ${fmtNum(m.tokensEntrada)} tokens lidos · ${fmtNum(m.tokensSaida)} gerados · ${m.segundos || 0}s · ${r.candidatosEnviados || 0} candidato(s) enviados · piso = custo ÷ ${(1 - (getCfg().simples + getCfg().fretePct + getCfg().lucroMin) / 100).toFixed(4)}</p>`;
}
function ligarCorr(el) {
  const opcoes = store.get("produtos").map((p) => ({ id: p.id, label: `${p.codigo} — ${p.nome}`, sub: p.descricaoTecnica || "", extra: p.marca })).sort((a, b) => a.label.localeCompare(b.label));
  el.querySelectorAll(".corr-ssel").forEach((host) => { const item = host.dataset.item; const c = (ultima.correspondencia || []).find((x) => x.item === item);
    const sel = ssel(host, { placeholder: "Nenhum produto — buscar…", itens: opcoes, value: c?.produtoId || "", disabled: !podeEditar(), onSelect: (id) => { const cc = (ultima.correspondencia ||= []).find((x) => x.item === item); if (cc) { cc.produtoId = id; cc.confianca = id ? "alta" : "nenhuma"; cc.justificativa = id ? "Escolhido manualmente" : "Sem produto"; } else ultima.correspondencia.push({ item, produtoId: id, confianca: "alta", justificativa: "Escolhido manualmente" }); salvarAnalise(); mostrar(el); } });
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

// ---------- Etapa D: "Nova licitação" — cria órgão (se preciso), licitação e proposta-rascunho ----------
const normTxt = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
function acharOrgao(L) {
  const orgs = store.get("orgaos"); const uasg = String(L.uasg || "").replace(/\D/g, "");
  if (uasg && !NAO_LOC.test(L.uasg || "")) { const o = orgs.find((x) => String(x.uasg || "").replace(/\D/g, "") === uasg); if (o) return o; }
  const n = normTxt(L.orgao); if (!n) return null;
  return orgs.find((x) => normTxt(x.nome) === n) || orgs.find((x) => { const m = normTxt(x.nome); return m.length > 12 && (n.includes(m) || m.includes(n)) && (!L.estado || !x.estado || x.estado === L.estado); }) || null;
}
function precoInicial(it, p, L) {
  const cfg = getCfg(); const ps = p ? piso(p.custo) : 0;
  if (it.precoReferencia != null && it.precoReferencia > 0) return { preco: +(it.precoReferencia * (1 - (cfg.descontoRef || 0) / 100)).toFixed(2), origem: "referência do edital", abaixoPiso: it.precoReferencia < ps };
  const h = p ? historicoProduto(p.id, L.orgao) : {};
  if (h.orgao?.preco) return { preco: +Math.max(h.orgao.preco, ps).toFixed(2), origem: "último preço neste órgão", abaixoPiso: h.orgao.preco < ps };
  if (h.geral?.preco) return { preco: +Math.max(h.geral.preco, ps).toFixed(2), origem: "último preço praticado", abaixoPiso: h.geral.preco < ps };
  return { preco: +(ps * 1.15).toFixed(2), origem: "piso + 15% (sem referência nem histórico)", abaixoPiso: false };
}
function novaLicitacao(el) {
  const r = ultima; if (!r) return; const L = r.resumo || {}; const linhas = linhasCorr().filter((x) => x.p);
  if (!linhas.length) return toast("Nenhum item com produto escolhido. Casar os itens primeiro.", "erro");
  const orgaoEx = acharOrgao(L); const portais = store.get("portais");
  const portalIni = portais.find((pt) => normTxt(L.portal || "").includes(normTxt(pt.sigla)) || (pt.nome && normTxt(L.portal || "").includes(normTxt(pt.nome))))?.id || "";
  const tipoIni = TIPOS.find((t) => normTxt(t) === normTxt(modalidadeCurta(L.modalidade))) || TIPOS[0];
  const precos = linhas.map(({ it, p }) => precoInicial(it, p, L));
  let orgSel;
  formModal({
    titulo: "Nova licitação a partir da análise", largura: "xl", salvarTexto: "Criar licitação e proposta",
    corpo: `
      <div class="form-section">Órgão</div>
      ${orgaoEx ? `<div class="info-box"><div><div class="k">Órgão já cadastrado</div><strong>${esc(toTitleCase(orgaoEx.nome))}</strong>${orgaoEx.uasg ? " · UASG " + esc(orgaoEx.uasg) : ""}${orgaoEx.municipio ? " · " + esc(orgaoEx.municipio) + "/" + esc(orgaoEx.estado || "") : ""}</div></div><input type="hidden" name="orgaoId" value="${esc(orgaoEx.id)}">`
        : `<div class="info-box" style="border-color:var(--amber)"><div><div class="k">Órgão não encontrado no cadastro</div>Será criado com os dados abaixo — ou escolha um existente.</div></div>
           ${linha(`<div class="field"><span>Usar órgão existente (opcional)</span><div id="org-ssel"></div></div>`)}
           ${linha(campo("Nome do órgão", inputTxt("orgaoNome", L.orgao || "")), campo("UASG", inputTxt("orgaoUasg", NAO_LOC.test(L.uasg || "") ? "" : L.uasg || "")), campo("Município", inputTxt("orgaoMunicipio", L.municipio || "")), campo("UF", select("orgaoEstado", [["", "—"], ...UFS.map((u) => [u, u])], L.estado || "")))}`}
      <div class="form-section">Licitação</div>
      ${linha(campo("Tipo", select("tipo", TIPOS, tipoIni)), campo("Número", inputTxt("numero", numeroCurto(L.numero) || "", "required")), campo("Data da sessão", inputData("data", L.dataSessao || "")), campo("Portal", select("portalId", [["", "—"], ...portais.map((pt) => [pt.id, pt.sigla])], portalIni)))}
      <div class="form-section">Proposta inicial — ${linhas.length} item(ns) <span class="muted" style="font-weight:400">preço = referência do órgão; sem referência, histórico; sem histórico, piso + 15%. Ajuste aqui ou depois em Propostas.</span></div>
      <div class="table-wrap"><table><thead><tr><th>Item</th><th>Produto</th><th class="num">Qtd</th><th class="num">Custo</th><th class="num">Piso</th><th style="width:130px">Preço</th><th>Origem do preço</th></tr></thead><tbody>
        ${linhas.map(({ it, p, c }, i) => `<tr data-i="${i}"><td><strong>${esc(it.item)}</strong><div class="muted" style="font-size:11px;max-width:220px">${esc(it.descricao.slice(0, 70))}</div></td><td>${esc(p.codigo)} — ${esc(p.nome)}${c?.observacao ? `<div style="font-size:11px;color:var(--amber-txt)">${esc(c.observacao)}</div>` : ""}</td><td class="num"><input type="number" class="input input-sm" name="qtd_${i}" value="${it.quantidade ?? 1}" step="any" style="width:90px"></td><td class="num">${fmt(p.custo)}</td><td class="num">${fmt(piso(p.custo))}</td><td><input type="number" class="input input-sm" name="preco_${i}" value="${precos[i].preco}" step="0.01" style="width:120px"></td><td class="muted" style="font-size:11.5px">${esc(precos[i].origem)}${precos[i].abaixoPiso ? ` <span style="color:var(--red)">· abaixo do piso</span>` : ""}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="muted" style="font-size:12px;margin-top:8px">A proposta nasce com status "Em Andamento" e marcada como gerada por IA. Nada muda em registros existentes.</p>`,
    onAberto(form) { const host = form.querySelector("#org-ssel"); if (host) orgSel = ssel(host, { placeholder: "Buscar órgão cadastrado…", itens: opcoesOrgaos(), value: "", onSelect: () => {} }); },
    async onSalvar(form) {
      const v = lerForm(form); if (!v.numero.trim()) throw new Error("Informe o número da licitação.");
      let orgaoId = v.orgaoId || orgSel?.value || "";
      if (!orgaoId) { if (!v.orgaoNome?.trim()) throw new Error("Informe o nome do órgão ou escolha um existente."); orgaoId = newId(); await store.setItem("orgaos", { id: orgaoId, nome: v.orgaoNome.trim(), uasg: (v.orgaoUasg || "").trim(), municipio: (v.orgaoMunicipio || "").trim(), estado: v.orgaoEstado || "", cnpj: "", contatos: [], origemIA: true }); }
      const licId = newId();
      await store.setItem("licitacoes", { id: licId, numero: v.numero.trim(), tipo: v.tipo, data: v.data || "", portalId: v.portalId || "", orgaoId, obs: `Criada pela análise de edital (IA). Validade: ${L.validadeProposta || "—"}. Entrega: ${L.entrega || "—"}${L.multiplosEnderecos ? " (múltiplos endereços)" : ""}. Amostra: ${L.exigeAmostra || "—"}. Garantia: ${L.garantiaContratual || "—"}.`, origemIA: true, analiseIA: { resumo: L, documentacaoEspecial: r.documentacaoEspecial || [], observacoes: r.observacoes || [], meta: r.meta || null, arquivos: r.arquivos || [] } });
      const itens = linhas.map(({ it, p }, i) => { const qtd = +v[`qtd_${i}`] || 0, preco = +v[`preco_${i}`] || 0; return { num: it.item, produtoId: p.id, nome: p.nome, codigo: p.codigo, marca: p.marca || "", qtd, custo: p.custo || 0, preco, total: +(qtd * preco).toFixed(2), descricaoEdital: it.descricao, unidadeEdital: it.unidade || "", precoReferencia: it.precoReferencia ?? null }; });
      const num = Math.max(0, ...store.get("propostas").map((x) => +x.num || 0)) + 1;
      await store.setItem("propostas", { id: newId(), num, licitacaoId: licId, status: "Em Andamento", itens, criadoEm: new Date().toISOString(), origemIA: true });
      ultima.criada = { num, numero: v.numero.trim(), licId }; await salvarAnalise(); closeModal(); mostrar(el);
      toast(`Licitação ${v.numero.trim()} e proposta #${num} criadas (rascunho IA).`, "ok", 6000);
    },
  });
}


// Normaliza "093", "93.0", "Item 93", "LOTE 4 (Unitário)" → "93"/"4"
const numItem = (v) => { const t = String(v ?? "").trim(); const m = t.match(/\d+(?:[.,]\d+)?/); if (!m) return ""; return String(parseFloat(m[0].replace(",", "."))); };
// Na Effecti, quando o pregão é "por lote" com 1 item por lote, o número do item do edital vem na coluna Lote e Item = 1.
function colunaChave(ex, cItem, cLote) {
  if (cLote < 0) return cItem;
  const linhas = ex.rows.slice(1).filter((r) => r.some((v) => v !== "" && v != null));
  const itens = linhas.map((r) => numItem(r[cItem])).filter(Boolean), lotes = linhas.map((r) => numItem(r[cLote])).filter(Boolean);
  const repetidos = new Set(itens).size < itens.length, lotesUnicos = new Set(lotes).size === lotes.length;
  return (repetidos || (itens.length && itens.every((v) => v === "1"))) && lotesUnicos && lotes.length ? cLote : cItem;
}
function acharLinha(ex, cItem, cDesc, it, cLote = -1) {
  const alvo = numItem(it.item); const cKey = colunaChave(ex, cItem, cLote);
  const numLinha = (row) => numItem(row[cKey]) || (cDesc >= 0 && /^(lote|item)\s*\d+/i.test(String(row[cDesc] || "")) ? numItem(row[cDesc]) : "");
  let ri = ex.rows.findIndex((row, i) => i > 0 && numLinha(row) === alvo);
  if (ri < 0 && cDesc >= 0) { // tenta pela descrição (início igual)
    const d = String(it.descricao || "").toUpperCase().replace(/\s+/g, " ").slice(0, 40);
    if (d.length > 10) ri = ex.rows.findIndex((row, i) => i > 0 && String(row[cDesc] || "").toUpperCase().replace(/\s+/g, " ").startsWith(d));
  }
  return ri;
}
const itensDaPlanilha = (ex, cItem, cLote = -1) => { const k = colunaChave(ex, cItem, cLote); return ex.rows.slice(1).map((r) => numItem(r[k])).filter(Boolean); };

// ---------- Planilha da Effecti: preenche Marca, Modelo e Valor Unitário nos itens casados ----------
async function preencherEffecti(file) {
  const r = ultima; if (!r) return; const L = r.resumo || {};
  let ex; try { ex = await abrirExcel(file); } catch (e) { return toast("Não consegui ler a planilha.", "erro"); }
  const cab = (ex.rows[0] || []).map((c) => String(c).toLowerCase());
  const col = (re) => cab.findIndex((c) => re.test(c));
  const cItem = col(/^(n[º°.]?\s*)?(do\s+)?item/), cDesc = col(/descri/), cLote = col(/^lote/), cMarca = col(/marca/), cModelo = col(/modelo/), cValor = col(/valor unit/), cQtd = col(/quantidade/), cTotal = col(/valor total/);
  if (cItem < 0 || cValor < 0) return toast("Esta não parece a planilha de importação da Effecti (precisa das colunas Item e Valor Unitário).", "erro", 7000);
  // preço por item: o da proposta criada, senão o preço inicial calculado
  const prop = r.criada ? store.get("propostas").find((p) => p.licitacaoId === r.criada.licId) : null;
  const X = XL(); let preenchidos = 0; const faltam = [];
  linhasCorr().forEach(({ it, p }) => {
    if (!p) { faltam.push(it.item); return; }
    const ri = acharLinha(ex, cItem, cDesc, it, cLote);
    if (ri < 0) { faltam.push(it.item); return; }
    const pi = prop?.itens?.find((x) => numItem(x.num) === numItem(it.item)); const preco = pi ? pi.preco : precoInicial(it, p, L).preco;
    const set = (c, v, t = "s") => { if (c < 0) return; const ref = X.utils.encode_cell({ r: ri, c }); ex.ws[ref] = { ...(ex.ws[ref] || {}), t, v, ...(t === "n" ? { z: "#,##0.00" } : {}) }; delete ex.ws[ref].w; };
    const marcaModelo = [p.marca, p.codigo || p.nome].filter(Boolean).join(" ").trim(); set(cMarca, marcaModelo); set(cModelo, marcaModelo); set(cValor, preco, "n");
    if (cTotal >= 0) { const q = +ex.rows[ri][cQtd] || pi?.qtd || it.quantidade || 0; const ref = X.utils.encode_cell({ r: ri, c: cTotal }); const cell = ex.ws[ref] || {}; if (!cell.f) set(cTotal, +(q * preco).toFixed(2), "n"); }
    preenchidos++;
  });
  if (!preenchidos) return toast(`Nenhum item da planilha coincide com os itens casados. Itens na planilha: ${itensDaPlanilha(ex, cItem, cLote).slice(0, 15).join(", ") || "nenhum"} · itens casados: ${linhasCorr().filter((x) => x.p).map((x) => x.it.item).join(", ")}.`, "erro", 12000);
  salvarWorkbook(ex.wb, `proposta_effecti_${(numeroCurto(L.numero) || "edital").replace(/[^\w]+/g, "_")}`);
  toast(`Planilha preenchida: ${preenchidos} item(ns)${faltam.length ? ` · sem produto ou não encontrados: ${faltam.join(", ")}` : ""}. Importe na Effecti.`, "ok", 8000);
}

// ---------- Planilha de disputa da Effecti: Valor limite = lance mínimo (piso com frete mínimo) ----------
async function preencherDisputa(file) {
  const r = ultima; if (!r) return; const L = r.resumo || {};
  let ex; try { ex = await abrirExcel(file); } catch (e) { return toast("Não consegui ler a planilha.", "erro"); }
  const cab = (ex.rows[0] || []).map((c) => String(c).toLowerCase());
  const col = (re) => cab.findIndex((c) => re.test(c));
  const cItem = col(/^(n[º°.]?\s*)?(do\s+)?item/), cDesc = col(/descri/), cLote = col(/^lote/), cLimite = col(/valor limite|lance m[ií]nimo|limite/);
  if (cItem < 0 || cLimite < 0) return toast("Esta não parece a planilha de disputa da Effecti (precisa das colunas Item e Valor limite).", "erro", 7000);
  const casados = linhasCorr().filter((x) => x.p);
  const totalPedido = casados.reduce((a, { it, p }) => a + piso(p.custo) * (+it.quantidade || 0), 0); // estimativa do pedido para ratear o frete mínimo
  const X = XL(); let n = 0; const faltam = [], acima = [];
  casados.forEach(({ it, p }) => {
    const ri = acharLinha(ex, cItem, cDesc, it, cLote);
    if (ri < 0) { faltam.push(it.item); return; }
    const lance = +pisoComFreteMin(p.custo, totalPedido).toFixed(2);
    const ref = X.utils.encode_cell({ r: ri, c: cLimite }); const atual = +ex.rows[ri][cLimite] || 0;
    ex.ws[ref] = { ...(ex.ws[ref] || {}), t: "n", v: lance, z: "#,##0.00" }; delete ex.ws[ref].w;
    if (atual && lance > atual) acima.push(`${it.item} (piso ${fmt(lance)} > limite ${fmt(atual)})`);
    n++;
  });
  if (!n) return toast(`Nenhum item da planilha coincide com os itens casados. Itens na planilha: ${itensDaPlanilha(ex, cItem, cLote).slice(0, 15).join(", ") || "nenhum"} · itens casados: ${casados.map((x) => x.it.item).join(", ")}.`, "erro", 12000);
  salvarWorkbook(ex.wb, `disputa_effecti_${(numeroCurto(L.numero) || "edital").replace(/[^\w]+/g, "_")}`);
  toast(`Lance mínimo preenchido em ${n} item(ns)${faltam.length ? ` · não encontrados na planilha: ${faltam.join(", ")}` : ""}${acima.length ? ` · ATENÇÃO, piso acima do valor atual: ${acima.join("; ")}` : ""}.`, acima.length ? "aviso" : "ok", 10000);
}

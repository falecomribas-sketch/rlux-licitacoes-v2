// Analisar edital (IA) — Etapa A: leitura do edital e dos anexos, sem gravar nada no banco.
// Aba Resumo: 7 campos (órgão, nº, município/UF, validade, amostra, entrega, garantia) com base, documentação especial, observações.
// Aba Itens: itens do portfólio encontrados, com página. A proposta (Etapa D) virá depois.
import { analisarEdital, casarItens, extrairDeclaracoes } from "../core/ia.js?v=20261113-004029";
import { gerarPdfDeclaracoes, nomeArquivoDecl } from "../pdf/declaracoes.js?v=20261113-004029";
import { EMPRESA } from "../core/pdf.js?v=20261113-004029";
import { candidatosPara, nomeFamilia, historicoProduto } from "../core/casar.js?v=20261113-004029";
import { iniciarPreco, piso, pisoComFreteMin, custoVencido, getCfg } from "../core/preco.js?v=20261113-004029";
import { getRegras, iniciarRegras, getPrompts, iniciarPrompts } from "./parametros.js?v=20261113-004029";
import { store } from "../core/store.js?v=20261113-004029";
import { ssel } from "../core/ssel.js?v=20261113-004029";
import { podeEditar, currentUser } from "../core/auth.js?v=20261113-004029";
import { formModal, lerForm, campo, inputTxt, inputNum, inputData, select, linha, exportarExcel, exportarExcelFormatado, abrirExcel, salvarWorkbook, XL, UFS } from "../core/forms.js?v=20261113-004029";
import { newId } from "../core/store.js?v=20261113-004029";
import { navigate } from "../core/router.js?v=20261113-004029";
import { opcoesOrgaos, TIPOS } from "./licitacoes.js?v=20261113-004029";
import { toTitleCase, dataLocal, hojeIso, fmtDc } from "../core/utils.js?v=20261113-004029";
import { toast, icon, tag, vazio, closeModal, confirmar } from "../core/ui.js?v=20261113-004029";
import { esc, fmt, fmtNum, fmtD, cnpjDigitos, cnpjFormatado } from "../core/utils.js?v=20261113-004029";
import { copiarTexto } from "../core/regua.js?v=20261113-004029";

let ultima = null, arquivos = [], ocupado = false, aba = "edital", modelo = "claude-haiku-5-5";
const MODELOS = [["claude-haiku-5-5", "Haiku — econômico (padrão)"], ["claude-sonnet-5-5", "Sonnet — mais preciso (~3× o custo)"]];
const NAO_LOC = /não localizado/i;

export default {
  id: "edital", titulo: "Analisar edital (IA)", grupo: "Licitações", icone: "bulb",
  render(el) {
    histBusca = ""; histSit = ""; histOrd = "analise";
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
    const add = (files) => { for (const f of files) { if (arquivos.length >= 4) { toast("No máximo 4 PDFs.", "erro"); break; } if (!/\.pdf$/i.test(f.name)) { toast(`${f.name} não é PDF.`, "erro"); continue; } arquivos.push(f); if (/\bETP\b|estudo\s*t[ée]cnico/i.test(f.name)) toast("ETP (estudo técnico preliminar) raramente acrescenta algo ao Edital + TR e encarece a leitura. Inclua só se a planilha de itens estiver nele.", "aviso", 9000); } lista(); };
    inp.addEventListener("change", () => { add(inp.files); inp.value = ""; });
    dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("over"); }); dz.addEventListener("dragleave", () => dz.classList.remove("over"));
    dz.addEventListener("drop", (e) => { e.preventDefault(); dz.classList.remove("over"); add(e.dataTransfer.files); });
    el.querySelector("#lista").addEventListener("click", (e) => { const b = e.target.closest("[data-rm]"); if (b) { arquivos.splice(+b.dataset.rm, 1); lista(); } });
    el.querySelector("#sel-modelo").addEventListener("change", (e) => { modelo = e.target.value; });
    btn.addEventListener("click", async () => {
      ocupado = true; lista(); prog.textContent = "Preparando…";
      // mesmo conjunto de PDFs já analisado? evita pagar duas vezes
      let hash = ""; try { hash = await hashArquivos(arquivos); } catch { hash = ""; }
      const igual = hash ? store.get("analises").find((a) => a.hashArquivos === hash) : null;
      if (igual) {
        const abrir = await confirmar(`Estes mesmos PDFs já foram analisados em ${fmtD(dataLocal(igual.criadoEm))} (${modalidadeCurta(igual.resumo?.modalidade)} ${numeroCurto(igual.resumo?.numero) || ""}). Abrir a análise existente em vez de pagar uma nova?`, { ok: "Abrir a existente", cancelar: "Analisar de novo" });
        if (abrir) { ultima = JSON.parse(JSON.stringify(igual)); aba = "edital"; arquivos = []; ocupado = false; lista(); prog.textContent = ""; mostrar(el); return; }
      }
      try { ultima = await analisarEdital(arquivos, { modelo, prompt: getPrompts().analise, onProgresso: (t) => { prog.textContent = t; } }); ultima.hashArquivos = hash; registrarUso(ultima, "analise", ultima.meta); ultima.arquivosNomes = arquivos.map((f) => f.name); ultima.criadoEm = new Date().toISOString(); ultima.usuario = currentUser?.email || ""; await salvarAnalise(); prog.textContent = ""; toast("Análise concluída."); }
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
    <div class="tabs"><button class="tab ${aba === "edital" ? "active" : ""}" data-act="aba" data-id="edital">Resumo do edital</button><button class="tab ${aba === "itens" ? "active" : ""}" data-act="aba" data-id="itens">Itens do portfólio (${(r.itens || []).length})</button><button class="tab ${aba === "corr" ? "active" : ""}" data-act="aba" data-id="corr">Correspondência${r.correspondencia ? ` (${r.correspondencia.filter((c) => c.produtoId).length}/${(r.itens || []).length})` : ""}</button><button class="tab ${aba === "decl" ? "active" : ""}" data-act="aba" data-id="decl">Declarações${r.declaracoes ? ` (${r.declaracoes.length})` : ""}</button></div>
    ${aba === "edital" ? abaEdital(r, L) : aba === "itens" ? abaItens(r) : aba === "decl" ? abaDecl(r) : abaCorr(r, el)}
    <p class="muted" style="font-size:11.5px;margin-top:12px">${esc(m.modelo || "")} · ${m.paginas || 0} página(s) · ${fmtNum((m.tokensEntrada || 0) + (m.tokensCache || 0))} tokens lidos · ${fmtNum(m.tokensSaida)} gerados${(r.documentos || []).some((d) => d.modo === "pdf") ? " · <strong>modo PDF (escaneado)</strong>" : ""} · ${m.segundos || 0}s${m.stopReason === "max_tokens" ? (m.complementoResumo ? " · <strong style=\"color:var(--amber-txt)\">lista de itens pode estar incompleta (limite de resposta); resumo obtido em 2ª chamada</strong>" : " · <strong style=\"color:var(--red)\">resposta truncada — edital muito extenso, divida os PDFs</strong>") : ""} · arquivos: ${esc((r.arquivosNomes || []).join(", "))}</p>`;
  if (aba === "corr") ligarCorr(el);
  if (aba === "decl") ligarDecl(el);
}

// ---------- Etapa C: correspondência ----------
let casando = false, unsubH = null;
// SHA-256 do conjunto de PDFs (independe da ordem)
async function hashArquivos(files) {
  const partes = []; for (const f of files) { const h = await crypto.subtle.digest("SHA-256", await f.arrayBuffer()); partes.push([...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("")); }
  return partes.sort().join("|").slice(0, 200);
}
// Histórico de consumo de IA desta análise (para o painel de custo em Parâmetros)
function registrarUso(r, etapa, meta) {
  if (!r || !meta) return; (r.usoIA ||= []).push({ etapa, modelo: meta.modelo || "", entrada: (meta.tokensEntrada || 0) + (meta.tokensCache || 0), saida: meta.tokensSaida || 0, em: new Date().toISOString(), usuario: currentUser?.email || "" });
}
async function salvarAnalise(alvo = ultima) {
  if (!alvo) return; if (!alvo.id) alvo.id = newId();
  const { arquivosNomes, ...dados } = alvo; // tudo é serializável (sem File)
  try { await store.setItem("analises", { ...dados, arquivosNomes: arquivosNomes || [], atualizadoEm: new Date().toISOString() }); } catch (e) { console.error(e); toast("Não consegui gravar a análise (ela continua na tela).", "erro"); }
}
let histBusca = "", histSit = "", histOrd = "analise"; // analise | disputa
const SIT_HIST = [["", "Todas"], ["proposta", "Com proposta"], ["analisado", "Só analisadas"], ["semcorr", "Sem correspondência"], ["minhas", "Minhas"]];
function historico(el) {
  const box = el.querySelector("#historico"); if (!box) return;
  const todas = store.get("analises").slice().sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));
  const q = normTxt(histBusca); const eu = (currentUser?.email || "").toLowerCase();
  const lst = todas.filter((a) => { const L = a.resumo || {}; const n = (a.itens || []).length;
    if (histSit === "proposta" && !a.criada) return false; if (histSit === "analisado" && a.criada) return false; if (histSit === "semcorr" && (a.correspondencia || n === 0)) return false; if (histSit === "minhas" && (a.usuario || "").toLowerCase() !== eu) return false;
    if (!q) return true; const alvo = normTxt([L.orgao, L.numero, L.modalidade, L.municipio, L.estado, L.uasg, a.usuario, fmtD(dataLocal(a.criadoEm)), L.dataSessao ? fmtD(L.dataSessao) : "", ...(a.itens || []).map((i) => i.descricao)].join(" ")); return q.split(/\s+/).every((t) => alvo.includes(t)); });
  if (histOrd === "disputa") { const hoje = hojeIso(); lst.sort((a, b) => { const da = a.resumo?.dataSessao || "9999", db = b.resumo?.dataSessao || "9999"; const fa = da < hoje, fb = db < hoje; if (fa !== fb) return fa ? 1 : -1; return fa ? db.localeCompare(da) : da.localeCompare(db); }); }
  const mostrarLst = lst.slice(0, 60);
  const disputa = (L) => { if (!L.dataSessao) return `<span class="muted">—</span>`; const hoje = hojeIso(); const dias = Math.round((new Date(L.dataSessao + "T00:00:00") - new Date(hoje + "T00:00:00")) / 864e5);
    const cor = dias < 0 ? "color:var(--muted)" : dias === 0 ? "color:var(--red);font-weight:700" : dias <= 3 ? "color:var(--amber-txt);font-weight:600" : ""; const rot = dias < 0 ? "realizada" : dias === 0 ? "hoje" : dias === 1 ? "amanhã" : `em ${dias} dias`;
    return `<div style="${cor}">${fmtDc(L.dataSessao)}${L.horaSessao ? ` <span style="font-weight:400">${esc(String(L.horaSessao).slice(0, 5))}</span>` : ""}</div><div class="muted" style="font-size:11px">${rot}</div>`; };
  box.innerHTML = `<div class="card-head"><h2>Análises recentes</h2><span class="muted" style="font-size:12px">${mostrarLst.length} de ${todas.length}</span></div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid var(--border)">
      <label class="search" style="min-width:260px"><span class="search-ic">${icon("search")}</span><input type="search" id="hist-busca" class="input" placeholder="Buscar por órgão, número, cidade, item, usuário…" value="${esc(histBusca)}"></label>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${SIT_HIST.map(([k, t]) => `<button class="chip ${histSit === k ? "active" : ""}" data-hist-sit="${k}">${t}</button>`).join("")}</div>
    </div>` + (mostrarLst.length ? `<div class="card-body flush"><div class="table-wrap"><table><thead><tr><th><a href="#" data-hist-ord="analise" style="${histOrd === "analise" ? "font-weight:700" : "font-weight:500;color:var(--muted)"}">Análise ${histOrd === "analise" ? "↓" : ""}</a></th><th>Licitação</th><th><a href="#" data-hist-ord="disputa" style="${histOrd === "disputa" ? "font-weight:700" : "font-weight:500;color:var(--muted)"}">Disputa ${histOrd === "disputa" ? "↑" : ""}</a></th><th>Órgão</th><th class="num">Itens</th><th>Correspondência</th><th>Situação</th><th></th></tr></thead><tbody>
    ${mostrarLst.map((a) => { const L = a.resumo || {}; const n = (a.itens || []).length, c = (a.correspondencia || []).filter((x) => x.produtoId).length;
      return `<tr class="${ultima?.id === a.id ? "row-active" : ""}"><td>${fmtDc(dataLocal(a.criadoEm))}<div class="muted" style="font-size:11px">${esc((a.usuario || "").split("@")[0])}</div></td><td><strong>${esc(modalidadeCurta(L.modalidade))} ${esc(numeroCurto(L.numero) || "—")}</strong></td><td style="white-space:nowrap">${disputa(L)}</td><td>${esc((L.orgao || "—").slice(0, 50))}<div class="muted" style="font-size:11px">${esc([L.municipio, L.estado].filter(Boolean).join("/"))}</div></td><td class="num">${n}</td><td>${a.correspondencia ? tag(`${c}/${n}`, c === n && n ? "tag-green" : "tag-amber") : `<span class="muted">—</span>`}</td><td>${a.criada ? tag(`Proposta #${a.criada.num}`, "tag-teal") : n ? tag("Analisado", "tag-blue") : tag("Sem itens", "tag-gray")}</td><td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-abrir="${esc(a.id)}">Abrir</button> <button class="btn btn-ghost btn-sm btn-icon" data-excluir="${esc(a.id)}" title="Excluir análise">${icon("trash")}</button></td></tr>`; }).join("")}
  </tbody></table></div></div>` : `<div class="card-body"><p class="muted" style="margin:0;font-size:13px">${todas.length ? "Nenhuma análise corresponde à busca." : "As análises feitas a partir de agora ficam guardadas aqui."}</p></div>`);
  const inp = box.querySelector("#hist-busca"); if (inp) { inp.addEventListener("input", () => { histBusca = inp.value; const pos = inp.selectionStart; historico(el); const n = box.querySelector("#hist-busca"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }); }
  box.querySelectorAll("[data-hist-sit]").forEach((b) => b.addEventListener("click", () => { histSit = b.dataset.histSit; historico(el); }));
  box.querySelectorAll("[data-hist-ord]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); histOrd = b.dataset.histOrd; historico(el); }));
}
const linhasCorr = () => (ultima?.itens || []).map((it) => { const c = (ultima.correspondencia || []).find((x) => String(x.item) === String(it.item)); const p = c?.produtoId ? store.find("produtos", c.produtoId) : null; return { it, c, p }; });
async function casar(el) {
  if (!ultima || casando) return; casando = true; mostrar(el);
  try {
    const itens = ultima.itens.map((it) => { const { familia, candidatos } = candidatosPara(it); return { item: it.item, descricao: it.descricao, unidade: it.unidade, quantidade: it.quantidade, marcaReferencia: it.marcaReferencia, familia, candidatos }; });
    // Em lotes de até 10 itens, em paralelo: respostas curtas (sem risco de corte) e mais rápido
    const LOTE = 10; const lotes = []; for (let i = 0; i < itens.length; i += LOTE) lotes.push(itens.slice(i, i + LOTE));
    const prog = el.querySelector("#corr-prog"); let feitos = 0;
    const partes = await Promise.all(lotes.map(async (lote) => { const r = await casarItens(lote, { regras: getRegras(), modelo, prompt: getPrompts().casar }); feitos += lote.length; if (prog) prog.textContent = `${feitos}/${itens.length} itens…`; return r; }));
    const todos = partes.flatMap((r) => r.itens || []); const metas = partes.map((r) => r.meta || {});
    const meta = { modelo: metas[0]?.modelo || "", tokensEntrada: metas.reduce((a, m) => a + (m.tokensEntrada || 0), 0), tokensSaida: metas.reduce((a, m) => a + (m.tokensSaida || 0), 0), segundos: Math.max(...metas.map((m) => m.segundos || 0)), chamadas: lotes.length };
    // Casa a resposta com o item: número igual → número normalizado ("037"/"Item 37") → posição no lote (mesma quantidade)
    const achar = (it, idx, lote) => todos.find((x) => String(x.item) === String(it.item)) || todos.find((x) => numItem(x.item) && numItem(x.item) === numItem(it.item)) || (lote && lote.resp.length === lote.itens.length ? lote.resp[idx] : null);
    const porLote = []; lotes.forEach((lt, li) => lt.forEach((it, idx) => porLote.push({ it, idx, lote: { itens: lt, resp: partes[li]?.itens || [] } })));
    console.log("correspondência: itens enviados", itens.map((i) => i.item), "devolvidos", todos.map((c) => c.item));
    ultima.correspondencia = porLote.map(({ it, idx, lote }) => { const c = achar(it, idx, lote); return c ? { ...c, item: String(it.item) } : { item: String(it.item), produtoId: "", confianca: "nenhuma", justificativa: "A IA não devolveu resposta para este item — use Refazer ou escolha manualmente.", observacao: "" }; });
    const semResposta = ultima.correspondencia.filter((c) => /não devolveu resposta/.test(c.justificativa || ""));
    ultima.metaCorr = meta; registrarUso(ultima, "correspondencia", meta); ultima.candidatosEnviados = itens.reduce((s, i) => s + i.candidatos.length, 0);
    await salvarAnalise(); toast(semResposta.length ? `Correspondência concluída, mas ${semResposta.length} item(ns) ficaram sem resposta da IA.` : "Correspondência concluída.", semResposta.length ? "aviso" : "ok", 6000);
  } catch (e) { toast(e.message, "erro", 8000); }
  casando = false; mostrar(el);
}
function abaCorr(r) {
  const L = r.resumo || {}; const linhas = linhasCorr(); const tem = !!r.correspondencia;
  const CONF = { alta: "tag-green", media: "tag-amber", baixa: "tag-orange", nenhuma: "tag-red" };
  if (!tem) return `<div class="card"><div class="card-body" style="text-align:center;padding:36px"><p class="muted" style="margin:0 0 14px">Para cada item do edital, o sistema separa os produtos da mesma família e a IA escolhe o mais aderente, aplicando as regras de <strong>Parâmetros</strong>. Você confirma ou troca.</p><button class="btn btn-primary" data-act="casar" ${casando || !r.itens?.length ? "disabled" : ""}>${icon("bulb")} ${casando ? "Casando itens…" : `Casar ${r.itens?.length || 0} item(ns) com o cadastro`}</button>${casando ? `<p id="corr-prog" class="muted" style="margin:10px 0 0;font-size:13px">Enviando…</p>` : ""}</div></div>`;
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
  const opcoes = store.get("produtos").map((p) => ({ id: p.id, label: `${p.preferido ? "★ " : ""}${p.codigo} — ${p.nome}`, sub: p.descricaoTecnica || "", extra: p.marca })).sort((a, b) => a.label.localeCompare(b.label));
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
      ${linha("Órgão", `${L.orgao || "—"}${L.uasg && !NAO_LOC.test(L.uasg) ? ` (UASG ${L.uasg})` : ""}${cnpjDigitos(L.cnpj) ? ` · CNPJ ${cnpjFormatado(L.cnpj)}` : ""}`)}
      ${contatosIA(L).length ? linha("Contatos", contatosIA(L).map((c) => [c.nome, c.cargo, c.email, c.telefone].filter(Boolean).join(" · ")).join("; ")) : ""}
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
const limparNaoLoc = (v) => (!v || NAO_LOC.test(String(v))) ? "" : String(v).trim();
// Contatos que a IA achou no edital, já limpos
function contatosIA(L) {
  return (Array.isArray(L.contatos) ? L.contatos : []).map((c) => ({ nome: limparNaoLoc(c.nome), cargo: limparNaoLoc(c.cargo), email: limparNaoLoc(c.email).toLowerCase(), telefone: limparNaoLoc(c.telefone) })).filter((c) => c.email || c.telefone || c.nome);
}
// Órgão já cadastrado: preenche CNPJ/UASG/município se estiverem vazios e acrescenta contatos novos (por e-mail/telefone)
async function complementarOrgao(id, L) {
  const o = store.find("orgaos", id); if (!o) return;
  const novo = { ...o }; let mudou = false;
  const preencher = (k, val) => { if (!novo[k] && val) { novo[k] = val; mudou = true; } };
  preencher("cnpj", cnpjFormatado(limparNaoLoc(L.cnpj))); preencher("uasg", limparNaoLoc(L.uasg)); preencher("municipio", limparNaoLoc(L.municipio)); preencher("estado", limparNaoLoc(L.estado));
  const atuais = Array.isArray(o.contatos) ? o.contatos : []; const chave = (c) => (c.email || "").toLowerCase() || (c.telefone || "").replace(/\D/g, "");
  const tem = new Set(atuais.map(chave).filter(Boolean)); const add = contatosIA(L).filter((c) => chave(c) && !tem.has(chave(c)));
  if (add.length) { novo.contatos = [...atuais, ...add]; mudou = true; }
  if (mudou) await store.setItem("orgaos", novo);
}
function acharOrgao(L) {
  const orgs = store.get("orgaos"); const uasg = String(L.uasg || "").replace(/\D/g, "");
  const dig = cnpjDigitos(L.cnpj); if (dig) { const o = orgs.find((x) => cnpjDigitos(x.cnpj) === dig); if (o) return o; }
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
           ${linha(campo("Nome do órgão", inputTxt("orgaoNome", L.orgao || "")), campo("UASG", inputTxt("orgaoUasg", NAO_LOC.test(L.uasg || "") ? "" : L.uasg || "")), campo("Município", inputTxt("orgaoMunicipio", L.municipio || "")), campo("UF", select("orgaoEstado", [["", "—"], ...UFS.map((u) => [u, u])], L.estado || "")))}
           ${linha(campo("CNPJ", inputTxt("orgaoCnpj", cnpjFormatado(limparNaoLoc(L.cnpj)))))}`}
      ${contatosIA(L).length ? `<div class="info-box"><div><div class="k">Contatos encontrados no edital</div>${contatosIA(L).map((c) => esc([c.nome, c.cargo, c.email, c.telefone].filter(Boolean).join(" · "))).join("<br>")}<div class="muted" style="font-size:11.5px;margin-top:4px">${orgaoEx ? "Serão acrescentados ao órgão (sem duplicar e-mails já cadastrados)." : "Serão gravados no órgão criado."}</div></div></div>` : ""}
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
      if (!orgaoId) { if (!v.orgaoNome?.trim()) throw new Error("Informe o nome do órgão ou escolha um existente.");
        const dig = cnpjDigitos(v.orgaoCnpj); const dup = dig ? store.get("orgaos").find((x) => cnpjDigitos(x.cnpj) === dig) : null;
        if (dup) { orgaoId = dup.id; await complementarOrgao(orgaoId, L); toast(`Órgão já cadastrado com este CNPJ (${dup.nome}) — usado o existente.`, "aviso", 7000); } }
      if (!orgaoId) { orgaoId = newId(); await store.setItem("orgaos", { id: orgaoId, nome: v.orgaoNome.trim(), uasg: (v.orgaoUasg || "").trim(), municipio: (v.orgaoMunicipio || "").trim(), estado: v.orgaoEstado || "", cnpj: cnpjFormatado(v.orgaoCnpj || ""), contatos: contatosIA(L), origemIA: true }); }
      else await complementarOrgao(orgaoId, L);
      const licId = newId();
      await store.setItem("licitacoes", { id: licId, numero: v.numero.trim(), tipo: v.tipo, data: v.data || "", portalId: v.portalId || "", orgaoId, obs: `Criada pela análise de edital (IA). Validade: ${L.validadeProposta || "—"}. Entrega: ${L.entrega || "—"}${L.multiplosEnderecos ? " (múltiplos endereços)" : ""}. Amostra: ${L.exigeAmostra || "—"}. Garantia: ${L.garantiaContratual || "—"}.`, origemIA: true, analiseIA: { resumo: L, documentacaoEspecial: r.documentacaoEspecial || [], observacoes: r.observacoes || [], meta: r.meta || null, arquivos: r.arquivos || [] } });
      const itens = linhas.map(({ it, p }, i) => { const qtd = +v[`qtd_${i}`] || 0, preco = +v[`preco_${i}`] || 0; return { num: it.item, produtoId: p.id, nome: it.descricao || p.nome, produtoNome: p.nome, codigo: p.codigo, marca: p.marca || "", qtd, custo: p.custo || 0, preco, total: +(qtd * preco).toFixed(2), descricaoEdital: it.descricao, unidadeEdital: it.unidade || "", precoReferencia: it.precoReferencia ?? null }; });
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

// ---------- Declarações exigidas no edital ----------
let gerandoDecl = false;
const FASE_DECL = { proposta: ["Proposta", "tag-blue"], habilitacao: ["Habilitação", "tag-teal"], contratacao: ["Contratação", "tag-purple"], outra: ["Outra", "tag-gray"] };
function abaDecl(r) {
  const ds = r.declaracoes;
  const cab = `<div class="card-head"><h2>Declarações exigidas no edital</h2><div style="display:flex;gap:8px;flex-wrap:wrap">${ds?.length ? `<button class="btn btn-ghost btn-sm" data-act="decl-pdf-todas">${icon("download")} PDF com todas</button>` : ""}<button class="btn ${ds ? "btn-ghost" : "btn-primary"} btn-sm" data-act="decl-gerar" ${gerandoDecl ? "disabled" : ""}>${icon(ds ? "refresh" : "bulb")} ${gerandoDecl ? "Lendo o edital…" : ds ? "Refazer com IA" : "Localizar e preencher com IA"}</button></div></div>`;
  if (!ds) return `<div class="card">${cab}<div class="card-body"><p class="muted" style="margin:0;font-size:13px">A IA relê os PDFs desta análise, localiza cada declaração que a licitante precisa apresentar (modelos em anexo e exigências no corpo do edital) e devolve o texto preenchido com os dados da RLUX. Só entram declarações com exigência escrita no edital — cada uma traz a cláusula e a página para conferência; as que o portal já coleta em campo próprio aparecem marcadas e ficam fora do PDF. Você confere, ajusta o que estiver marcado como pendente e gera os PDFs no papel timbrado, datados de "${esc(EMPRESA.cidade)}, dia de mês de ano".</p><p class="muted" style="margin:8px 0 0;font-size:12px">Custo estimado: semelhante ao da análise (lê o edital inteiro de novo).</p>${gerandoDecl ? `<p id="decl-prog" class="muted" style="font-size:13px;margin-top:10px">Lendo o edital…</p>` : ""}</div></div>`;
  const hoje = hojeIso();
  return `<div class="card">${cab}<div class="card-body">
    <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:12px"><label class="field" style="margin:0;max-width:180px"><span>Data das declarações</span><input type="date" id="decl-data" value="${r.declaracoesData || hoje}"></label><span class="muted" style="font-size:12px">${ds.length} declaração(ões)${r.declaracoesMeta?.arquivos?.length ? ` · lidas de: ${esc(r.declaracoesMeta.arquivos.join(", "))}${r.declaracoesMeta.paginasTotal ? ` (${r.declaracoesMeta.paginas}/${r.declaracoesMeta.paginasTotal} páginas)` : ""}` : ""}${r.declaracoesObs ? ` · ${esc(r.declaracoesObs)}` : ""}. Edite os textos à vontade — as alterações ficam salvas nesta análise.</span></div>
    ${ds.map((d, i) => `<div class="card" style="margin-bottom:12px;border:1px solid var(--border)"><div class="card-head" style="align-items:flex-start"><div><h2 style="font-size:14px">${i + 1}. ${esc(d.titulo)}</h2><div class="muted" style="font-size:11.5px;margin-top:2px">${esc(d.referencia || "")}${d.quemAssina === "contador" ? " · <strong>assinatura do contador</strong>" : ""}</div></div><div style="display:flex;gap:6px;align-items:center">${d.forma === "sistema" ? tag("Marcar no portal", "tag-gray") : ""}${tag(...(FASE_DECL[d.fase] || FASE_DECL.outra))}<button class="btn btn-ghost btn-sm" data-act="decl-pdf" data-i="${i}">${icon("download")} PDF</button><button class="icon-btn sm danger" data-act="decl-rm" data-i="${i}" title="Remover">${icon("trash")}</button></div></div>
      <div class="card-body">
        ${d.pendencias?.length ? `<div class="info-box" style="border-color:var(--amber);margin-bottom:8px"><div><div class="k">Pendências — confira antes de assinar</div>${d.pendencias.map((x) => esc(x)).join("<br>")}</div></div>` : ""}
        <label class="field" style="margin-bottom:6px"><span>Destinatário</span><textarea data-decl="destinatario" data-i="${i}" rows="2" style="font-size:13px;resize:vertical">${esc(d.destinatario || "")}</textarea></label>
        <label class="field" style="margin:0"><span>Texto</span><textarea data-decl="texto" data-i="${i}" rows="${Math.min(14, Math.max(5, Math.ceil((d.texto || "").length / 110)))}" style="font-size:13px;line-height:1.5;resize:vertical">${esc(d.texto || "")}</textarea></label>
      </div></div>`).join("")}
  </div></div>`;
}
function ligarDecl(el) {
  const box = el.querySelector("#resultado"); if (!box || box._declLigado) return; box._declLigado = true;
  let t = null; const salvarDepois = () => { clearTimeout(t); t = setTimeout(() => salvarAnalise(), 800); };
  box.addEventListener("input", (e) => { const i = e.target.closest("[data-decl]"); if (!i || !ultima?.declaracoes?.[+i.dataset.i]) return; ultima.declaracoes[+i.dataset.i][i.dataset.decl] = i.value; salvarDepois(); });
  box.addEventListener("change", (e) => { if (e.target.id === "decl-data") { ultima.declaracoesData = e.target.value; salvarDepois(); } });
  box.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return; const act = b.dataset.act; const r = ultima; if (!r) return;
    if (act === "decl-gerar") {
      if (!r.arquivos?.length) return toast("Esta análise não tem os PDFs guardados — analise o edital novamente para usar as declarações.", "erro", 7000);
      if (r.declaracoes && !await confirmar("Refazer as declarações com a IA? Os textos editados serão substituídos.")) return;
      gerandoDecl = true; mostrar(el);
      try {
        const empresa = { "Razão social": EMPRESA.nome, CNPJ: EMPRESA.cnpj, "Inscrição Estadual": EMPRESA.ie, "Endereço completo": EMPRESA.endereco, Telefone: EMPRESA.tel, "E-mail": EMPRESA.emailLicitacoes, "Representante legal": EMPRESA.representanteCompleto, "Cargo do representante": EMPRESA.cargoRepresentante, "RG do representante": EMPRESA.rg, "CPF do representante": EMPRESA.cpf, "Enquadramento": "Empresa de Pequeno Porte (EPP), optante pelo Simples Nacional", "Cidade para data": EMPRESA.cidade };
        const Lr = r.resumo || {}; const certame = { "Órgão": limparNaoLoc(Lr.orgao), "UASG": limparNaoLoc(Lr.uasg), "Modalidade": modalidadeCurta(Lr.modalidade), "Número": numeroCurto(Lr.numero), "Município/UF": [Lr.municipio, Lr.estado].filter(Boolean).join("/"), "Objeto": limparNaoLoc(Lr.objeto), "Data da sessão": Lr.dataSessao ? fmtD(Lr.dataSessao) : "" };
        const res = await extrairDeclaracoes(r.arquivos, { empresa, certame, prompt: getPrompts().declaracoes, modelo });
        r.declaracoes = res.declaracoes || []; r.declaracoesObs = res.observacoes || ""; r.declaracoesMeta = { ...(res.meta || {}), arquivos: (r.arquivos || []).map((a) => a.nome), pasta: (r.arquivos?.[0]?.path || "").split("/")[2] || "" }; registrarUso(r, "declaracoes", res.meta); r.declaracoesData = hojeIso();
        await salvarAnalise(r); if (ultima !== r) { gerandoDecl = false; toast("Declarações prontas na análise anterior (você trocou de análise enquanto a IA lia). Abra-a no histórico.", "aviso", 9000); return; }
        toast(`${r.declaracoes.length} declaração(ões) localizada(s)${res.meta?.stopReason === "max_tokens" ? " — resposta truncada, confira" : ""}.`, "ok", 6000);
      } catch (err) { toast(err.message || String(err), "erro", 9000); }
      gerandoDecl = false; mostrar(el); return;
    }
    const data = new Date((el.querySelector("#decl-data")?.value || hojeIso()) + "T12:00:00");
    const nomeBase = (numeroCurto(r.resumo?.numero) || "edital").replace(/[^\w]+/g, "_");
    if (act === "decl-pdf") { const d = r.declaracoes[+b.dataset.i]; const doc = await gerarPdfDeclaracoes([d], { data }); doc.save(`${nomeArquivoDecl(d.titulo)}_${nomeBase}.pdf`); return; }
    if (act === "decl-pdf-todas") { const docs = r.declaracoes.filter((d) => d.forma !== "sistema"); if (!docs.length) return toast("Todas as declarações deste edital são marcadas no portal — nada a imprimir.", "aviso"); const doc = await gerarPdfDeclaracoes(docs, { data }); doc.save(`declaracoes_${nomeBase}.pdf`); toast(`PDF com ${docs.length} declaração(ões)${docs.length < r.declaracoes.length ? ` — ${r.declaracoes.length - docs.length} marcada(s) no portal ficaram de fora` : ""}.`, "ok", 6000); return; }
    if (act === "decl-rm") { if (!await confirmar("Remover esta declaração da lista?")) return; r.declaracoes.splice(+b.dataset.i, 1); await salvarAnalise(); mostrar(el); }
  });
}

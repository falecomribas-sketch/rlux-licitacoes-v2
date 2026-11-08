// Analisar edital (IA) — Etapa A: leitura do edital e dos anexos, sem gravar nada no banco.
// Aba Edital: dados da licitação, as 8 perguntas com base, documentação especial, observações.
// Aba Itens: itens do portfólio encontrados, com página. A proposta (Etapa D) virá depois.
import { analisarEdital } from "../core/ia.js";
import { exportarExcel } from "../core/forms.js";
import { toast, icon, tag, vazio } from "../core/ui.js";
import { esc, fmt, fmtNum, fmtD } from "../core/utils.js";
import { copiarTexto } from "../core/regua.js";

let ultima = null, arquivos = [], ocupado = false, aba = "edital";
const NAO_LOC = /não localizado/i;

export default {
  id: "edital", titulo: "Analisar edital (IA)", grupo: "Licitações", icone: "bulb",
  render(el) {
    el.innerHTML = `
      <div class="page-head"><h2>Analisar edital (IA)</h2><div class="actions" id="acoes"></div></div>
      <div class="card" id="entrada"><div class="card-body">
        <p class="muted" style="margin:0 0 10px;font-size:13px">Envie o edital e, se houver, o termo de referência e anexos (até 4 PDFs, 30 MB cada). A IA lê tudo no servidor e devolve as respostas com a cláusula/página. Nada é gravado: use para decidir se vale participar e quais itens cotar.</p>
        <label class="dropzone" id="dz" style="display:block">${icon("upload")} <span id="dz-txt">Clique para escolher os PDFs ou arraste aqui</span><input type="file" accept="application/pdf,.pdf" multiple hidden></label>
        <div id="lista" style="margin-top:10px"></div>
        <div style="display:flex;gap:10px;align-items:center;margin-top:12px"><button class="btn btn-primary" id="btn-analisar" disabled>${icon("bulb")} Analisar edital</button><span class="muted" id="progresso" style="font-size:13px"></span></div>
      </div></div>
      <div id="resultado" style="margin-top:16px"></div>`;
    const inp = el.querySelector("input[type=file]"), dz = el.querySelector("#dz"), btn = el.querySelector("#btn-analisar"), prog = el.querySelector("#progresso");
    const lista = () => { el.querySelector("#lista").innerHTML = arquivos.length ? `<div class="list">${arquivos.map((f, i) => `<div class="list-item"><div class="list-main"><div class="list-title">${esc(f.name)}</div><div class="list-sub">${(f.size / 1024 / 1024).toFixed(1)} MB</div></div><button class="icon-btn sm danger" data-rm="${i}" title="Remover">${icon("x")}</button></div>`).join("")}</div>` : ""; btn.disabled = !arquivos.length || ocupado; };
    const add = (files) => { for (const f of files) { if (arquivos.length >= 4) { toast("No máximo 4 PDFs.", "erro"); break; } if (!/\.pdf$/i.test(f.name)) { toast(`${f.name} não é PDF.`, "erro"); continue; } arquivos.push(f); } lista(); };
    inp.addEventListener("change", () => { add(inp.files); inp.value = ""; });
    dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("over"); }); dz.addEventListener("dragleave", () => dz.classList.remove("over"));
    dz.addEventListener("drop", (e) => { e.preventDefault(); dz.classList.remove("over"); add(e.dataTransfer.files); });
    el.querySelector("#lista").addEventListener("click", (e) => { const b = e.target.closest("[data-rm]"); if (b) { arquivos.splice(+b.dataset.rm, 1); lista(); } });
    btn.addEventListener("click", async () => {
      ocupado = true; lista(); prog.textContent = "Preparando…";
      try { ultima = await analisarEdital(arquivos, { onProgresso: (t) => { prog.textContent = t; } }); ultima.arquivosNomes = arquivos.map((f) => f.name); prog.textContent = ""; toast("Análise concluída."); }
      catch (e) { prog.textContent = ""; toast(e.message, "erro", 8000); }
      ocupado = false; lista(); mostrar(el);
    });
    const agir = (act, id) => {
      if (act === "aba") { aba = id; mostrar(el); }
      if (act === "excel") exportarExcel((ultima.itens || []).map((i) => ({ Item: i.item, Lote: i.lote || "", "Descrição EDITAL": i.descricao, Unidade: i.unidade || "", Quantidade: i.quantidade ?? "", "Preço de Referência": i.precoReferencia ?? "", "ME/EPP": i.exclusivoMeEpp || "", "Marca ref.": i.marcaReferencia || "", Família: i.familia || "", Página: i.pagina ?? "" })), "Itens", "itens_edital");
      if (act === "copiar") copiarTexto(textoResumo(ultima)).then(() => toast("Resumo copiado."));
      if (act === "nova") { ultima = null; arquivos = []; lista(); mostrar(el); }
    };
    el.addEventListener("click", (e) => { const b = e.target.closest("#resultado [data-act], #acoes [data-act]"); if (b) agir(b.dataset.act, b.dataset.id); });
    lista(); mostrar(el);
  },
  destroy() {},
};

const modalidadeCurta = (m) => { const t = String(m || ""); if (/preg[ãa]o/i.test(t)) return "Pregão Eletrônico"; if (/dispensa/i.test(t)) return "Dispensa Eletrônica"; if (/concorr/i.test(t)) return "Concorrência"; if (/credenc/i.test(t)) return "Credenciamento"; return t.split(/[(,–-]/)[0].trim() || "Licitação"; };
function semaforo(r) {
  const perg = (n) => (r.perguntas?.[n]?.resposta || "");
  const sim = (t) => /^\s*sim|exig|obrigat/i.test(t) && !NAO_LOC.test(t);
  const vermelho = []; const amarelo = [];
  if (sim(perg(5))) vermelho.push("Exige amostra");
  if (sim(perg(4))) vermelho.push("Exclusividade regional");
  (r.documentacaoEspecial || []).forEach((d) => (/inabilita|elimina|desclassif/i.test(d.risco || "") ? vermelho : amarelo).push(d.documento));
  if (sim(perg(2))) amarelo.push("Garantia contratual");
  if (sim(perg(6))) amarelo.push("Logística reversa");
  if (!(r.itens || []).length) vermelho.push("Nenhum item do portfólio encontrado");
  if (vermelho.length) return { cor: "tag-red", txt: "Atenção antes de participar", lista: vermelho.concat(amarelo) };
  if (amarelo.length) return { cor: "tag-amber", txt: "Participar com cuidado", lista: amarelo };
  return { cor: "tag-green", txt: "Sem exigências incomuns", lista: [] };
}

function mostrar(el) {
  const box = el.querySelector("#resultado"), acoes = el.querySelector("#acoes"); if (!box) return;
  if (!ultima) { box.innerHTML = ""; acoes.innerHTML = ""; return; }
  const r = ultima, L = r.licitacao || {}, s = semaforo(r), m = r.meta || {};
  acoes.innerHTML = `<button class="btn btn-ghost" data-act="copiar">${icon("file")} Copiar resumo</button><button class="btn btn-ghost" data-act="excel">${icon("download")} Excel dos itens</button><button class="btn btn-ghost" data-act="nova">${icon("plus")} Nova análise</button>`;
  const semTexto = (r.documentos || []).filter((d) => d.semTexto > 0);
  const campo = (k, v) => v && !NAO_LOC.test(v) ? `<div><div class="k">${k}</div>${esc(String(v))}</div>` : "";
  box.innerHTML = `
    <div class="card" style="margin-bottom:16px"><div class="card-body" style="display:flex;flex-wrap:wrap;gap:16px;align-items:center">
      <div style="flex:1;min-width:260px"><div style="font-size:16px;font-weight:600">${esc(modalidadeCurta(L.modalidade))}${L.numero ? " nº " + esc(String(L.numero).replace(/^n[º°.]?\s*/i, "")) : ""}</div><div class="muted">${esc(L.orgao || "")}${L.uasg && !NAO_LOC.test(L.uasg) ? " · UASG " + esc(L.uasg) : ""}${L.estado ? " · " + esc(L.estado) : ""}${L.dataSessao ? " · sessão " + fmtD(L.dataSessao) + (L.horaSessao ? " " + esc(L.horaSessao) : "") : ""}</div></div>
      <div style="text-align:right;max-width:420px">${tag(s.txt, s.cor)}${s.lista.length ? `<ul class="muted" style="font-size:12px;margin:6px 0 0;padding-left:18px;text-align:left">${s.lista.slice(0, 6).map((x) => `<li>${esc(x)}</li>`).join("")}${s.lista.length > 6 ? `<li>+ ${s.lista.length - 6} na aba Edital</li>` : ""}</ul>` : ""}</div>
    </div>
    ${semTexto.length ? `<div class="card-body" style="padding-top:0"><div class="info-box" style="border-color:var(--amber)"><div><div class="k">PDF lido por imagem — confira as referências</div>${semTexto.map((d) => `${esc(d.nome)}: ${d.semTexto} de ${d.paginas} páginas sem texto`).join(" · ")}</div></div></div>` : ""}</div>
    <div class="tabs"><button class="tab ${aba === "edital" ? "active" : ""}" data-act="aba" data-id="edital">Edital</button><button class="tab ${aba === "itens" ? "active" : ""}" data-act="aba" data-id="itens">Itens do portfólio (${(r.itens || []).length})</button></div>
    ${aba === "edital" ? abaEdital(r, L, campo) : abaItens(r)}
    <p class="muted" style="font-size:11.5px;margin-top:12px">${esc(m.modelo || "")} · ${m.paginas || 0} página(s) · ${fmtNum((m.tokensEntrada || 0) + (m.tokensCache || 0))} tokens lidos · ${fmtNum(m.tokensSaida)} gerados${(r.documentos || []).some((d) => d.modo === "pdf") ? " · <strong>modo PDF (escaneado)</strong>" : ""} · ${m.segundos || 0}s${m.stopReason === "max_tokens" ? " · <strong style=\"color:var(--red)\">resposta truncada — edital muito extenso, divida os PDFs</strong>" : ""} · arquivos: ${esc((r.arquivosNomes || []).join(", "))}</p>`;
}

function abaEdital(r, L, campo) {
  const dados = [["Objeto", L.objeto], ["Portal", L.portal], ["Valor estimado", L.valorEstimado], ["Registro de preços", L.srp === true ? "Sim" + (L.vigenciaAta ? " · ATA " + L.vigenciaAta : "") : L.srp === false ? "Não" : ""], ["Adesão (carona)", L.permiteAdesao], ["Modo de disputa", L.modoDisputa], ["Intervalo de lances", L.intervaloLances], ["Validade da proposta", L.validadeProposta], ["Prazo de entrega", L.prazoEntrega], ["Local de entrega", L.localEntrega], ["Pagamento", L.prazoPagamento], ["Docs após a disputa", L.prazoDocsPosDisputa], ["ME/EPP", L.meEpp], ["Marca/modelo na proposta", L.exigeMarcaModelo], ["Garantia do produto", L.garantiaProduto], ["Aceita similar", L.aceitaSimilar], ["Catálogo / Inmetro", L.exigeCatalogoInmetro]];
  return `
    <div class="card" style="margin-bottom:16px"><div class="card-head"><h2>Dados e condições</h2></div><div class="card-body"><div class="info-box">${dados.map(([k, v]) => campo(k, v)).join("") || `<div class="muted">Sem dados extraídos</div>`}</div></div></div>
    <div class="card" style="margin-bottom:16px"><div class="card-head"><h2>As 8 perguntas</h2></div><div class="card-body flush"><div class="table-wrap"><table><thead><tr><th style="width:220px">Pergunta</th><th>Resposta objetiva</th><th style="width:260px">Base no edital</th></tr></thead><tbody>
      ${(r.perguntas || []).map((p) => `<tr><td><strong>${esc(p.pergunta)}</strong></td><td style="${NAO_LOC.test(p.resposta) ? "color:var(--muted)" : ""}">${esc(p.resposta)}</td><td class="muted" style="font-size:12px">${esc(p.base || "")}${p.pagina ? ` · pág. ${p.pagina}` : ""}</td></tr>`).join("")}</tbody></table></div></div></div>
    ${(r.documentacaoEspecial || []).length ? `<div class="card" style="margin-bottom:16px;border-left:3px solid var(--red)"><div class="card-head"><h2>Alerta de documentação especial</h2></div><div class="card-body flush"><div class="table-wrap"><table><thead><tr><th>Documento</th><th>Fase</th><th>Cláusula</th><th>Risco</th></tr></thead><tbody>
      ${r.documentacaoEspecial.map((d) => `<tr><td><strong>${esc(d.documento)}</strong></td><td>${esc(d.fase || "")}</td><td class="muted" style="font-size:12px">${esc(d.clausula || "")}${d.pagina ? ` · pág. ${d.pagina}` : ""}</td><td>${esc(d.risco || "")}</td></tr>`).join("")}</tbody></table></div></div></div>` : ""}
    ${(r.observacoes || []).length ? `<div class="card"><div class="card-head"><h2>Observações relevantes</h2></div><div class="card-body"><ul style="margin:0;padding-left:18px;font-size:13.5px">${r.observacoes.map((o) => `<li>${esc(o)}</li>`).join("")}</ul></div></div>` : ""}`;
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
  const L = r.licitacao || {};
  return [`${L.modalidade || "Licitação"} ${L.numero || ""} — ${L.orgao || ""}${L.uasg ? " (UASG " + L.uasg + ")" : ""}`, L.dataSessao ? `Sessão: ${fmtD(L.dataSessao)} ${L.horaSessao || ""}` : "", "",
    ...(r.perguntas || []).map((p) => `${p.pergunta}: ${p.resposta}${p.base ? ` [${p.base}${p.pagina ? ", pág. " + p.pagina : ""}]` : ""}`), "",
    (r.documentacaoEspecial || []).length ? "DOCUMENTAÇÃO ESPECIAL:\n" + r.documentacaoEspecial.map((d) => `- ${d.documento} (${d.fase}${d.clausula ? ", " + d.clausula : ""})${d.risco ? " — " + d.risco : ""}`).join("\n") : "",
    (r.itens || []).length ? `\nITENS (${r.itens.length}):\n` + r.itens.map((i) => `${i.item} | ${i.descricao} | ${i.quantidade ?? ""} ${i.unidade || ""} | ${i.precoReferencia != null ? fmt(i.precoReferencia) : ""}`).join("\n") : "",
  ].filter((x) => x !== null).join("\n");
}

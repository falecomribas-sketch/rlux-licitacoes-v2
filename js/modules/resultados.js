// Resultados de disputa: êxito por item, onde perdemos (classe da perda) e para quem, com cortes por família, UF, portal e concorrente.
import { store } from "../core/store.js?v=20261125-182540";
import { icon, tag } from "../core/ui.js?v=20261125-182540";
import { esc, fmt, fmtNum, fmtD, fmtDc, toTitleCase } from "../core/utils.js?v=20261125-182540";
import { exportarExcel } from "../core/forms.js?v=20261125-182540";
import { iniciarPreco } from "../core/preco.js?v=20261125-182540";
import { linhasResultados, agrupar, CLASSE_ROTULO } from "../core/resultados.js?v=20261125-182540";

let unsub = null, corte = "familia", filtroClasse = "", busca = "", ordem = "data", dir = "desc", de = "", ate = "", limite = 60, orgaoSel = "";
const CORTES = { familia: ["Família", (r) => r.familiaNome], uf: ["UF", (r) => r.uf || "—"], portal: ["Portal", (r) => r.portal || "—"], concorrente: ["Concorrente (quem venceu)", (r) => r.perdido ? (r.vencedor || "—") : "RLUX (ganho)"], marca: ["Marca do vencedor", (r) => r.perdido ? (r.marcaVencedor || "não informada") : (r.nossaMarca ? `RLUX · ${r.nossaMarca}` : "RLUX (ganho)")], orgao: ["Órgão", (r) => toTitleCase(r.o?.nome || "—")], mes: ["Mês", (r) => (r.data || "").slice(0, 7) || "—"] };
const pct = (v) => v === null || v === undefined || isNaN(v) ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

export default {
  id: "resultados", titulo: "Resultados de disputa", grupo: "Licitações", icone: "chart",
  render(el) {
    iniciarPreco();
    const desenhar = () => {
      const todas = linhasResultados();
      const periodo = todas.filter((r) => (!de || (r.data || "") >= de) && (!ate || (r.data || "") <= ate) && (!orgaoSel || r.o?.id === orgaoSel));
      const orgaosComResultado = [...new Map(todas.filter((r) => r.o?.id).map((r) => [r.o.id, r.o])).values()].sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
      const q = busca.trim().toLowerCase();
      const lst = periodo.filter((r) => (!filtroClasse || (filtroClasse === "perdido" ? r.perdido : r.classe === filtroClasse)) && (!q || [r.nome, r.codigo, r.vencedor, r.marcaVencedor, r.o?.nome, r.l?.numero, r.uf, r.portal, r.familiaNome].some((x) => String(x || "").toLowerCase().includes(q))));
      const g = agrupar(periodo, () => "tudo")[0] || { itens: 0, ganhos: 0, perdidos: 0, valorGanho: 0, valorPerdido: 0, exito: 0, difMedia: null, classes: {} };
      const comConc = periodo.filter((r) => r.perdido && r.precoVencedor).length;
      const grupos = agrupar(periodo, CORTES[corte][1]);
      const chave = { data: (r) => r.data || "", item: (r) => r.nome || "", orgao: (r) => r.o?.nome || "", nosso: (r) => r.nosso, venc: (r) => r.precoVencedor || 0, marca: (r) => (r.perdido ? r.marcaVencedor : r.marcaNossa) || "", dif: (r) => r.difPct ?? -999, classe: (r) => r.classe, valor: (r) => r.valor }[ordem] || ((r) => r.data || "");
      const ord = lst.slice().sort((a, b) => { const x = chave(a), y = chave(b); const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR", { numeric: true }); return dir === "asc" ? c : -c; });
      const th = (k, t, cls = "") => `<th class="sortable ${cls} ${ordem === k ? dir : ""}" data-ord="${k}">${t}</th>`;
      el.innerHTML = `
        <div class="grid grid-6" style="margin-bottom:16px">
          <div class="kpi"><div class="kpi-label">Itens disputados</div><div class="kpi-value">${g.itens}</div><div class="kpi-note">${periodo.length ? new Set(periodo.map((r) => r.p.id)).size : 0} disputa(s) com resultado</div></div>
          <div class="kpi"><div class="kpi-label">Êxito por item</div><div class="kpi-value" style="color:${g.exito >= 50 ? "var(--green)" : g.exito >= 30 ? "var(--amber-txt)" : "var(--red)"}">${g.exito.toFixed(0)}%</div><div class="kpi-note">${g.ganhos} ganho(s) · ${g.perdidos} perdido(s)</div></div>
          <div class="kpi"><div class="kpi-label">Valor ganho</div><div class="kpi-value" style="color:var(--green)">${fmt(g.valorGanho)}</div></div>
          <div class="kpi"><div class="kpi-label">Valor perdido</div><div class="kpi-value" style="color:var(--red)">${fmt(g.valorPerdido)}</div><div class="kpi-note">ao preço do vencedor</div></div>
          <div class="kpi"><div class="kpi-label">Distância do vencedor</div><div class="kpi-value">${pct(g.difMedia)}</div><div class="kpi-note">média nos perdidos (${comConc} com concorrência)</div></div>
          <div class="kpi"><div class="kpi-label">Por que perdemos</div><div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">${["empate", "acima_piso", "entre_custo_piso", "abaixo_custo"].map((c) => g.classes[c] ? `<span class="tag ${CLASSE_ROTULO[c][1]}" title="${esc(CLASSE_ROTULO[c][2])}">${g.classes[c]} ${CLASSE_ROTULO[c][0]}</span>` : "").join("") || '<span class="muted" style="font-size:12px">importe os resultados da Effecti nas disputas</span>'}</div></div>
        </div>
        <div class="page-head"><h2>Resultados de disputa${orgaoSel ? ` — ${esc(toTitleCase(orgaosComResultado.find((o) => o.id === orgaoSel)?.nome || ""))}` : ""}</h2><div class="actions"><button class="btn btn-ghost" data-act="excel">${icon("download")} Excel</button></div></div>
        <div class="card"><div class="card-body" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:13px">
          <span class="muted">Período (data da disputa)</span><input type="date" class="input input-sm" id="res-de" value="${de}" style="width:140px"><span>até</span><input type="date" class="input input-sm" id="res-ate" value="${ate}" style="width:140px">
          <span class="muted" style="margin-left:10px">Órgão</span><select class="input input-sm" id="res-orgao" style="width:auto;max-width:320px"><option value="">Todos</option>${orgaosComResultado.map((o) => `<option value="${esc(o.id)}" ${orgaoSel === o.id ? "selected" : ""}>${esc(toTitleCase(o.nome || ""))}${o.uasg ? ` · ${esc(String(o.uasg).split(/\s+/)[0])}` : ""}${o.estado ? ` (${esc(o.estado)})` : ""}</option>`).join("")}</select>
          <span class="muted" style="margin-left:10px">Agrupar por</span><select class="input input-sm" id="res-corte" style="width:auto">${Object.entries(CORTES).map(([k, [t]]) => `<option value="${k}" ${corte === k ? "selected" : ""}>${t}</option>`).join("")}</select>
        </div>
        <div class="card-body flush"><div class="table-wrap"><table><thead><tr><th>${CORTES[corte][0]}</th><th class="num">Itens</th><th class="num">Ganhos</th><th class="num">Êxito</th><th class="num">Valor ganho</th><th class="num">Valor perdido</th><th class="num">Dist. média</th><th>Por que perdemos</th></tr></thead><tbody>
          ${grupos.map((x) => `<tr><td><strong>${esc(String(x.chave).slice(0, 60))}</strong></td><td class="num">${x.itens}</td><td class="num">${x.ganhos}</td><td class="num"><strong style="color:${x.exito >= 50 ? "var(--green)" : x.exito >= 30 ? "var(--amber-txt)" : "var(--red)"}">${x.exito.toFixed(0)}%</strong></td><td class="num">${fmt(x.valorGanho)}</td><td class="num">${fmt(x.valorPerdido)}</td><td class="num">${pct(x.difMedia)}</td><td>${Object.entries(x.classes).map(([c, n]) => `<span class="tag ${CLASSE_ROTULO[c]?.[1] || "tag-gray"}" style="margin:1px">${n} ${CLASSE_ROTULO[c]?.[0] || c}</span>`).join(" ") || '<span class="muted">—</span>'}</td></tr>`).join("") || '<tr><td colspan="8" class="muted" style="text-align:center;padding:24px">Nenhuma disputa com resultado registrado no período. Registre o resultado nas propostas (botão de resultado) — de preferência importando a exportação da Effecti.</td></tr>'}
        </tbody></table></div></div></div>
        <div class="card"><div class="card-head"><h2>Itens</h2><span class="muted">${lst.length} de ${periodo.length}</span></div>
          <div class="card-body" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <label class="search" style="min-width:280px"><span class="search-ic">${icon("search")}</span><input type="search" class="input" id="res-busca" placeholder="Buscar item, órgão, concorrente, pregão…" value="${esc(busca)}"></label>
            <div class="chip-filters" style="margin:0">${[["", "Todos"], ["ganho", "Ganhos"], ["perdido", "Perdidos"], ["empate", "Empate / centavos"], ["acima_piso", "Acima do piso"], ["entre_custo_piso", "Entre custo e piso"], ["abaixo_custo", "Abaixo do custo"], ["convocado", "Por convocação"]].map(([v, t]) => `<button class="chip ${filtroClasse === v ? "active" : ""}" data-classe="${v}">${t}</button>`).join("")}</div>
          </div>
          <div class="card-body flush"><div class="table-wrap"><table><thead><tr>${th("data", "Disputa")}${th("orgao", "Órgão / pregão")}${th("item", "Item")}<th class="num">Qtd</th><th class="num">Custo</th><th class="num">Piso</th>${th("nosso", "Nosso final", "num")}${th("venc", "Vencedor", "num")}${th("marca", "Marca")}${th("dif", "Dist.", "num")}${th("classe", "Resultado")}</tr></thead><tbody>
            ${ord.slice(0, limite).map((r) => `<tr><td style="white-space:nowrap">${fmtDc(r.data)}</td><td>${esc(toTitleCase((r.o?.nome || "—").slice(0, 40)))}<div class="muted" style="font-size:11px">${esc(r.l?.numero || "")} · ${esc(r.uf)}${r.portal ? " · " + esc(r.portal) : ""}</div></td><td><strong>${esc(r.num ?? "")}</strong> ${esc((r.nome || "").slice(0, 50))}<div class="muted" style="font-size:11px">${esc(r.familiaNome)}</div></td><td class="num">${fmtNum(r.qtd)}</td><td class="num">${r.custo ? fmt(r.custo) : "—"}</td><td class="num">${r.piso ? fmt(r.piso) : "—"}</td><td class="num">${r.nosso ? fmt(r.nosso) : "—"}${r.nossaPosicao ? `<div class="muted" style="font-size:11px">${r.nossaPosicao}º de ${r.nLances || "?"}</div>` : ""}</td><td class="num">${r.perdido ? (r.precoVencedor ? `<strong>${fmt(r.precoVencedor)}</strong><div class="muted" style="font-size:11px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.vencedor)}">${esc(r.vencedor)}</div>` : '<span class="muted">não informado</span>') : '<span class="muted">RLUX</span>'}</td><td style="font-size:12.5px;max-width:170px">${r.perdido ? (r.marcaVencedor ? `<strong style="color:var(--purple)" title="Marca/modelo do vencedor">${esc(r.marcaVencedor)}</strong>` : '<span class="muted">—</span>') + (r.marcaNossa ? `<div class="muted" style="font-size:11px">nossa: ${esc(r.marcaNossa)}</div>` : "") : (r.marcaNossa ? esc(r.marcaNossa) : '<span class="muted">—</span>')}</td><td class="num" style="color:${r.difPct > 0 ? "var(--red)" : ""}">${r.perdido ? pct(r.difPct) : "—"}</td><td>${r.classe ? tag(CLASSE_ROTULO[r.classe][0], CLASSE_ROTULO[r.classe][1]) : r.perdido ? tag("Perdido", "tag-gray") : ""}</td></tr>`).join("") || '<tr><td colspan="11" class="muted" style="text-align:center;padding:20px">Nada a mostrar.</td></tr>'}
          </tbody></table></div>${ord.length > limite ? `<div style="padding:10px;text-align:center"><button class="btn btn-ghost btn-sm" data-act="mais">Mostrar mais (${ord.length - limite} restantes)</button></div>` : ""}</div></div>`;
      el.querySelector("#res-de").addEventListener("change", (e) => { de = e.target.value; desenhar(); });
      el.querySelector("#res-ate").addEventListener("change", (e) => { ate = e.target.value; desenhar(); });
      el.querySelector("#res-corte").addEventListener("change", (e) => { corte = e.target.value; desenhar(); });
      el.querySelector("#res-orgao").addEventListener("change", (e) => { orgaoSel = e.target.value; desenhar(); });
      const bi = el.querySelector("#res-busca"); bi.addEventListener("input", () => { busca = bi.value; const pos = bi.selectionStart; desenhar(); const nb = el.querySelector("#res-busca"); nb.focus(); nb.setSelectionRange(pos, pos); });
      el.querySelectorAll("[data-classe]").forEach((b) => b.addEventListener("click", () => { filtroClasse = b.dataset.classe; desenhar(); }));
      el.querySelectorAll("th.sortable").forEach((h) => h.addEventListener("click", () => { const k = h.dataset.ord; if (ordem === k) dir = dir === "asc" ? "desc" : "asc"; else { ordem = k; dir = k === "data" ? "desc" : "asc"; } desenhar(); }));
      el.querySelector("[data-act=mais]")?.addEventListener("click", () => { limite += 100; desenhar(); });
      el.querySelector("[data-act=excel]").addEventListener("click", () => exportarExcel(ord.map((r) => ({ Disputa: fmtD(r.data), Órgão: r.o?.nome || "", UF: r.uf, Pregão: r.l?.numero || "", Portal: r.portal, Item: r.num, Produto: r.nome, Código: r.codigo, Família: r.familiaNome, Qtd: r.qtd, Custo: r.custo, Piso: r.piso, "Preço inicial": r.precoInicial, "Nosso final": r.nosso, "Nossa posição": r.nossaPosicao || "", Lances: r.nLances || "", Vencedor: r.perdido ? r.vencedor : "RLUX", "Preço vencedor": r.perdido ? r.precoVencedor : r.nosso, "Marca do vencedor": r.perdido ? (r.marcaVencedor || "") : (r.marcaNossa || ""), "Nossa marca": r.marcaNossa || "", "2º colocado": r.precoSegundo || "", "Distância %": r.difPct ?? "", Resultado: r.classe ? CLASSE_ROTULO[r.classe][0] : r.perdido ? "Perdido" : "Ganho" })), "Resultados", "resultados_disputa"));
    };
    desenhar();
    unsub = store.on("*", () => { if (!el.isConnected || document.activeElement?.id === "res-busca") return; desenhar(); });
  },
  destroy() { unsub?.(); unsub = null; },
};

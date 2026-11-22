// Concorrentes: quem vence as disputas em que a RLUX participa — ranking e raio-x por empresa.
import { store } from "../core/store.js?v=20261122-144322";
import { icon, tag } from "../core/ui.js?v=20261122-144322";
import { esc, fmt, fmtNum, fmtD, fmtDc, toTitleCase, cnpjFormatado } from "../core/utils.js?v=20261122-144322";
import { exportarExcel } from "../core/forms.js?v=20261122-144322";
import { iniciarPreco } from "../core/preco.js?v=20261122-144322";
import { linhasResultados, participacoes, rankingConcorrentes, CLASSE_ROTULO } from "../core/resultados.js?v=20261122-144322";

let unsub = null, de = "", ate = "", uf = "", fam = "", portal = "", criterio = "valor", busca = "", sel = "", limite = 25;
const CRIT = { valor: ["Valor ganho", (g) => g.valorGanho], itens: ["Itens ganhos", (g) => g.vitorias], sobre: ["Vitórias sobre a RLUX", (g) => g.sobreNos], presenca: ["Presença", (g) => g.itens] };
const mil = (v) => v >= 1e6 ? `R$ ${(v / 1e6).toFixed(1).replace(".", ",")} mi` : v >= 1e4 ? `R$ ${Math.round(v / 1e3)} mil` : fmt(v);
const pct = (v) => v === null || v === undefined || isNaN(v) ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`;
const top = (obj, n = 6) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
const barras = (pares, fmtV, cor = "var(--navy-2)") => { const max = Math.max(1, ...pares.map((p) => p[1])); return pares.map(([k, v]) => `<div class="cbar"><span title="${esc(k)}">${esc(String(k).slice(0, 26))}</span><div><i style="width:${Math.max(2, v / max * 100)}%;background:${cor}"></i></div><b>${fmtV(v)}</b></div>`).join("") || '<div class="muted" style="font-size:12px">—</div>'; };
const placar = (g) => { const cls = g.confrontos ? (g.sobreNos > g.paraNos ? "tag-red" : g.sobreNos === g.paraNos ? "tag-amber" : "tag-green") : "tag-gray"; return `<span class="tag ${cls}" title="Itens em que ambos deram lance: vitórias deles × nossas">${g.sobreNos} × ${g.paraNos}</span>`; };

export default {
  id: "concorrentes", titulo: "Concorrentes", grupo: "Licitações", icone: "users",
  render(el) {
    iniciarPreco();
    const desenhar = () => {
      const todas = linhasResultados();
      const periodo = todas.filter((r) => (!de || (r.data || "") >= de) && (!ate || (r.data || "") <= ate) && (!uf || r.uf === uf) && (!fam || r.familiaNome === fam) && (!portal || r.portal === portal));
      const rankTodos = rankingConcorrentes(participacoes(periodo, { incluirNos: true })); const rank = rankTodos.filter((g) => !g.nos); const nosG = rankTodos.find((g) => g.nos);
      const q = busca.trim().toLowerCase(); const chaveOrd = CRIT[criterio][1];
      const lista = rankTodos.filter((g) => !q || g.nome.toLowerCase().includes(q) || (g.cnpj || "").includes(q) || (g.nos && "rlux".includes(q))).sort((a, b) => chaveOrd(b) - chaveOrd(a) || b.valorGanho - a.valorGanho);
      const valorConc = rank.reduce((a, g) => a + g.valorGanho, 0); const valorNos = periodo.filter((r) => !r.perdido).reduce((a, r) => a + r.valor, 0);
      const top5 = lista.slice(0, 5).reduce((a, g) => a + g.valorGanho, 0); const rival = rank.slice().sort((a, b) => b.sobreNos - a.sobreNos || b.valorGanho - a.valorGanho)[0];
      if (!lista.some((g) => g.chave === sel)) sel = lista[0]?.chave || "";
      const g = lista.find((x) => x.chave === sel) || null; const maxV = Math.max(1, ...lista.map((x) => chaveOrd(x)));
      const opt = (arr, cur, todos) => `<option value="">${todos}</option>` + arr.map((v) => `<option value="${esc(v)}" ${cur === v ? "selected" : ""}>${esc(v)}</option>`).join("");
      const ufs = [...new Set(todas.map((r) => r.uf).filter(Boolean))].sort(), fams = [...new Set(todas.map((r) => r.familiaNome).filter(Boolean))].sort(), portais = [...new Set(todas.map((r) => r.portal).filter(Boolean))].sort();
      el.innerHTML = `
        <div class="page-head"><div><h2>Concorrentes</h2><div class="muted" style="font-size:13px">Quem vence as disputas em que a RLUX participa — a partir dos resultados importados da Effecti. Clique em uma empresa para abrir o raio-x.</div></div><div class="actions"><button class="btn btn-ghost" data-act="excel">${icon("download")} Excel</button></div></div>
        <div class="grid grid-5" style="margin-bottom:14px">
          <div class="kpi"><div class="kpi-label">Concorrentes identificados</div><div class="kpi-value">${rank.length}</div><div class="kpi-note">em ${new Set(periodo.map((r) => r.p.id)).size} disputa(s) · ${periodo.length} itens</div></div>
          <div class="kpi"><div class="kpi-label">Valor adjudicado a concorrentes</div><div class="kpi-value" style="color:var(--red)">${mil(valorConc)}</div><div class="kpi-note">ao preço do vencedor</div></div>
          <div class="kpi"><div class="kpi-label">Valor que a RLUX levou</div><div class="kpi-value" style="color:var(--green)">${mil(valorNos)}</div><div class="kpi-note">${valorConc + valorNos ? Math.round(valorNos / (valorConc + valorNos) * 100) : 0}% do total disputado</div></div>
          <div class="kpi"><div class="kpi-label">Top 5 concentram</div><div class="kpi-value">${valorConc ? Math.round(top5 / valorConc * 100) : 0}%</div><div class="kpi-note">do valor perdido</div></div>
          <div class="kpi"><div class="kpi-label">Rival nº 1</div><div class="kpi-value" style="font-size:14px;line-height:1.25;margin-top:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden" title="${rival ? esc(rival.nome) : ""}">${rival ? esc(toTitleCase(rival.nome)) : "—"}</div><div class="kpi-note">${rival ? `${rival.vitorias} itens · ganhou ${rival.sobreNos} de ${rival.confrontos} contra nós` : "importe resultados nas disputas"}</div></div>
        </div>
        <div class="card"><div class="card-body" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px">
          <span class="muted">Período</span><input type="date" class="input input-sm" id="c-de" value="${de}" style="width:135px"><span>até</span><input type="date" class="input input-sm" id="c-ate" value="${ate}" style="width:135px">
          <span class="muted" style="margin-left:6px">UF</span><select class="input input-sm" id="c-uf" style="width:auto">${opt(ufs, uf, "Todas")}</select>
          <span class="muted" style="margin-left:6px">Família</span><select class="input input-sm" id="c-fam" style="width:auto;max-width:180px">${opt(fams, fam, "Todas")}</select>
          <span class="muted" style="margin-left:6px">Portal</span><select class="input input-sm" id="c-portal" style="width:auto">${opt(portais, portal, "Todos")}</select>
          <span class="muted" style="margin-left:auto">Ranquear por</span><div class="chip-filters" style="margin:0">${Object.entries(CRIT).map(([k, [t]]) => `<button class="chip ${criterio === k ? "active" : ""}" data-crit="${k}">${t}</button>`).join("")}</div>
        </div></div>
        <div class="conc-grid">
          <div class="card"><div class="card-head"><h2>Ranking de vencedores</h2><span class="muted" style="font-size:12px">${lista.length} empresa(s) · por ${CRIT[criterio][0].toLowerCase()}</span></div>
            <div class="card-body" style="padding:8px 14px"><label class="search" style="max-width:360px"><span class="search-ic">${icon("search")}</span><input type="search" class="input" id="c-busca" placeholder="Buscar empresa ou CNPJ…" value="${esc(busca)}"></label></div>
            <div class="card-body flush"><div class="table-wrap"><table><thead><tr><th>#</th><th>Empresa</th><th class="num">Itens</th><th class="num">Valor ganho</th><th>Participação</th><th class="num" title="Itens em que ambos deram lance: vitórias deles × nossas">vs RLUX</th><th>UFs</th><th>Famílias</th></tr></thead><tbody>
              ${lista.slice(0, limite).map((x, i) => `<tr class="conc-row ${x.chave === sel ? "row-active" : ""} ${x.nos ? "conc-nos" : ""}" data-sel="${esc(x.chave)}" style="cursor:pointer"><td><span class="rk ${i < 3 ? "ouro" : ""}">${i + 1}</span></td><td><strong>${x.nos ? "RLUX Iluminação" : esc(toTitleCase(x.nome))}</strong>${x.nos ? ' <span class="tag tag-green">nós</span>' : ""}<div class="muted" style="font-size:11px">${esc(x.porte || "")}${x.cnpj ? (x.porte ? " · " : "") + esc(cnpjFormatado(x.cnpj)) : ""}</div></td><td class="num">${x.vitorias}<div class="muted" style="font-size:11px">de ${x.itens}</div></td><td class="num"><strong>${fmt(x.valorGanho)}</strong></td><td><div class="sp"><i style="width:${Math.max(2, chaveOrd(x) / maxV * 100)}%"></i></div></td><td class="num">${x.nos ? '<span class="muted">—</span>' : placar(x)}</td><td style="font-size:12px">${esc(top(x.ufs, 4).map((p) => p[0]).join(", ") || "—")}</td><td style="font-size:12px">${esc(top(x.familias, 2).map((p) => p[0]).join(", ") || "—")}</td></tr>`).join("") || '<tr><td colspan="8" class="muted" style="text-align:center;padding:24px">Nenhum concorrente no período. Importe a exportação de resultados da Effecti no "Resultado da disputa" das propostas.</td></tr>'}
            </tbody></table></div>${lista.length > limite ? `<div style="padding:10px;text-align:center"><button class="btn btn-ghost btn-sm" data-act="mais">Mostrar mais (${lista.length - limite} restantes)</button></div>` : ""}
            <div class="muted" style="font-size:11.5px;padding:10px 14px;border-top:1px solid var(--line)">"Itens" = vencidos / em que apareceu. "vs RLUX" = itens em que ambos deram lance: vitórias deles × nossas. Lances de desistência (≥ R$ 10.000) são ignorados.</div></div></div>
          <div class="card">${g ? raioX(g) : '<div class="card-body muted">Selecione uma empresa.</div>'}</div>
        </div>`;
      el.querySelector("#c-de").addEventListener("change", (e) => { de = e.target.value; desenhar(); });
      el.querySelector("#c-ate").addEventListener("change", (e) => { ate = e.target.value; desenhar(); });
      el.querySelector("#c-uf").addEventListener("change", (e) => { uf = e.target.value; desenhar(); });
      el.querySelector("#c-fam").addEventListener("change", (e) => { fam = e.target.value; desenhar(); });
      el.querySelector("#c-portal").addEventListener("change", (e) => { portal = e.target.value; desenhar(); });
      el.querySelectorAll("[data-crit]").forEach((b) => b.addEventListener("click", () => { criterio = b.dataset.crit; desenhar(); }));
      el.querySelectorAll("[data-sel]").forEach((tr) => tr.addEventListener("click", () => { sel = tr.dataset.sel; desenhar(); el.querySelector(".conc-grid > .card:last-child")?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }));
      el.querySelector("[data-act=mais]")?.addEventListener("click", () => { limite += 50; desenhar(); });
      const bi = el.querySelector("#c-busca"); bi.addEventListener("input", () => { busca = bi.value; const pos = bi.selectionStart; desenhar(); const nb = el.querySelector("#c-busca"); nb.focus(); nb.setSelectionRange(pos, pos); });
      el.querySelector("[data-act=excel]").addEventListener("click", () => exportarExcel(lista.map((x, i) => ({ "#": i + 1, Empresa: x.nos ? "RLUX Iluminação (nós)" : x.nome, CNPJ: x.cnpj ? cnpjFormatado(x.cnpj) : "", Porte: x.porte, "Itens em que apareceu": x.itens, "Itens vencidos": x.vitorias, "Valor ganho": +x.valorGanho.toFixed(2), Disputas: x.disputas, "Vitórias sobre a RLUX": x.sobreNos, "Derrotas para a RLUX": x.paraNos, "Confrontos": x.confrontos, "Posição média": x.posMedia ? +x.posMedia.toFixed(1) : "", "Fecha abaixo de nós (%)": x.difMedia !== null ? +x.difMedia.toFixed(1) : "", UFs: top(x.ufs, 10).map((p) => `${p[0]} (${fmt(p[1])})`).join("; "), Famílias: top(x.familias, 10).map((p) => `${p[0]} (${fmt(p[1])})`).join("; "), Marcas: top(x.marcas, 10).map((p) => `${p[0]} (${p[1]})`).join("; "), "Última vez": fmtD(x.ultima) })), "Concorrentes", "concorrentes"));
    };
    desenhar();
    unsub = store.on("*", () => { if (!el.isConnected || document.activeElement?.id === "c-busca") return; desenhar(); });
  },
  destroy() { unsub?.(); unsub = null; },
};

function raioX(g) {
  const ult = g.itensVencidos[0];
  return `<div class="card-body">
    <h3 style="margin:0;font-size:16px">${g.nos ? "RLUX Iluminação (nós)" : esc(toTitleCase(g.nome))}</h3>
    <div class="muted" style="font-size:12px;margin:2px 0 12px">${esc(g.porte || "porte não informado")}${g.cnpj ? " · CNPJ " + esc(cnpjFormatado(g.cnpj)) : ""} · vista em ${g.disputas} disputa(s) · posição média ${g.posMedia ? g.posMedia.toFixed(1).replace(".", ",") + "º" : "—"}${ult ? ` · última: ${fmtD(ult.r.data)} (${esc(toTitleCase((ult.r.o?.nome || "").slice(0, 40)))})` : ""}</div>
    <div class="grid grid-4" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-label">Itens ganhos</div><div class="kpi-value">${g.vitorias}</div><div class="kpi-note">de ${g.itens} em que apareceu</div></div>
      <div class="kpi"><div class="kpi-label">Valor ganho</div><div class="kpi-value">${mil(g.valorGanho)}</div></div>
      ${g.nos ? "" : `<div class="kpi"><div class="kpi-label">Contra a RLUX</div><div class="kpi-value" style="color:${g.sobreNos > g.paraNos ? "var(--red)" : "var(--green)"}">${g.sobreNos} × ${g.paraNos}</div><div class="kpi-note">${g.confrontos} confronto(s)</div></div>
      <div class="kpi"><div class="kpi-label">Fecha abaixo de nós</div><div class="kpi-value">${g.difMedia !== null ? pct(g.difMedia) : "—"}</div><div class="kpi-note">média quando nos venceu</div></div>`}
    </div>
    <div class="conc-two"><div><div class="h4">Por estado (valor ganho)</div>${barras(top(g.ufs), mil)}</div><div><div class="h4">Por família de produto</div>${barras(top(g.familias), mil, "var(--purple)")}</div></div>
    <div class="conc-two"><div>${g.nos ? "" : `<div class="h4">Como ganha de nós</div>`}${g.nos ? "" : barras(["abaixo_custo", "entre_custo_piso", "acima_piso", "empate"].filter((c) => g.classes[c]).map((c) => [CLASSE_ROTULO[c][0], g.classes[c]]), (v) => String(v), "var(--red)")}</div>
      <div><div class="h4">Marcas que oferta</div><div style="font-size:12.5px;line-height:1.9">${top(g.marcas, 8).map(([m, n]) => `<span class="tag tag-purple">${esc(m)}</span> ${n}`).join(" · ") || '<span class="muted">não informadas nos arquivos</span>'}</div>
        <div class="h4" style="margin-top:10px">Produtos em que mais ganha</div><div style="font-size:12px;line-height:1.6">${top(g.produtos, 5).map(([p, n]) => `${esc(p)} · ${n} item(ns)`).join("<br>") || "—"}</div></div></div>
    <div class="h4">Órgãos onde mais ganha</div><div style="font-size:12px;line-height:1.6;margin-bottom:12px">${top(g.orgaos, 4).map(([o, v]) => `${esc(toTitleCase(o))} · ${mil(v)}`).join("<br>") || "—"}</div>
    <div class="h4">Itens em que venceu (últimos)</div>
    <div class="table-wrap"><table><thead><tr><th>Data</th><th>Órgão</th><th>Item</th><th class="num">Preço dele</th><th class="num">Nosso</th><th class="num">Dist.</th></tr></thead><tbody>
      ${g.itensVencidos.slice(0, 12).map((x) => `<tr><td style="white-space:nowrap">${fmtDc(x.r.data)}</td><td>${esc(toTitleCase((x.r.o?.nome || "—").slice(0, 32)))}<div class="muted" style="font-size:11px">${esc(x.r.uf)}</div></td><td>${esc(String(x.r.num ?? ""))} ${esc((x.r.nome || "").slice(0, 40))}${x.marca ? `<div class="muted" style="font-size:11px">${esc(x.marca)}</div>` : ""}</td><td class="num"><strong>${fmt(x.valor)}</strong></td><td class="num">${x.nossoLance ? fmt(x.nossoLance) : '<span class="muted">—</span>'}</td><td class="num" style="color:var(--red)">${x.nossoLance ? pct((x.nossoLance - x.valor) / x.valor * 100) : "—"}</td></tr>`).join("")}
    </tbody></table></div></div>`;
}

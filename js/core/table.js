// Tabela de dados reutilizável: busca, ordenação por coluna, estado vazio.
//
// const t = dataTable({
//   el, columns: [{ key, label, render?(row), sort?(row), num?, width? }],
//   rows: () => array, search?(row, q), sort: { key, dir }, empty: "texto",
// });
// t.refresh()  -> re-renderiza com os dados atuais
import { esc } from "./utils.js?v=20261113-114024";
import { vazio, icon } from "./ui.js?v=20261113-114024";

export function dataTable(cfg) {
  const state = { q: "", sort: { ...(cfg.sort || { key: cfg.columns[0].key, dir: "asc" }) } };
  const el = cfg.el;

  el.innerHTML = `
    <div class="table-tools">
      ${cfg.search ? `<label class="search"><span class="search-ic">${icon("search")}</span><input type="search" class="input" placeholder="${esc(cfg.placeholder || "Buscar…")}" aria-label="Buscar"></label>` : ""}
      <div class="table-tools-right">${cfg.tools || ""}</div>
      <div class="table-count muted" data-count></div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr>${cfg.columns.map((c) => `<th class="${c.sort !== false ? "sortable" : ""} ${c.num ? "num" : ""}" data-key="${c.key}" ${c.width ? `style="width:${c.width}"` : ""}>${esc(c.label)}</th>`).join("")}</tr></thead>
      <tbody></tbody>
    </table></div>`;

  const tbody = el.querySelector("tbody");
  const input = el.querySelector("input[type=search]");
  const count = el.querySelector("[data-count]");

  input?.addEventListener("input", () => { state.q = input.value.trim().toLowerCase(); render(); });
  el.querySelectorAll("th.sortable").forEach((th) => th.addEventListener("click", () => {
    const key = th.dataset.key;
    if (state.sort.key === key) state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
    else state.sort = { key, dir: "asc" };
    render();
  }));

  function render() {
    const all = cfg.rows();
    let rows = state.q && cfg.search ? all.filter((r) => cfg.search(r, state.q)) : all.slice();
    const col = cfg.columns.find((c) => c.key === state.sort.key);
    if (col) {
      const sv = col.sort || ((r) => r[col.key]);
      rows.sort((a, b) => {
        const va = sv(a), vb = sv(b);
        let c;
        if (typeof va === "number" || typeof vb === "number") c = (va ?? -Infinity) - (vb ?? -Infinity);
        else c = String(va ?? "").localeCompare(String(vb ?? ""), "pt-BR", { numeric: true, sensitivity: "base" });
        return state.sort.dir === "asc" ? c : -c;
      });
    }
    el.querySelectorAll("th").forEach((th) => { th.classList.remove("asc", "desc"); if (th.dataset.key === state.sort.key) th.classList.add(state.sort.dir); });
    count.textContent = state.q ? `${rows.length} de ${all.length}` : `${all.length} registro${all.length === 1 ? "" : "s"}`;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${cfg.columns.length}">${vazio(state.q ? "Nenhum resultado para a busca" : (cfg.empty || "Nenhum registro ainda"), state.q ? "" : cfg.emptySub || "")}</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map((r) => `<tr data-id="${esc(r.id)}">${cfg.columns.map((c) =>
      `<td class="${c.num ? "num" : ""}">${c.render ? c.render(r) : esc(r[c.key] ?? "—")}</td>`).join("")}</tr>`).join("");
  }

  render();
  return { refresh: render, get query() { return state.q; } };
}

// Botões de ação padrão em linhas de tabela
export const acoes = (...btns) => `<div class="row-actions">${btns.join("")}</div>`;
export const btnEditar = (id) => `<button class="icon-btn sm" data-act="editar" data-id="${esc(id)}" title="Editar" aria-label="Editar">${icon("edit")}</button>`;
export const btnExcluir = (id, bloqueado = "") => bloqueado
  ? `<button class="icon-btn sm" disabled title="${esc(bloqueado)}" aria-label="Excluir (bloqueado)">${icon("trash")}</button>`
  : `<button class="icon-btn sm danger" data-act="excluir" data-id="${esc(id)}" title="Excluir" aria-label="Excluir">${icon("trash")}</button>`;
export const btnVer = (id) => `<button class="icon-btn sm" data-act="ver" data-id="${esc(id)}" title="Ver detalhes" aria-label="Ver detalhes">${icon("eye")}</button>`;

// Delegação de cliques em botões data-act dentro de um container
export function onAction(el, handlers) {
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    handlers[b.dataset.act]?.(b.dataset.id, b);
  });
}

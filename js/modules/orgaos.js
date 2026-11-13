// Órgãos públicos. Campos: id, uasg, nome, cnpj, municipio, estado, contatos[{nome,cargo,email,telefone}]
import { store, newId } from "../core/store.js?v=20261113-164426";
import { dataTable, acoes, btnEditar, btnExcluir, btnVer, onAction } from "../core/table.js?v=20261113-164426";
import { formModal, lerForm, campo, inputTxt, select, linha, exportarExcel, UFS, mascaraCnpj } from "../core/forms.js?v=20261113-164426";
import { toast, confirmar, closeModal, openModal, icon, tag } from "../core/ui.js?v=20261113-164426";
import { esc, h, raw, toTitleCase, cnpjDigitos, cnpjFormatado } from "../core/utils.js?v=20261113-164426";
import { podeEditar } from "../core/auth.js?v=20261113-164426";
import { getPortal } from "../core/domain.js?v=20261113-164426";
import { popover } from "../core/popover.js?v=20261113-164426";

const REGIAO = {
  PR: "Sul", SC: "Sul", RS: "Sul", SP: "Sudeste", RJ: "Sudeste", MG: "Sudeste", ES: "Sudeste",
  AM: "Norte", PA: "Norte", AC: "Norte", RO: "Norte", RR: "Norte", AP: "Norte", TO: "Norte",
  BA: "Nordeste", PE: "Nordeste", CE: "Nordeste", MA: "Nordeste", PB: "Nordeste", RN: "Nordeste", AL: "Nordeste", SE: "Nordeste", PI: "Nordeste",
  MT: "Centro-Oeste", MS: "Centro-Oeste", GO: "Centro-Oeste", DF: "Centro-Oeste",
};
const REGIOES = ["Sul", "Sudeste", "Norte", "Nordeste", "Centro-Oeste"];
const COR_REGIAO = { Sul: "tag-blue", Sudeste: "tag-green", Norte: "tag-amber", Nordeste: "tag-red", "Centro-Oeste": "tag-purple" };

let unsub = null;
let regiao = "";

export default {
  id: "orgaos", titulo: "Órgãos", grupo: "Cadastros", icone: "building",

  render(el) {
    const licsDe = (id) => store.get("licitacoes").filter((l) => l.orgaoId === id);

    el.innerHTML = `
      <div class="grid grid-3" id="kpis" style="margin-bottom:16px"></div>
      <div class="page-head"><h2>Órgãos</h2>
        <div class="actions">
          <button class="btn btn-ghost" data-act="excel">${icon("download")} Excel</button>
          ${podeEditar() ? `<button class="btn btn-primary" data-act="novo">${icon("plus")} Novo órgão</button>` : ""}
        </div></div>
      <div class="card">
        <div class="chip-filters"><span class="muted">Região:</span>
          <button class="chip ${!regiao ? "active" : ""}" data-act="regiao" data-id="">Todas</button>
          ${REGIOES.map((r) => `<button class="chip ${regiao === r ? "active" : ""}" data-act="regiao" data-id="${r}">${r}</button>`).join("")}
        </div>
        <div class="card-body flush" id="tbl"></div></div>`;

    const kpis = () => {
      const todos = store.get("orgaos");
      el.querySelector("#kpis").innerHTML = `
        <div class="kpi"><div class="kpi-label">Órgãos cadastrados</div><div class="kpi-value">${todos.length}</div></div>
        <div class="kpi"><div class="kpi-label">Estados atendidos</div><div class="kpi-value">${new Set(todos.map((o) => o.estado).filter(Boolean)).size}</div></div>
        <div class="kpi"><div class="kpi-label">Sem contato cadastrado</div><div class="kpi-value">${todos.filter((o) => !(o.contatos || []).length).length}</div></div>`;
    };

    const tabela = dataTable({
      el: el.querySelector("#tbl"),
      rows: () => store.get("orgaos").filter((o) => !regiao || REGIAO[o.estado] === regiao),
      search: (o, q) => [o.nome, o.uasg, o.cnpj, o.municipio, o.estado, ...(o.contatos || []).flatMap((c) => [c.nome, c.email, c.telefone])]
        .some((x) => (x || "").toLowerCase().includes(q)),
      placeholder: "Buscar órgão, UASG, CNPJ, cidade ou contato…",
      sort: { key: "nome", dir: "asc" },
      empty: "Nenhum órgão cadastrado",
      columns: [
        { key: "uasg", label: "UASG", width: "90px", render: (o) => o.uasg ? tag(o.uasg, "tag-purple") : '<span class="muted">—</span>' },
        { key: "nome", label: "Nome", render: (o) => `<strong>${esc(toTitleCase(o.nome))}</strong>` },
        { key: "cnpj", label: "CNPJ", render: (o) => o.cnpj ? `<span class="mono muted">${esc(o.cnpj)}</span>` : '<span class="muted">—</span>' },
        { key: "municipio", label: "Município / UF", sort: (o) => `${o.estado || ""} ${o.municipio || ""}`,
          render: (o) => `${o.estado ? tag(o.estado, COR_REGIAO[REGIAO[o.estado]] || "tag-gray") + " " : ""}${esc(o.municipio || "—")}` },
        { key: "contatos", label: "Contatos", num: true, sort: (o) => (o.contatos || []).length,
          render: (o) => { const n = (o.contatos || []).length; return tag(String(n), n ? "tag-green" : "tag-red"); } },
        { key: "lics", label: "Licitações", num: true, sort: (o) => licsDe(o.id).length,
          render: (o) => licsDe(o.id).length ? `<button class="link-btn" data-act="lics" data-id="${esc(o.id)}">${licsDe(o.id).length}</button>` : '<span class="muted">0</span>' },
        { key: "acoes", label: "", sort: false, width: "120px", render: (o) => acoes(btnVer(o.id), ...(podeEditar()
          ? [btnEditar(o.id), btnExcluir(o.id, licsDe(o.id).length ? `${licsDe(o.id).length} licitação(ões) usam este órgão` : "")] : [])) },
      ],
    });

    onAction(el, {
      regiao: (r) => { regiao = r; el.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.id === r)); tabela.refresh(); },
      novo: () => abrirForm(),
      editar: (id) => abrirForm(store.find("orgaos", id)),
      ver: (id) => verOrgao(store.find("orgaos", id)),
      excluir: async (id) => {
        if (!await confirmar("Excluir este órgão?", { ok: "Excluir", perigo: true })) return;
        await store.remove("orgaos", id); toast("Órgão excluído.");
      },
      lics: (id, btn) => {
        const o = store.find("orgaos", id);
        const itens = licsDe(id).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
        popover(btn, {
          titulo: `${toTitleCase(o.nome)} — ${itens.length} licitação(ões)`,
          corpo: itens.map((l) => h`<div class="list-item"><div class="list-main"><div class="list-title">${l.numero}</div><div class="list-sub">${getPortal(l.portalId).sigla || "—"} · ${l.tipo || "—"}</div></div></div>`).join(""),
        });
      },
      excel: () => {
        const rows = [];
        store.get("orgaos").forEach((o) => {
          const base = { UASG: o.uasg || "", Nome: o.nome, CNPJ: o.cnpj || "", Município: o.municipio || "", Estado: o.estado || "" };
          const cs = o.contatos || [];
          if (!cs.length) rows.push({ ...base, Contato: "", Cargo: "", Email: "", Telefone: "" });
          else cs.forEach((c) => rows.push({ ...base, Contato: c.nome || "", Cargo: c.cargo || "", Email: c.email || "", Telefone: c.telefone || "" }));
        });
        exportarExcel(rows, "Órgãos", "orgaos");
      },
    });

    kpis();
    unsub = store.on("*", () => { kpis(); tabela.refresh(); });
  },

  destroy() { unsub?.(); regiao = ""; },
};

function contatoHtml(c = {}) {
  return `<div class="subcard contato">
    <button type="button" class="icon-btn sm danger remove" data-remove aria-label="Remover contato">${icon("x")}</button>
    ${linha(campo("Nome", inputTxt("c_nome", c.nome || "")), campo("Cargo", inputTxt("c_cargo", c.cargo || "")))}
    ${linha(campo("E-mail", `<input type="email" name="c_email" value="${esc(c.email || "")}">`), campo("Telefone", inputTxt("c_tel", c.telefone || "")))}
  </div>`;
}

function abrirForm(o = null) {
  formModal({
    titulo: o ? "Editar órgão" : "Novo órgão",
    largura: "lg",
    corpo:
      linha(campo("UASG", inputTxt("uasg", o?.uasg || "", 'placeholder="Opcional"')),
            campo("Nome", inputTxt("nome", o?.nome || "", "required")),
            campo("CNPJ", inputTxt("cnpj", o?.cnpj || "", 'placeholder="00.000.000/0000-00" data-cnpj')))
      + linha(campo("Município", inputTxt("municipio", o?.municipio || "")),
              campo("Estado", select("estado", [["", "Selecione…"], ...UFS], o?.estado || "")))
      + `<div class="form-section"><span>Contatos</span><button type="button" class="btn btn-ghost btn-sm" data-add-contato>${icon("plus")} Contato</button></div>
         <div id="contatos">${(o?.contatos?.length ? o.contatos : [{}]).map(contatoHtml).join("")}</div>`,
    onAberto(form) {
      form.querySelector("[data-cnpj]").addEventListener("input", (e) => mascaraCnpj(e.target));
      form.querySelector("[data-add-contato]").addEventListener("click", () => form.querySelector("#contatos").insertAdjacentHTML("beforeend", contatoHtml()));
      form.addEventListener("click", (e) => { const b = e.target.closest("[data-remove]"); if (b) b.closest(".contato").remove(); });
    },
    async onSalvar(form) {
      const v = lerForm(form);
      const nome = v.nome.trim();
      if (!nome) throw new Error("Informe o nome do órgão.");
      const cnpj = cnpjFormatado(v.cnpj); const dig = cnpjDigitos(cnpj);
      if (dig) { const dup = store.get("orgaos").find((x) => cnpjDigitos(x.cnpj) === dig && x.id !== o?.id); if (dup) throw new Error(`Já existe um órgão com este CNPJ: ${dup.nome}.`); }
      const contatos = [...form.querySelectorAll(".contato")].map((c) => ({
        nome: c.querySelector("[name=c_nome]").value.trim(), cargo: c.querySelector("[name=c_cargo]").value.trim(),
        email: c.querySelector("[name=c_email]").value.trim(), telefone: c.querySelector("[name=c_tel]").value.trim(),
      })).filter((c) => c.nome || c.email || c.telefone);
      await store.setItem("orgaos", { id: o?.id || newId(), uasg: v.uasg.trim(), nome, cnpj, municipio: v.municipio.trim(), estado: v.estado, contatos });
      closeModal(); toast(o ? "Órgão atualizado." : "Órgão criado.");
    },
  });
}

function verOrgao(o) {
  if (!o) return;
  openModal({
    titulo: toTitleCase(o.nome), largura: "md",
    corpo: `
      <div class="grid grid-2" style="margin-bottom:14px">
        <div><div class="muted" style="font-size:12px">UASG</div><strong>${esc(o.uasg || "—")}</strong></div>
        <div><div class="muted" style="font-size:12px">CNPJ</div><strong class="mono">${esc(o.cnpj || "—")}</strong></div>
        <div><div class="muted" style="font-size:12px">Local</div><strong>${esc(o.municipio || "—")}${o.estado ? " / " + esc(o.estado) : ""}</strong></div>
        <div><div class="muted" style="font-size:12px">Região</div><strong>${esc(REGIAO[o.estado] || "—")}</strong></div>
      </div>
      <div class="form-section">Contatos</div>
      ${(o.contatos || []).length ? (o.contatos || []).map((c) => h`<div class="list-item"><div class="list-main"><div class="list-title">${c.nome || "—"}${c.cargo ? raw(` <span class="muted">· ${esc(c.cargo)}</span>`) : ""}</div><div class="list-sub">${c.email || "—"} · ${c.telefone || "—"}</div></div></div>`).join("")
        : '<p class="muted" style="padding:10px 0">Nenhum contato cadastrado.</p>'}`,
    rodape: `<button class="btn btn-ghost" data-close>Fechar</button>`,
  });
}

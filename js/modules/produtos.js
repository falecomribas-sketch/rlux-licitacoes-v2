// Produtos. Campos: id, nome, codigo, marca, custo, catId, prodFichaData (imagem base64 comprimida)
// Etapa B (opcionais): familia, descricaoTecnica, tecnico{...}, custoData, custoOrigem, unidade
import { store, newId } from "../core/store.js";
import { dataTable, acoes, btnEditar, btnExcluir, onAction } from "../core/table.js";
import { formModal, lerForm, campo, inputTxt, inputNum, inputData, textarea, select, linha, exportarExcel, lerExcel } from "../core/forms.js";
import { iniciarPreco, piso, custoVencido, diasCusto, FAMILIAS_TEC, deduzirFamilia, frequenciaVendas, getCfg } from "../core/preco.js";
import { hojeIso } from "../core/utils.js";
import { toast, confirmar, closeModal, icon, tag, openModal } from "../core/ui.js";
import { esc, h, raw, fmt, fmtD, fmtNum } from "../core/utils.js";
import { podeEditar } from "../core/auth.js";
import { getCat, getLicit, getOrgao, ataDaProposta, STATUS_CLASS } from "../core/domain.js";
import { popover, fecharPopover } from "../core/popover.js";
import { novoDoc, cabecalho, rodape, tabelaPadrao, AZUL, VERDE, ROXO } from "../core/pdf.js";

let unsub = null;
let catFiltro = "", sitFiltro = "";

const propostasDoProduto = (id) => store.get("propostas").filter((p) => (p.itens || []).some((i) => i.produtoId === id));
const corCusto = (v) => v <= 20 ? "var(--green)" : v <= 80 ? "var(--amber-txt)" : "var(--red)";

export default {
  id: "produtos", titulo: "Produtos", grupo: "Cadastros", icone: "box",

  render(el) {
    el.innerHTML = `
      <div class="grid grid-4" id="kpis" style="margin-bottom:16px"></div>
      <div class="page-head"><h2>Produtos</h2>
        <div class="actions">
          <button class="btn btn-ghost" data-act="excel">${icon("download")} Excel</button>
          ${podeEditar() ? `<button class="btn btn-ghost" data-act="importar">${icon("upload")} Importar</button>
          <button class="btn btn-ghost" data-act="importar-tec" title="Planilha Base_Preco (SKU, custo, colunas técnicas)">${icon("upload")} Planilha técnica</button>
          <input type="file" id="imp-file" accept=".xlsx,.xls" hidden><input type="file" id="imp-tec" accept=".xlsx,.xls" hidden>
          <button class="btn btn-primary" data-act="novo">${icon("plus")} Novo produto</button>` : ""}
        </div></div>
      <div class="card">
        <div class="chip-filters" id="chips"></div>
        <div class="card-body flush" id="tbl"></div></div>`;

    const chips = () => {
      const cats = store.get("categorias").slice().sort((a, b) => a.nome.localeCompare(b.nome));
      el.querySelector("#chips").innerHTML = `<span class="muted">Categoria:</span>
        <button class="chip ${!catFiltro ? "active" : ""}" data-act="cat" data-id="">Todas</button>
        ${cats.map((c) => `<button class="chip ${catFiltro === c.id ? "active" : ""}" data-act="cat" data-id="${esc(c.id)}">${esc(c.nome)}</button>`).join("")}
        <button class="chip ${catFiltro === "__sem__" ? "active" : ""}" data-act="cat" data-id="__sem__">Sem categoria</button>
        <span style="flex-basis:100%;height:0"></span><span class="muted">Situação:</span>
        ${[["", "Todos"], ["vencido", "Custo vencido"], ["semdesc", "Sem descrição técnica"], ["semfam", "Sem família"], ["vendidos", "Mais vendidos (2 anos)"]].map(([v, t]) => `<button class="chip ${sitFiltro === v ? "active" : ""}" data-act="sit" data-id="${v}">${t}</button>`).join("")}`;
    };
    const kpis = () => {
      const todos = store.get("produtos");
      el.querySelector("#kpis").innerHTML = `
        <div class="kpi"><div class="kpi-label">Produtos</div><div class="kpi-value">${todos.length}</div></div>
        <div class="kpi"><div class="kpi-label">Marcas</div><div class="kpi-value">${new Set(todos.map((p) => p.marca).filter(Boolean)).size}</div></div>
        <div class="kpi"><div class="kpi-label">Sem categoria</div><div class="kpi-value">${todos.filter((p) => !p.catId).length}</div></div>
        <div class="kpi"><div class="kpi-label">Custo vencido (> ${getCfg().custoValidadeDias} dias ou sem data)</div><div class="kpi-value" style="color:var(--red)">${todos.filter(custoVencido).length}</div></div>
        <div class="kpi"><div class="kpi-label">Com descrição técnica</div><div class="kpi-value" style="color:var(--green)">${todos.filter((p) => p.descricaoTecnica).length}</div></div>`;
    };

    const tabela = dataTable({
      el: el.querySelector("#tbl"),
      rows: () => { const freq = sitFiltro === "vendidos" ? frequenciaVendas(2) : null;
        return store.get("produtos").filter((p) => !catFiltro || (catFiltro === "__sem__" ? !p.catId : p.catId === catFiltro))
          .filter((p) => sitFiltro === "vencido" ? custoVencido(p) : sitFiltro === "semdesc" ? !p.descricaoTecnica : sitFiltro === "semfam" ? !p.familia : sitFiltro === "vendidos" ? freq[p.id] : true)
          .map((p) => freq ? { ...p, _freq: freq[p.id] } : p); },
      search: (p, q) => [p.nome, p.codigo, p.marca, getCat(p.catId).nome].some((x) => (x || "").toLowerCase().includes(q)),
      placeholder: "Buscar por nome, código, marca ou categoria…",
      sort: { key: "nome", dir: "asc" },
      empty: "Nenhum produto neste filtro",
      columns: [
        { key: "codigo", label: "Código", width: "120px", render: (p) => tag(p.codigo || "—", "tag-blue") },
        { key: "nome", label: "Nome", render: (p) => `<button type="button" class="icon-btn sm star-btn ${p.preferido ? "on" : ""}" data-act="preferido" data-id="${esc(p.id)}" title="${p.preferido ? "Preferido — a IA escolhe este entre equivalentes" : "Marcar como preferido entre equivalentes"}">${icon("star")}</button> <strong>${esc(p.nome)}</strong>${p.prodFichaData ? ` <span class="muted" title="Tem ficha técnica">${icon("image", "ic-inline")}</span>` : ""}` },
        { key: "marca", label: "Marca", render: (p) => esc(p.marca || "—") },
        { key: "cat", label: "Categoria", sort: (p) => getCat(p.catId).nome || "", render: (p) => { const c = getCat(p.catId); return c.nome ? `<span class="color-dot" style="background:${esc(c.cor || "#3b82f6")}"></span>${esc(c.nome)}` : '<span class="muted">—</span>'; } },
        { key: "custo", label: "Custo", num: true, sort: (p) => p.custo || 0, render: (p) => { const d = diasCusto(p); return `<strong>${fmt(p.custo)}</strong><div style="font-size:11px;${custoVencido(p) ? "color:var(--red)" : "color:var(--muted)"}">${d === null ? "sem data" : d === 0 ? "hoje" : `há ${d} dias`}</div>`; } },
        { key: "piso", label: "Piso", num: true, sort: (p) => piso(p.custo), render: (p) => `<span style="color:var(--navy-2)">${fmt(piso(p.custo))}</span>` },
        { key: "atualizado", label: "Atualizado", width: "96px", sort: (p) => p._atualizadoEm || "", render: (p) => p._atualizadoEm ? `<div style="font-size:12px">${fmtD(p._atualizadoEm.slice(0, 10)).replace(/\/(\d{2})(\d{2})$/, "/$2")}</div><div class="muted" style="font-size:10.5px" title="${esc(p._atualizadoPor || "")}">${esc((p._atualizadoPor || "").split("@")[0] || "")}</div>` : `<span class="muted">—</span>` },
        { key: "fam", label: "Família / técnica", sort: (p) => p.familia || "", render: (p) => p.familia ? `${tag(FAMILIAS_TEC[p.familia]?.nome.split(" (")[0] || p.familia, "tag-teal")}${p.descricaoTecnica ? "" : `<div class="muted" style="font-size:11px">sem descrição técnica</div>`}` : `<span class="muted">—</span>` },
        { key: "props", label: "Propostas", num: true, sort: (p) => p._freq ?? propostasDoProduto(p.id).length,
          render: (p) => { const n = propostasDoProduto(p.id).length; return n ? `<button class="link-btn" data-act="props" data-id="${esc(p.id)}">${n}</button>` : '<span class="muted">0</span>'; } },
        { key: "acoes", label: "", sort: false, width: "90px", render: (p) => podeEditar()
          ? acoes(btnEditar(p.id), btnExcluir(p.id, propostasDoProduto(p.id).length ? `Usado em ${propostasDoProduto(p.id).length} proposta(s)` : "")) : "" },
      ],
    });

    onAction(el, {
      cat: (id) => { catFiltro = id; chips(); tabela.refresh(); },
      sit: (id) => { sitFiltro = id; chips(); tabela.refresh(); },
      "importar-tec": () => el.querySelector("#imp-tec").click(),
      preferido: async (id) => { if (!podeEditar()) return; const p = store.find("produtos", id); if (!p) return; await store.setItem("produtos", { ...p, preferido: !p.preferido }); toast(p.preferido ? "Preferência removida." : `${p.codigo} marcado como preferido.`); },
      novo: () => abrirForm(),
      editar: (id) => abrirForm(store.find("produtos", id)),
      excluir: async (id) => {
        if (!await confirmar("Excluir este produto?", { ok: "Excluir", perigo: true })) return;
        await store.remove("produtos", id); toast("Produto excluído.");
      },
      props: (id, btn) => abrirPopoverPropostas(store.find("produtos", id), btn),
      excel: () => exportarExcel(store.get("produtos").map((p) => ({ Código: p.codigo, Nome: p.nome, Marca: p.marca || "", Unidade: p.unidade || "", Custo: p.custo, "Custo em": p.custoData ? fmtD(p.custoData) : "", Piso: +piso(p.custo).toFixed(2), Categoria: getCat(p.catId).nome || "", CategoriaId: p.catId || "", Família: p.familia || "", Preferido: p.preferido ? "sim" : "", "Descrição técnica": p.descricaoTecnica || "", ...Object.fromEntries(Object.entries(p.tecnico || {}).map(([k, v]) => ["tec:" + k, v])) })), "Produtos", "produtos"),
      importar: () => el.querySelector("#imp-file").click(),
    });
    el.querySelector("#imp-file")?.addEventListener("change", (e) => { if (e.target.files[0]) importarExcel(e.target.files[0]); e.target.value = ""; });
    el.querySelector("#imp-tec")?.addEventListener("change", (e) => { if (e.target.files[0]) importarTecnica(e.target.files[0]); e.target.value = ""; });
    iniciarPreco();

    chips(); kpis();
    unsub = store.on("*", () => { chips(); kpis(); tabela.refresh(); });
  },

  destroy() { unsub?.(); catFiltro = ""; sitFiltro = ""; fecharPopover(); },
};

// ---------- formulário ----------
function abrirForm(p = null) {
  const cats = store.get("categorias").slice().sort((a, b) => a.nome.localeCompare(b.nome));
  let ficha = p?.prodFichaData || "";
  const famIni = p?.familia || deduzirFamilia(`${getCat(p?.catId).nome || ""} ${p?.nome || ""}`);
  const camposTec = (fam, tec = {}) => (FAMILIAS_TEC[fam]?.campos || []).map(([k, label, tipo]) => campo(label, tipo === "num" ? inputNum("tec_" + k, tec[k] ?? "", 'step="any"') : inputTxt("tec_" + k, tec[k] ?? ""))).join("");
  formModal({
    titulo: p ? "Editar produto" : "Novo produto", largura: "lg",
    corpo:
      linha(campo("Nome", inputTxt("nome", p?.nome || "", "required")), campo("Código / SKU", inputTxt("codigo", p?.codigo || "", "required")), campo("Marca", inputTxt("marca", p?.marca || "", "required")))
      + linha(campo("Categoria", select("catId", [["", "Selecione…"], ...cats.map((c) => [c.id, c.nome])], p?.catId || "")), campo("Família técnica", select("familia", Object.entries(FAMILIAS_TEC).map(([k, v]) => [k, v.nome]), famIni)), campo("Unidade", inputTxt("unidade", p?.unidade || "", 'placeholder="UN, PCT, RL…"')), `<label class="field"><span>Preferido</span><label style="display:flex;align-items:center;gap:8px;padding:9px 0;font-weight:500"><input type="checkbox" name="preferido" ${p?.preferido ? "checked" : ""}> entre equivalentes, a IA escolhe este</label></label>`)
      + linha(campo("Custo (R$)", inputNum("custo", p?.custo ?? "", 'step="0.01" min="0" required')), campo("Custo atualizado em", inputData("custoData", p?.custoData || (p ? "" : hojeIso()))), campo("Origem do custo", inputTxt("custoOrigem", p?.custoOrigem || "", 'placeholder="fornecedor / tabela"')), `<div class="field"><span>Piso de venda</span><div id="piso-vis" style="padding:9px 0;font-weight:600;color:var(--navy-2)">—</div></div>`)
      + `<div class="form-section">Descrição técnica <span class="muted" style="font-weight:400">— é o que a IA lê para casar com o edital</span></div>`
      + campo("Descrição técnica", textarea("descricaoTecnica", p?.descricaoTecnica || "", 'rows="2" placeholder="Ex.: Lâmpada LED Tubular T8 18 W 120 cm 6500 K base G13 bivolt, Inmetro, garantia 12 meses"'))
      + `<div class="form-section">Campos-chave da família <span class="muted" style="font-weight:400">— o sistema usa para filtrar e excluir antes da IA</span></div><div class="form-row cols-3" id="tec">${camposTec(famIni, p?.tecnico)}</div>`
      + `<div class="field"><span>Ficha técnica (imagem JPG ou PNG)</span>
          <div class="dropzone" id="dz" tabindex="0" role="button">
            <div id="dz-txt">${ficha ? "Ficha técnica anexada — clique para substituir" : "Clique para anexar"}</div>
            <img id="dz-img" ${ficha ? `src="${ficha}"` : "hidden"} alt="">
          </div>
          <input type="file" id="dz-file" accept=".jpg,.jpeg,.png" hidden>
          ${ficha ? `<button type="button" class="btn btn-ghost btn-sm" id="dz-rm" style="align-self:flex-start">${icon("x")} Remover ficha</button>` : ""}
        </div>`,
    onAberto(form) {
      const dz = form.querySelector("#dz"), file = form.querySelector("#dz-file"), img = form.querySelector("#dz-img"), txt = form.querySelector("#dz-txt");
      const pisoVis = () => { form.querySelector("#piso-vis").textContent = fmt(piso(parseFloat(form.elements.custo.value) || 0)); };
      form.elements.custo.addEventListener("input", pisoVis); pisoVis();
      form.elements.familia.addEventListener("change", () => { const tec = {}; form.querySelectorAll("#tec [name^=tec_]").forEach((i) => { if (i.value !== "") tec[i.name.slice(4)] = i.value; }); form.querySelector("#tec").innerHTML = camposTec(form.elements.familia.value, tec); });
      form.elements.catId.addEventListener("change", () => { if (!p?.familia) form.elements.familia.value = deduzirFamilia(`${getCat(form.elements.catId.value).nome || ""} ${form.elements.nome.value}`), form.elements.familia.dispatchEvent(new Event("change")); });
      dz.addEventListener("click", () => file.click());
      dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } });
      file.addEventListener("change", async () => {
        const f = file.files[0]; if (!f) return;
        if (!/image\/(jpeg|png)/.test(f.type)) { toast("Use uma imagem JPG ou PNG.", "erro"); return; }
        txt.textContent = "Comprimindo…";
        try {
          ficha = await comprimirImagem(f);
          img.src = ficha; img.hidden = false;
          txt.textContent = `${f.name} (${Math.round(ficha.length / 1024)} KB)`;
        } catch (e) { toast("Não foi possível ler a imagem.", "erro"); txt.textContent = "Clique para anexar"; }
      });
      form.querySelector("#dz-rm")?.addEventListener("click", () => { ficha = ""; img.hidden = true; img.removeAttribute("src"); txt.textContent = "Clique para anexar"; });
    },
    async onSalvar(form) {
      const v = lerForm(form);
      const nome = v.nome.trim(), codigo = v.codigo.trim(), marca = v.marca.trim();
      if (!nome || !codigo || !marca) throw new Error("Preencha nome, código e marca.");
      if (store.get("produtos").some((x) => x.codigo === codigo && x.id !== p?.id)) throw new Error("Já existe um produto com este código.");
      const custo = parseFloat(v.custo) || 0; const tecnico = {};
      Object.entries(v).forEach(([k, val]) => { if (k.startsWith("tec_") && String(val).trim() !== "") tecnico[k.slice(4)] = isNaN(+val) || String(val).trim() === "" ? String(val).trim() : +val; });
      const custoMudou = p && p.custo !== custo;
      await store.setItem("produtos", { ...(p || {}), id: p?.id || newId(), nome, codigo, marca, custo, catId: v.catId, prodFichaData: ficha,
        familia: v.familia, unidade: v.unidade.trim(), descricaoTecnica: v.descricaoTecnica.trim(), tecnico, preferido: !!form.querySelector("[name=preferido]")?.checked,
        custoData: v.custoData || (custoMudou ? hojeIso() : p?.custoData || ""), custoOrigem: v.custoOrigem.trim(), ...(custoMudou ? { custoAnterior: p.custo } : {}) });
      closeModal(); toast(p ? "Produto atualizado." : "Produto criado.");
    },
  });
}

// Redimensiona (máx. 1800px) e comprime em JPEG até caber em ~700 KB —
// mesmo limite da versão atual, porque a imagem fica dentro do documento do Firestore (limite de 1 MB).
function comprimirImagem(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const MAX = 1800; let w = img.width, h = img.height;
        if (w > MAX || h > MAX) { const r = Math.min(MAX / w, MAX / h); w = Math.round(w * r); h = Math.round(h * r); }
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
        let q = 0.85, out = c.toDataURL("image/jpeg", q);
        while (out.length > 700 * 1024 && q > 0.3) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
        resolve(out);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---------- importação Excel (mesma regra do legado: atualiza por Código, cria se não existir) ----------
async function importarExcel(file) {
  let rows;
  try { rows = await lerExcel(file); } catch (e) { toast("Não foi possível ler a planilha.", "erro"); return; }
  const atuais = store.get("produtos"); const cats = store.get("categorias");
  const famPorNome = Object.fromEntries(Object.entries(FAMILIAS_TEC).map(([k, v]) => [v.nome.toLowerCase(), k]));
  const acharFam = (t) => { const x = String(t || "").trim().toLowerCase(); if (!x) return undefined; if (FAMILIAS_TEC[x]) return x; const k = Object.keys(famPorNome).find((n) => n.startsWith(x) || n.split(" (")[0] === x); return k ? famPorNome[k] : undefined; };
  const acharCat = (nome, id) => { if (id && cats.some((c) => c.id === id)) return id; const n = String(nome || "").trim().toLowerCase(); const c = n ? cats.find((c) => (c.nome || "").toLowerCase() === n) : null; return c ? c.id : undefined; };
  const num = (v) => { const n = parseFloat(String(v).replace(/\./g, (m, i, str) => (str.includes(",") ? "" : m)).replace(",", ".")); return isNaN(n) ? undefined : n; };
  const linhas = []; const hoje = hojeIso();
  for (const r of rows) {
    const codigo = String(r["Código"] ?? r["Codigo"] ?? r["SKU"] ?? "").trim(); if (!codigo) continue;
    const val = (k) => r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== "" ? String(r[k]).trim() : undefined;
    const ex = atuais.find((p) => p.codigo === codigo) || atuais.find((p) => normCod(p.codigo) === normCod(codigo));
    const upd = ex ? { ...ex } : { id: newId(), codigo, nome: "", marca: "", custo: 0, catId: "" }; const mud = [];
    const set = (campo, v, rotulo) => { if (v === undefined) return; const antes = upd[campo]; if (JSON.stringify(antes ?? "") !== JSON.stringify(v ?? "")) { upd[campo] = v; mud.push(rotulo || campo); } };
    set("nome", val("Nome"), "nome"); set("marca", val("Marca"), "marca"); set("unidade", val("Unidade"), "unidade");
    const custo = val("Custo") !== undefined ? num(val("Custo")) : undefined;
    if (custo !== undefined && custo !== (ex?.custo ?? null)) { upd.custo = custo; mud.push("custo"); const d = isoDeData(r["Custo em"]); upd.custoData = d || hoje; upd.custoOrigem = "planilha"; }
    else if (val("Custo em")) { const d = isoDeData(r["Custo em"]); if (d && d !== ex?.custoData) { upd.custoData = d; mud.push("data do custo"); } }
    set("catId", acharCat(val("Categoria"), val("CategoriaId")), "categoria");
    set("familia", acharFam(val("Família") ?? val("Familia")), "família");
    set("descricaoTecnica", val("Descrição técnica") ?? val("Descricao tecnica"), "descrição técnica");
    if (r["Preferido"] !== undefined && r["Preferido"] !== null) { const pref = /^(sim|s|x|1|true|yes)$/i.test(String(r["Preferido"]).trim()); if (pref !== !!ex?.preferido) { upd.preferido = pref; mud.push("preferido"); } }
    const tec = { ...(ex?.tecnico || {}) }; let tecMudou = false;
    Object.keys(r).filter((k) => /^tec:/i.test(k)).forEach((k) => { const ch = k.slice(4).trim(); const v = val(k); if (v === undefined) return; if (String(tec[ch] ?? "") !== v) { tec[ch] = v; tecMudou = true; } });
    if (tecMudou) { upd.tecnico = tec; mud.push("dados técnicos"); }
    if (!ex && !upd.nome) continue; // novo sem nome: ignora
    linhas.push({ codigo, ex, upd, mud });
  }
  if (!linhas.length) { toast("A planilha não tem a coluna Código ou está vazia.", "erro"); return; }
  const alterados = linhas.filter((l) => l.ex && l.mud.length), novos = linhas.filter((l) => !l.ex), iguais = linhas.length - alterados.length - novos.length;
  if (!alterados.length && !novos.length) { toast(`Nada a importar: ${iguais} produto(s) já estão iguais à planilha.`, "info", 6000); return; }
  const porCampo = {}; alterados.forEach((l) => l.mud.forEach((m) => { porCampo[m] = (porCampo[m] || 0) + 1; }));
  const custoVariou = alterados.filter((l) => l.mud.includes("custo")).map((l) => ({ l, pct: l.ex.custo ? (l.upd.custo - l.ex.custo) / l.ex.custo * 100 : null }));
  const grandes = custoVariou.filter((x) => x.pct !== null && Math.abs(x.pct) > 30);
  openModal({ titulo: "Conferir importação de produtos", largura: "lg",
    corpo: `<p style="margin:0 0 10px"><strong>${alterados.length}</strong> produto(s) com alteração · <strong>${novos.length}</strong> novo(s) · ${iguais} sem mudança (ignorados).</p>
      ${Object.keys(porCampo).length ? `<p class="muted" style="font-size:12.5px;margin:0 0 10px">Campos alterados: ${Object.entries(porCampo).map(([k, v]) => `${esc(k)} (${v})`).join(" · ")}</p>` : ""}
      ${grandes.length ? `<div class="info-box" style="border-color:var(--amber);margin-bottom:10px"><div><div class="k">Custos com variação acima de 30% — confira</div>${grandes.slice(0, 12).map(({ l, pct }) => `${esc(l.codigo)}: ${fmt(l.ex.custo)} → ${fmt(l.upd.custo)} (${pct > 0 ? "+" : ""}${pct.toFixed(0)}%)`).join("<br>")}${grandes.length > 12 ? `<br>… e mais ${grandes.length - 12}` : ""}</div></div>` : ""}
      <div class="table-wrap" style="max-height:340px;overflow:auto"><table><thead><tr><th>Código</th><th>Nome</th><th>O que muda</th></tr></thead><tbody>
        ${[...alterados, ...novos].slice(0, 300).map((l) => `<tr><td class="mono">${esc(l.codigo)}</td><td>${esc(l.upd.nome)}</td><td style="font-size:12.5px">${l.ex ? l.mud.map((m) => m === "custo" ? `custo ${fmt(l.ex.custo)} → ${fmt(l.upd.custo)}` : esc(m)).join(", ") : "<strong>novo produto</strong>"}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="muted" style="font-size:12px;margin:10px 0 0">Células vazias na planilha não apagam dados existentes. Custo alterado sem "Custo em" recebe a data de hoje.</p>`,
    rodape: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="imp-ok">Importar ${alterados.length + novos.length} produto(s)</button>` });
  document.querySelector("#imp-ok").addEventListener("click", async (e) => { e.target.disabled = true; e.target.textContent = "Importando…"; try { for (const l of [...alterados, ...novos]) await store.setItem("produtos", l.upd); closeModal(); toast(`Importação concluída: ${alterados.length} atualizado(s), ${novos.length} adicionado(s).`); } catch (err) { toast("Falha ao gravar: " + (err.message || err), "erro", 8000); e.target.disabled = false; e.target.textContent = "Tentar de novo"; } });
}

// ---------- importação da planilha técnica (Base_Preco_RLUX: SKU, PRECO = custo, colunas técnicas) ----------
const MAPA_TEC = { POTENCIA_W: "potenciaW", COR_K: "corK", BASE: "base", IP: "ip", TENSAO_V: "tensaoV", POLOS: "polos", AMPERAGEM: "correnteA", CORRENTE_A: "correnteA", CURVA: "curva", kA: "kA", CERTIFICACAO: "certificacao", TAMANHO_M: "dimensao", TENSAO_BOBINA_V: "bobinaV", CLASSE_UTILIZACAO: "classe", CONTATO_AUXILIAR: "auxiliar", PINOS: "pinos", MONTAGEM: "montagem", POSICAO_H: "posicaoH", Ah: "ah", GARANTIA: "garantia", TIPO_BARRAMENTO: "tipo", NORMA: "norma" };
const normCod = (x) => String(x ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const humanizar = (c) => String(c || "").replace(/_/g, " ").toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase()).replace(/\bLed\b/g, "LED").replace(/\bT8\b|\bT5\b/gi, (m) => m.toUpperCase()).replace(/\bDps\b/, "DPS").replace(/\bIdr\b/, "IDR").replace(/\bMr16\b/, "MR16");
// Aceita Date, "aaaa-mm-dd", "dd/mm/aaaa" e número de série do Excel (ex.: 46296)
const isoDeData = (v) => {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) return isNaN(v) ? "" : new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return d.toISOString().slice(0, 10); }
  const s = String(v).trim(); if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) { const a = m[3].length === 2 ? "20" + m[3] : m[3]; return `${a}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  if (/^\d{5}$/.test(s)) return isoDeData(+s);
  return "";
};

async function importarTecnica(file) {
  let rows;
  try { rows = await lerExcel(file); } catch (e) { toast("Não foi possível ler a planilha.", "erro"); return; }
  if (!rows.length || !("SKU" in rows[0]) || !("PRECO" in rows[0])) { toast("Esta não é a planilha técnica (precisa das colunas SKU e PRECO).", "erro"); return; }
  const atuais = store.get("produtos"), cats = store.get("categorias"); const porCod = new Map(atuais.map((p) => [normCod(p.codigo), p]));
  const normNome = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  const catPorNome = new Map(cats.map((c) => [normNome(c.nome), c]));
  const linhas = rows.filter((r) => r.SKU).map((r) => {
    const ex = porCod.get(normCod(r.SKU)); const custoPl = parseFloat(String(r.PRECO).replace(",", ".")) || 0;
    const tecnico = {}; Object.entries(MAPA_TEC).forEach(([col, k]) => { if (r[col] !== undefined && r[col] !== null && String(r[col]).trim() !== "") tecnico[k] = isNaN(+r[col]) ? String(r[col]).trim() : +r[col]; });
    const catNome = humanizar(r.CATEGORIA); const catEx = catPorNome.get(normNome(catNome)) || catPorNome.get(normNome(r.CATEGORIA));
    const diff = ex && ex.custo ? (custoPl - ex.custo) / ex.custo * 100 : null;
    return { r, ex, custoPl, tecnico, catNome, catEx, diff, usarCusto: !ex || diff === null || Math.abs(diff) <= 10, criar: !ex, dataPl: isoDeData(r.ATUALIZADO) };
  });
  const casados = linhas.filter((l) => l.ex), novos = linhas.filter((l) => !l.ex), divergentes = casados.filter((l) => l.diff !== null && Math.abs(l.diff) > 10);
  const m = openModal({ titulo: "Importar planilha técnica — conferência", largura: "xl", corpo: `
    <div class="info-box" style="margin-bottom:12px"><div><div class="k">Linhas na planilha</div>${linhas.length}</div><div><div class="k">Casam por código = SKU</div>${casados.length}</div><div><div class="k">Novos (só na planilha)</div>${novos.length}</div><div><div class="k">Custo divergente > 10%</div><strong style="color:var(--amber-txt)">${divergentes.length}</strong></div></div>
    <p class="muted" style="font-size:12.5px;margin:0 0 10px">Para todos os casados entram: colunas técnicas, descrição técnica (se vazia), categoria (se vazia), família e unidade. O <strong>custo</strong> só é substituído onde a caixa estiver marcada — divergências acima de 10% vêm desmarcadas para você decidir. Produtos novos são criados se marcados. Custo importado sem data na planilha recebe a data de hoje (você está confirmando que ele vale agora).</p>
    <div class="chip-filters" style="padding:0 0 8px"><button class="chip active" data-f="div">Divergentes (${divergentes.length})</button><button class="chip" data-f="todos">Todos casados (${casados.length})</button><button class="chip" data-f="novos">Novos (${novos.length})</button></div>
    <div class="table-wrap" style="max-height:52vh;overflow:auto" id="imp-tab"></div>`,
    rodape: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="imp-ok">Aplicar importação</button>` });
  const tab = m.querySelector("#imp-tab"); let filtro = divergentes.length ? "div" : casados.length ? "todos" : "novos";
  m.querySelectorAll("[data-f]").forEach((x) => x.classList.toggle("active", x.dataset.f === filtro));
  const render = () => { const lst = filtro === "novos" ? novos : filtro === "div" ? divergentes : casados;
    tab.innerHTML = `<table><thead><tr><th>${filtro === "novos" ? "Criar" : "Usar custo da planilha"}</th><th>Código</th><th>Produto</th><th class="num">Custo sistema</th><th class="num">Custo planilha</th><th class="num">Dif.</th><th>Data planilha</th><th>Categoria</th></tr></thead><tbody>
      ${lst.map((l) => { const idx = linhas.indexOf(l); return `<tr><td><input type="checkbox" data-i="${idx}" ${(filtro === "novos" ? l.criar : l.usarCusto) ? "checked" : ""}></td><td>${esc(l.r.SKU)}</td><td>${esc(l.ex?.nome || l.r.NOSSA_DESCRICAO)}</td><td class="num">${l.ex ? fmt(l.ex.custo) : "—"}</td><td class="num"><strong>${fmt(l.custoPl)}</strong></td><td class="num" style="color:${l.diff === null ? "inherit" : Math.abs(l.diff) > 10 ? "var(--red)" : "var(--muted)"}">${l.diff === null ? "—" : (l.diff > 0 ? "+" : "") + l.diff.toFixed(1) + "%"}</td><td>${l.dataPl ? fmtD(l.dataPl) : "<span class=\"muted\">—</span>"}</td><td>${esc(l.catEx?.nome || l.catNome)}${l.catEx ? "" : " <span class=\"muted\">(nova)</span>"}</td></tr>`; }).join("") || `<tr><td colspan="8" class="muted" style="text-align:center;padding:20px">Nada aqui</td></tr>`}</tbody></table>`; };
  m.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => { filtro = b.dataset.f; m.querySelectorAll("[data-f]").forEach((x) => x.classList.toggle("active", x === b)); render(); }));
  tab.addEventListener("change", (e) => { const cb = e.target.closest("input[data-i]"); if (!cb) return; const l = linhas[+cb.dataset.i]; if (l.ex) l.usarCusto = cb.checked; else l.criar = cb.checked; });
  render();
  m.querySelector("#imp-ok").addEventListener("click", async () => {
    const btn = m.querySelector("#imp-ok"); btn.disabled = true; btn.textContent = "Importando…";
    const novasCats = new Map(); let atualizados = 0, criados = 0, custos = 0;
    const catId = async (l) => { if (l.catEx) return l.catEx.id; const k = normNome(l.catNome); if (!novasCats.has(k)) { const c = { id: newId(), nome: l.catNome, cor: "#5b6b8c" }; await store.setItem("categorias", c); novasCats.set(k, c); } return novasCats.get(k).id; };
    for (const l of linhas) {
      const famTxt = `${l.catNome} ${l.r.NOSSA_DESCRICAO || ""}`; const cid = await catId(l);
      if (l.ex) { const upd = { ...l.ex, tecnico: { ...(l.ex.tecnico || {}), ...l.tecnico }, familia: l.ex.familia || deduzirFamilia(famTxt), descricaoTecnica: l.ex.descricaoTecnica || String(l.r.NOSSA_DESCRICAO || "").trim(), unidade: l.ex.unidade || String(l.r.UNIDADE || "").trim(), catId: l.ex.catId || cid };
        if (l.usarCusto && l.custoPl > 0 && l.custoPl !== l.ex.custo) { upd.custoAnterior = l.ex.custo; upd.custo = l.custoPl; upd.custoData = l.dataPl || hojeIso(); upd.custoOrigem = "planilha técnica"; custos++; }
        else if (l.usarCusto && !l.ex.custoData) { upd.custoData = l.dataPl || hojeIso(); }
        await store.setItem("produtos", upd); atualizados++; }
      else if (l.criar) { await store.setItem("produtos", { id: newId(), nome: String(l.r.NOSSA_DESCRICAO || l.r.SKU).trim(), codigo: String(l.r.SKU).trim(), marca: String(l.r.MARCA || "").trim(), custo: l.custoPl, custoData: l.dataPl || hojeIso(), custoOrigem: "planilha técnica", catId: cid, familia: deduzirFamilia(famTxt), descricaoTecnica: String(l.r.NOSSA_DESCRICAO || "").trim(), unidade: String(l.r.UNIDADE || "").trim(), tecnico: l.tecnico, prodFichaData: "" }); criados++; }
    }
    closeModal(); toast(`Importação concluída: ${atualizados} atualizado(s) (${custos} custo(s) substituído(s)), ${criados} criado(s), ${novasCats.size} categoria(s) nova(s).`, "ok", 8000);
  });
}

// ---------- popover: propostas em que o produto aparece ----------
function abrirPopoverPropostas(prod, btn) {
  const props = propostasDoProduto(prod.id);
  const linhas = props.map((p) => {
    const l = getLicit(p.licitacaoId), o = getOrgao(l.orgaoId), ata = ataDaProposta(p.id);
    const it = (p.itens || []).find((i) => i.produtoId === prod.id) || {};
    const st = p.status || "Em Andamento";
    return h`<div class="list-item"><div class="list-main">
        <div class="list-title">${l.numero || "—"} <span class="muted" style="font-weight:400">· ${o.nome || "Órgão não informado"}</span></div>
        <div class="list-sub">${it.qtd ? `Qtd ${fmtNum(it.qtd)} · ` : ""}${it.preco ? `Un. ${fmt(it.preco)}` : ""}${ata ? ` · ATA ${ata.numero}${ata.vencimento ? " venc. " + fmtD(ata.vencimento) : ""}` : ""}</div>
      </div>${raw(tag(st, STATUS_CLASS[st] || "tag-gray"))}</div>`;
  }).join("");
  const pop = popover(btn, {
    titulo: `${prod.codigo} — ${props.length} proposta(s)`,
    corpo: linhas,
    acoes: `<button class="icon-btn sm" data-pdf title="Imprimir PDF">${icon("print")}</button>`,
  });
  pop.querySelector("[data-pdf]").addEventListener("click", () => imprimirPregoes(prod, props));
}

async function imprimirPregoes(prod, props) {
  const doc = await novoDoc("landscape");
  let y = cabecalho(doc, "PREGÕES VINCULADOS");
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(148, 163, 184);
  doc.text("PRODUTO", doc._ML, y); doc.text("CÓDIGO", doc._ML + 130, y); doc.text("MARCA", doc._ML + 175, y); doc.text("TOTAL DE PREGÕES", doc._ML + 220, y);
  y += 5; doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(30, 41, 59);
  doc.text((prod.nome || "—").slice(0, 55), doc._ML, y); doc.text(prod.codigo || "—", doc._ML + 130, y); doc.text(prod.marca || "—", doc._ML + 175, y); doc.text(String(props.length), doc._ML + 220, y);
  y += 7;
  let totQtd = 0, totVal = 0;
  const body = props.map((p) => {
    const l = getLicit(p.licitacaoId), o = getOrgao(l.orgaoId), ata = ataDaProposta(p.id);
    const it = (p.itens || []).find((i) => i.produtoId === prod.id) || {};
    const q = it.qtd || 0, v = it.preco || 0; totQtd += q; totVal += q * v;
    return [l.numero || "—", o.uasg || "—", (o.nome || "—").slice(0, 30), q ? fmtNum(q) : "—", v ? fmt(v) : "—", q && v ? fmt(q * v) : "—",
      ata?.numero || "—", ata?.vencimento ? fmtD(ata.vencimento) : "—", ata ? (ata.permiteAdesao === "sim" ? "Sim" : ata.permiteAdesao === "nao" ? "Não" : "—") : "—", p.status || "Em Andamento"];
  });
  doc.autoTable({ ...tabelaPadrao(), startY: y, margin: { left: doc._ML, right: doc._MR },
    head: [["Pregão / Nº", "UASG", "Órgão", "Qtd", "Vl. Unit.", "Total", "Nº ATA", "Venc. ATA", "Adesão", "Status"]], body,
    foot: [["", "", "TOTAL GERAL", totQtd ? fmtNum(totQtd) : "—", "—", totVal ? fmt(totVal) : "—", "", "", "", ""]],
    columnStyles: { 0: { cellWidth: 26, fontStyle: "bold", textColor: AZUL }, 1: { cellWidth: 16, halign: "center" }, 2: { cellWidth: 54 }, 3: { cellWidth: 14, halign: "right" }, 4: { cellWidth: 22, halign: "right" }, 5: { cellWidth: 26, halign: "right", textColor: VERDE }, 6: { cellWidth: 26, textColor: ROXO }, 7: { cellWidth: 20, halign: "center" }, 8: { cellWidth: 20, halign: "center" }, 9: { cellWidth: 25, halign: "center" } } });
  rodape(doc, "Pregões vinculados ao produto " + (prod.codigo || ""));
  doc.save(`pregoes_${prod.codigo || prod.id.slice(-6)}.pdf`);
  toast("PDF gerado.");
}

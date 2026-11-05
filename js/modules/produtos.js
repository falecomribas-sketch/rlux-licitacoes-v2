// Produtos. Campos: id, nome, codigo, marca, custo, catId, prodFichaData (imagem base64 comprimida)
import { store, newId } from "../core/store.js";
import { dataTable, acoes, btnEditar, btnExcluir, onAction } from "../core/table.js";
import { formModal, lerForm, campo, inputTxt, inputNum, select, linha, exportarExcel, lerExcel } from "../core/forms.js";
import { toast, confirmar, closeModal, icon, tag, openModal } from "../core/ui.js";
import { esc, h, raw, fmt, fmtD, fmtNum } from "../core/utils.js";
import { podeEditar } from "../core/auth.js";
import { getCat, getLicit, getOrgao, ataDaProposta, STATUS_CLASS } from "../core/domain.js";
import { popover, fecharPopover } from "../core/popover.js";
import { novoDoc, cabecalho, rodape, tabelaPadrao, AZUL, VERDE, ROXO } from "../core/pdf.js";

let unsub = null;
let catFiltro = "";

const propostasDoProduto = (id) => store.get("propostas").filter((p) => (p.itens || []).some((i) => i.produtoId === id));
const corCusto = (v) => v <= 20 ? "var(--green)" : v <= 80 ? "var(--amber-txt)" : "var(--red)";

export default {
  id: "produtos", titulo: "Produtos", grupo: "Cadastros", icone: "box",

  render(el) {
    el.innerHTML = `
      <div class="grid grid-3" id="kpis" style="margin-bottom:16px"></div>
      <div class="page-head"><h2>Produtos</h2>
        <div class="actions">
          <button class="btn btn-ghost" data-act="excel">${icon("download")} Excel</button>
          ${podeEditar() ? `<button class="btn btn-ghost" data-act="importar">${icon("upload")} Importar</button>
          <input type="file" id="imp-file" accept=".xlsx,.xls" hidden>
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
        <button class="chip ${catFiltro === "__sem__" ? "active" : ""}" data-act="cat" data-id="__sem__">Sem categoria</button>`;
    };
    const kpis = () => {
      const todos = store.get("produtos");
      el.querySelector("#kpis").innerHTML = `
        <div class="kpi"><div class="kpi-label">Produtos</div><div class="kpi-value">${todos.length}</div></div>
        <div class="kpi"><div class="kpi-label">Marcas</div><div class="kpi-value">${new Set(todos.map((p) => p.marca).filter(Boolean)).size}</div></div>
        <div class="kpi"><div class="kpi-label">Sem categoria</div><div class="kpi-value">${todos.filter((p) => !p.catId).length}</div></div>`;
    };

    const tabela = dataTable({
      el: el.querySelector("#tbl"),
      rows: () => store.get("produtos").filter((p) => !catFiltro || (catFiltro === "__sem__" ? !p.catId : p.catId === catFiltro)),
      search: (p, q) => [p.nome, p.codigo, p.marca, getCat(p.catId).nome].some((x) => (x || "").toLowerCase().includes(q)),
      placeholder: "Buscar por nome, código, marca ou categoria…",
      sort: { key: "nome", dir: "asc" },
      empty: "Nenhum produto cadastrado",
      columns: [
        { key: "codigo", label: "Código", width: "120px", render: (p) => tag(p.codigo || "—", "tag-blue") },
        { key: "nome", label: "Nome", render: (p) => `<strong>${esc(p.nome)}</strong>${p.prodFichaData ? ` <span class="muted" title="Tem ficha técnica">${icon("image", "ic-inline")}</span>` : ""}` },
        { key: "marca", label: "Marca", render: (p) => esc(p.marca || "—") },
        { key: "cat", label: "Categoria", sort: (p) => getCat(p.catId).nome || "", render: (p) => { const c = getCat(p.catId); return c.nome ? `<span class="color-dot" style="background:${esc(c.cor || "#3b82f6")}"></span>${esc(c.nome)}` : '<span class="muted">—</span>'; } },
        { key: "custo", label: "Custo", num: true, sort: (p) => p.custo || 0, render: (p) => `<strong style="color:${corCusto(p.custo || 0)}">${fmt(p.custo)}</strong>` },
        { key: "props", label: "Propostas", num: true, sort: (p) => propostasDoProduto(p.id).length,
          render: (p) => { const n = propostasDoProduto(p.id).length; return n ? `<button class="link-btn" data-act="props" data-id="${esc(p.id)}">${n}</button>` : '<span class="muted">0</span>'; } },
        { key: "acoes", label: "", sort: false, width: "90px", render: (p) => podeEditar()
          ? acoes(btnEditar(p.id), btnExcluir(p.id, propostasDoProduto(p.id).length ? `Usado em ${propostasDoProduto(p.id).length} proposta(s)` : "")) : "" },
      ],
    });

    onAction(el, {
      cat: (id) => { catFiltro = id; chips(); tabela.refresh(); },
      novo: () => abrirForm(),
      editar: (id) => abrirForm(store.find("produtos", id)),
      excluir: async (id) => {
        if (!await confirmar("Excluir este produto?", { ok: "Excluir", perigo: true })) return;
        await store.remove("produtos", id); toast("Produto excluído.");
      },
      props: (id, btn) => abrirPopoverPropostas(store.find("produtos", id), btn),
      excel: () => exportarExcel(store.get("produtos").map((p) => ({ Código: p.codigo, Nome: p.nome, Marca: p.marca, Custo: p.custo, Categoria: getCat(p.catId).nome || "", CategoriaId: p.catId || "" })), "Produtos", "produtos"),
      importar: () => el.querySelector("#imp-file").click(),
    });
    el.querySelector("#imp-file")?.addEventListener("change", (e) => { if (e.target.files[0]) importarExcel(e.target.files[0]); e.target.value = ""; });

    chips(); kpis();
    unsub = store.on("*", () => { chips(); kpis(); tabela.refresh(); });
  },

  destroy() { unsub?.(); catFiltro = ""; fecharPopover(); },
};

// ---------- formulário ----------
function abrirForm(p = null) {
  const cats = store.get("categorias").slice().sort((a, b) => a.nome.localeCompare(b.nome));
  let ficha = p?.prodFichaData || "";
  formModal({
    titulo: p ? "Editar produto" : "Novo produto",
    corpo:
      linha(campo("Nome", inputTxt("nome", p?.nome || "", "required")), campo("Código", inputTxt("codigo", p?.codigo || "", "required")))
      + linha(campo("Marca", inputTxt("marca", p?.marca || "", "required")), campo("Custo (R$)", inputNum("custo", p?.custo ?? "", 'step="0.01" min="0" required')),
              campo("Categoria", select("catId", [["", "Selecione…"], ...cats.map((c) => [c.id, c.nome])], p?.catId || "")))
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
      await store.setItem("produtos", { ...(p || {}), id: p?.id || newId(), nome, codigo, marca, custo: parseFloat(v.custo) || 0, catId: v.catId, prodFichaData: ficha });
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
  const atuais = store.get("produtos");
  const ops = []; let atualizados = 0, adicionados = 0;
  for (const r of rows) {
    const codigo = String(r["Código"] ?? r["Codigo"] ?? "").trim(); if (!codigo) continue;
    const val = (k) => r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== "" ? String(r[k]).trim() : undefined;
    const ex = atuais.find((p) => p.codigo === codigo);
    if (ex) {
      const upd = { ...ex };
      if (val("Nome")) upd.nome = val("Nome");
      if (val("Marca")) upd.marca = val("Marca");
      if (val("Custo")) upd.custo = parseFloat(val("Custo").replace(",", ".")) || 0;
      if (val("CategoriaId")) upd.catId = val("CategoriaId");
      ops.push(upd); atualizados++;
    } else {
      ops.push({ id: newId(), nome: val("Nome") || "", codigo, marca: val("Marca") || "", custo: parseFloat((val("Custo") || "0").replace(",", ".")) || 0, catId: val("CategoriaId") || "" });
      adicionados++;
    }
  }
  if (!ops.length) { toast("A planilha não tem a coluna Código ou está vazia.", "erro"); return; }
  if (!await confirmar(`Importar: ${atualizados} produto(s) atualizado(s) e ${adicionados} novo(s)?`, { ok: "Importar" })) return;
  toast("Importando…", "info");
  for (const item of ops) await store.setItem("produtos", item);
  toast(`Importação concluída: ${atualizados} atualizado(s), ${adicionados} adicionado(s).`);
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

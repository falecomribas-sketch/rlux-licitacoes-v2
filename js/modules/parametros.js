// Parâmetros: precificação (piso) e regras da IA (padrões por família e equivalências de termo).
// Firestore: config/precificacao e config/regrasIA. Só Admin edita; todos podem ver.
import { store } from "../core/store.js";
import { toast, icon, closeModal, confirmar } from "../core/ui.js";
import { formModal, lerForm, campo, inputTxt, textarea, select, linha } from "../core/forms.js";
import { esc, fmt } from "../core/utils.js";
import { isAdmin } from "../core/auth.js";
import { iniciarPreco, getCfg, onCfg, salvarCfg, piso, pedidoMinimoSemAjuste, FAMILIAS_TEC } from "../core/preco.js";

// Regras portadas do prompt "GPT 2" — ponto de partida editável
export const REGRAS_PADRAO = {
  padroes: [
    { familia: "iluminacao", regra: "Tubular T8 sem potência informada: usar a menor potência compatível com o comprimento — 60 cm = 9 W, 120 cm = 18 W, 240 cm = 36 W." },
    { familia: "iluminacao", regra: "Tubular T8 sem temperatura de cor informada: considerar 6500 K. Se o edital exigir outra (3000 K, 4000 K…), prevalece o edital." },
    { familia: "iluminacao", regra: "Sem potência exata na base: adotar a próxima potência MAIOR compatível, sem conflito técnico. Potência menor só se não houver maior, com confiança baixa." },
    { familia: "iluminacao", regra: "Refletor sem detalhe = refletor LED SMD quando potência e IP coincidirem." },
    { familia: "protecao", regra: "Disjuntor sem curva informada = curva C; sem padrão informado = DIN; sem kA informado ou sem exigência acima de 3 kA = 3 kA." },
    { familia: "protecao", regra: "Se o edital exigir kA acima de 3 (4,5 / 5 / 6 / 10 kA), nunca oferecer 3 kA." },
    { familia: "comando", regra: "Contator: corrente nominal e tensão da bobina têm prioridade sobre potência. Próxima corrente maior só sem conflito de bobina, polos, classe e contato auxiliar." },
    { familia: "conexao", regra: "Priorizar tipo, corrente, polos, tensão, padrão industrial (IEC 60309), IP e posição horária." },
    { familia: "barramento", regra: "Priorizar tipo, aplicação, polos/vias, corrente, padrão DIN/pente e compatibilidade dimensional." },
    { familia: "pilhas", regra: "Pilha/bateria sem embalagem definida no edital (ou unidade 'pacote' sem contagem): cotar a MENOR embalagem disponível — unidade avulsa; se não houver, blister com 2. Nunca assumir blister com 4 ou mais sem o edital dizer." },
    { familia: "pilhas", regra: "Pilha sem química informada = alcalina. 'Pilha palito' = AAA; 'pilha pequena' = AA; 'pilha média' = C; 'pilha grande' = D." },
    { familia: "pilhas", regra: "Bateria selada VRLA/AGM: casar por tensão (V) e capacidade (Ah); terminal T1 = Faston 187 (4,8 mm) e T2 = Faston 250 (6,3 mm). Se o edital aceita 'Faston 187 ou 250', qualquer T1/T2 atende com confiança alta." },
    { familia: "outros", regra: "Entre candidatos tecnicamente equivalentes para o mesmo item, escolher o de MENOR custo; cite o outro em 'alternativas'." },
  ],
  equivalencias: [
    { termoEdital: "relé fotoelétrico", termoBase: "relé fotocontrolador" },
    { termoEdital: "fotocélula", termoBase: "relé fotocontrolador" },
    { termoEdital: "lâmpada tubular", termoBase: "lâmpada LED tubular T8" },
    { termoEdital: "interruptor diferencial residual", termoBase: "IDR" },
    { termoEdital: "tomada industrial", termoBase: "acoplador industrial" },
    { termoEdital: "pilha palito", termoBase: "pilha alcalina AAA" },
    { termoEdital: "bateria 9V 6LF22", termoBase: "bateria alcalina 9V 6LR61" },
    { termoEdital: "terminal Faston 250", termoBase: "T2" },
    { termoEdital: "terminal Faston 187", termoBase: "T1" },
    { termoEdital: "bateria chumbo-ácida regulada por válvula", termoBase: "bateria selada VRLA-AGM" },
  ],
};
let regras = null, unsubR = null, unsubC = null; const ouvintesR = new Set();
export const getRegras = () => regras || REGRAS_PADRAO;

// Prompts da IA (config/promptsIA). Vazio = usa o padrão do servidor (functions/prompts-padrao.json).
let prompts = {}, unsubP = null, padraoPrompts = null;
export const getPrompts = () => ({ analise: prompts.analise || "", casar: prompts.casar || "" });
export function iniciarPrompts() { if (unsubP) return; unsubP = store.watchObj("config", "promptsIA", (d) => { prompts = d || {}; ouvintesR.forEach((f) => f()); }); }
async function carregarPadrao() { if (padraoPrompts) return padraoPrompts; try { padraoPrompts = await (await fetch("functions/prompts-padrao.json", { cache: "no-cache" })).json(); } catch { padraoPrompts = { analise: "", casar: "" }; } return padraoPrompts; }
export function iniciarRegras() { if (unsubR) return; unsubR = store.watchObj("config", "regrasIA", (d) => { regras = d && Array.isArray(d.padroes) ? { padroes: d.padroes, equivalencias: d.equivalencias || [] } : null; ouvintesR.forEach((f) => f()); }); }

export default {
  id: "parametros", titulo: "Parâmetros", grupo: "CRM e análise", icone: "scale",
  render(el) {
    iniciarPreco();
    const desenhar = () => {
      const c = getCfg(), r = getRegras(), ro = isAdmin() ? "" : "disabled";
      el.innerHTML = `
        <div class="page-head"><h2>Parâmetros</h2></div>
        <div class="grid grid-2">
          <div class="card"><div class="card-head"><h2>Precificação (piso de venda)</h2></div><div class="card-body">
            <form id="f-preco" class="form">
              <div class="form-row cols-2">
                <label class="field"><span>Simples Nacional (%)</span><input type="number" step="0.01" name="simples" value="${c.simples}" ${ro}></label>
                <label class="field"><span>Lucro mínimo (%)</span><input type="number" step="0.01" name="lucroMin" value="${c.lucroMin}" ${ro}></label>
                <label class="field"><span>Frete (%)</span><input type="number" step="0.01" name="fretePct" value="${c.fretePct}" ${ro}></label>
                <label class="field"><span>Frete mínimo (R$)</span><input type="number" step="0.01" name="freteMin" value="${c.freteMin}" ${ro}></label>
                <label class="field"><span>Desconto sobre a referência do órgão (%)</span><input type="number" step="0.01" name="descontoRef" value="${c.descontoRef}" ${ro}></label>
                <label class="field"><span>Validade do custo (dias)</span><input type="number" name="custoValidadeDias" value="${c.custoValidadeDias}" ${ro}></label>
              </div>
              <div class="info-box" id="simul"></div>
              ${isAdmin() ? `<div style="text-align:right;margin-top:10px"><button class="btn btn-primary" type="submit">Salvar</button></div>` : `<p class="muted" style="font-size:12px">Somente administradores alteram os parâmetros.</p>`}
            </form></div></div>
          <div class="card"><div class="card-head"><h2>Como o piso é calculado</h2></div><div class="card-body" style="font-size:13.5px;line-height:1.55">
            <p><strong>Piso = custo ÷ (1 − Simples − frete − lucro)</strong>. Os três percentuais incidem sobre o preço de venda; por isso a divisão, e não a soma sobre o custo.</p>
            <p>A proposta entra com o <strong>preço de referência do órgão</strong> (menos o desconto configurado, se houver). O piso é o limite para o robô de lance.</p>
            <p>Quando ${c.fretePct}% do pedido fica abaixo de ${fmt(c.freteMin)} (pedidos abaixo de <strong>${fmt(pedidoMinimoSemAjuste(c))}</strong>), a diferença é rateada entre os itens e o sistema avisa.</p>
            <p>Produto com custo há mais de ${c.custoValidadeDias} dias aparece marcado como <strong>custo vencido</strong> na proposta e na análise do edital.</p>
          </div></div>
        </div>
        <div class="section-title">Regras da IA (correspondência item do edital → produto RLUX)</div>
        <div class="grid grid-2">
          <div class="card"><div class="card-head"><h2>Padrões por família</h2>${isAdmin() ? `<button class="btn btn-ghost btn-sm" data-act="add-padrao">${icon("plus")} Regra</button>` : ""}</div><div class="card-body flush" id="padroes"></div></div>
          <div class="card"><div class="card-head"><h2>Equivalências de termo</h2>${isAdmin() ? `<button class="btn btn-ghost btn-sm" data-act="add-equiv">${icon("plus")} Equivalência</button>` : ""}</div><div class="card-body flush" id="equivs"></div></div>
        </div>
        <div class="section-title">Prompts da IA (texto que a IA recebe; a parte técnica do formato de resposta é fixa)</div>
        <div class="grid grid-2" id="prompts">
          ${[["analise", "Analisador de edital (Etapa 1: resumo, documentação e itens — antigo Leitor + GPT 1)", "Marcadores que o sistema preenche: {{familias}} (famílias e palavras-chave) e {{naoLocalizado}} (frase padrão para dado não encontrado)."], ["casar", "Correspondência item → produto (Etapa 3 — antigo GPT 2)", "Marcadores: {{padroes}} (regras por família acima) e {{equivalencias}} (tabela de equivalências acima)."]].map(([k, t, dica]) => `
          <div class="card"><div class="card-head"><h2 style="font-size:14px">${t}</h2><span class="tag ${getPrompts()[k] ? "tag-amber" : "tag-gray"}" id="pst-${k}">${getPrompts()[k] ? "editado" : "padrão"}</span></div><div class="card-body">
            <textarea id="pr-${k}" rows="14" style="width:100%;font:12.5px/1.45 ui-monospace,Menlo,Consolas,monospace;resize:vertical" ${ro} placeholder="Carregando o texto padrão…"></textarea>
            <p class="muted" style="font-size:12px;margin:6px 0 0">${dica}</p>
            ${isAdmin() ? `<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px"><button class="btn btn-ghost btn-sm" data-act="pr-padrao" data-k="${k}">Restaurar padrão</button><button class="btn btn-primary btn-sm" data-act="pr-salvar" data-k="${k}">Salvar</button></div>` : ""}
          </div></div>`).join("")}
        </div>`;
      carregarPadrao().then((pd) => ["analise", "casar"].forEach((k) => { const ta = el.querySelector(`#pr-${k}`); if (ta && !ta.value) ta.value = getPrompts()[k] || pd[k] || ""; }));
      const simul = () => { const v = lerPreco(el); const ex = [16.44, 22.45, 142.68]; el.querySelector("#simul").innerHTML = `<div><div class="k">Fator</div>× ${(1 / Math.max(0.05, 1 - (v.simples + v.fretePct + v.lucroMin) / 100)).toFixed(3)}</div>` + ex.map((x) => `<div><div class="k">Custo ${fmt(x)}</div>piso ${fmt(piso(x, v))}</div>`).join(""); };
      el.querySelector("#f-preco").addEventListener("input", simul); simul();
      el.querySelector("#f-preco").addEventListener("submit", async (e) => { e.preventDefault(); if (!isAdmin()) return; await salvarCfg(lerPreco(el)); toast("Parâmetros salvos."); });
      tabelas(el, r);
    };
    const tabelas = (el, r) => {
      const ro = !isAdmin();
      el.querySelector("#padroes").innerHTML = `<div class="table-wrap"><table><thead><tr><th style="width:190px">Família</th><th>Regra</th>${ro ? "" : "<th></th>"}</tr></thead><tbody>${r.padroes.map((p, i) => `<tr><td>${esc(FAMILIAS_TEC[p.familia]?.nome.split(" (")[0] || p.familia)}</td><td style="font-size:13px">${esc(p.regra)}</td>${ro ? "" : `<td><button class="icon-btn sm" data-act="ed-padrao" data-id="${i}">${icon("edit")}</button><button class="icon-btn sm danger" data-act="rm-padrao" data-id="${i}">${icon("trash")}</button></td>`}</tr>`).join("") || `<tr><td colspan="3" class="muted">Nenhuma regra</td></tr>`}</tbody></table></div>`;
      el.querySelector("#equivs").innerHTML = `<div class="table-wrap"><table><thead><tr><th>Termo no edital</th><th>Equivale a (na base RLUX)</th>${ro ? "" : "<th></th>"}</tr></thead><tbody>${r.equivalencias.map((q, i) => `<tr><td>${esc(q.termoEdital)}</td><td>${esc(q.termoBase)}</td>${ro ? "" : `<td><button class="icon-btn sm danger" data-act="rm-equiv" data-id="${i}">${icon("trash")}</button></td>`}</tr>`).join("") || `<tr><td colspan="3" class="muted">Nenhuma equivalência</td></tr>`}</tbody></table></div>`;
    };
    const salvarRegras = async (r) => { await store.setObj("config", "regrasIA", { ...r, _atualizado: new Date().toISOString() }); toast("Regras salvas."); };
    el.addEventListener("click", async (e) => { const b = e.target.closest("[data-act]"); if (!b || !isAdmin()) return; const r = JSON.parse(JSON.stringify(getRegras())); const i = +b.dataset.id;
      if (b.dataset.act === "add-padrao" || b.dataset.act === "ed-padrao") { const ed = b.dataset.act === "ed-padrao"; const atual = ed ? r.padroes[i] : { familia: "iluminacao", regra: "" };
        formModal({ titulo: ed ? "Editar regra" : "Nova regra", corpo: campo("Família", select("familia", Object.entries(FAMILIAS_TEC).map(([k, v]) => [k, v.nome]), atual.familia)) + campo("Regra (uma frase objetiva)", textarea("regra", atual.regra, 'rows="3" required')),
          async onSalvar(form) { const v = lerForm(form); if (!v.regra.trim()) throw new Error("Escreva a regra."); if (ed) r.padroes[i] = { familia: v.familia, regra: v.regra.trim() }; else r.padroes.push({ familia: v.familia, regra: v.regra.trim() }); await salvarRegras(r); closeModal(); } }); return; }
      if (b.dataset.act === "add-equiv") { formModal({ titulo: "Nova equivalência", corpo: linha(campo("Termo como aparece no edital", inputTxt("termoEdital", "", "required")), campo("Equivale a (termo da base RLUX)", inputTxt("termoBase", "", "required"))),
          async onSalvar(form) { const v = lerForm(form); if (!v.termoEdital.trim() || !v.termoBase.trim()) throw new Error("Preencha os dois termos."); r.equivalencias.push({ termoEdital: v.termoEdital.trim(), termoBase: v.termoBase.trim() }); await salvarRegras(r); closeModal(); } }); return; }
      if (b.dataset.act === "pr-salvar" || b.dataset.act === "pr-padrao") { const k = b.dataset.k; const ta = el.querySelector(`#pr-${k}`); const pd = await carregarPadrao();
        if (b.dataset.act === "pr-padrao") { ta.value = pd[k] || ""; }
        const txt = ta.value.trim(); const igual = txt === (pd[k] || "").trim();
        if (!igual && txt.length < 50) return toast("O prompt ficou curto demais.", "erro");
        const marcadores = k === "analise" ? ["{{familias}}"] : ["{{padroes}}"]; const faltando = marcadores.filter((m) => !txt.includes(m));
        if (!igual && faltando.length && !await confirmar(`O texto não contém ${faltando.join(", ")}: a IA não receberá essa parte. Salvar mesmo assim?`)) return;
        await store.setObj("config", "promptsIA", { ...prompts, [k]: igual ? "" : txt, _atualizado: new Date().toISOString() });
        const st = el.querySelector(`#pst-${k}`); if (st) { st.textContent = igual ? "padrão" : "editado"; st.className = `tag ${igual ? "tag-gray" : "tag-amber"}`; }
        toast(igual ? "Prompt restaurado ao padrão." : "Prompt salvo. Vale para as próximas análises."); return; }
      if (b.dataset.act === "rm-padrao") { r.padroes.splice(i, 1); await salvarRegras(r); }
      if (b.dataset.act === "rm-equiv") { r.equivalencias.splice(i, 1); await salvarRegras(r); } });
    iniciarRegras(); iniciarPrompts(); const fR = () => { if (el.querySelector("#padroes")) tabelas(el, getRegras()); }; ouvintesR.add(fR); el._fR = fR;
    unsubC = onCfg(() => { if (document.activeElement?.form?.id !== "f-preco") desenhar(); });
    desenhar();
  },
  destroy() { unsubC?.(); unsubC = null; ouvintesR.clear(); },
};
const lerPreco = (el) => { const f = el.querySelector("#f-preco"); const n = (k) => parseFloat(f.elements[k].value) || 0; return { simples: n("simples"), lucroMin: n("lucroMin"), fretePct: n("fretePct"), freteMin: n("freteMin"), descontoRef: n("descontoRef"), custoValidadeDias: Math.round(n("custoValidadeDias")) || 90 }; };

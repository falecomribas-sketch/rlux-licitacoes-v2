// Régua de Envio — visão auditável da régua de relacionamento: cada ATA/adesão com saldo,
// quantos e-mails já foram, o último e o próximo. Toda a lógica está em core/regua.js.
import { store } from "../core/store.js?v=20261113-114024";
import { dataTable, acoes, onAction } from "../core/table.js?v=20261113-114024";
import { exportarExcel } from "../core/forms.js?v=20261113-114024";
import { toast, icon, tag, openModal, closeModal } from "../core/ui.js?v=20261113-114024";
import { esc, fmt, fmtD, hojeIso, toTitleCase } from "../core/utils.js?v=20261113-114024";
import { podeEditar } from "../core/auth.js?v=20261113-114024";
import { iniciarRegua, onRegua, linhasRegua, situacaoRegua, montarEmail, enviarPelaRegua, copiarPelaRegua, TIPO_ROTULO, INTERVALO } from "../core/regua.js?v=20261113-114024";

let unsub = null, unsubR = null, filtro = "todas";
const FILTROS = [["todas", "Todas"], ["atrasadas", "Atrasadas"], ["hoje", "Para hoje"], ["semana", "Próximos 7 dias"], ["encerradas", "Encerradas"]];
const ok = (li) => { const s = situacaoRegua(li); if (filtro === "todas") return true; if (filtro === "encerradas") return li.encerrada; if (li.encerrada) return false; if (filtro === "atrasadas") return s.ord === 0; if (filtro === "hoje") return s.ord <= 1; return s.ord <= 2; };

export default {
  id: "reguas", titulo: "Régua de Envio", grupo: "CRM e análise", icone: "send",
  render(el) {
    iniciarRegua();
    el.innerHTML = `
      <div class="grid grid-4" id="kpis" style="margin-bottom:16px"></div>
      <div class="page-head"><h2>Régua de Envio</h2><div class="actions"><button class="btn btn-ghost" data-act="excel">${icon("download")} Excel</button></div></div>
      <p class="muted" style="margin:-6px 0 14px;font-size:13px;max-width:900px"><strong>Como funciona:</strong> acompanhamento a cada ${INTERVALO} dias enquanto houver saldo; avisos de renovação a 60 e 30 dias do vencimento da ATA; agradecimento quando o fornecimento termina. Cada envio fica registrado aqui e no sistema atual — é a mesma régua.</p>
      <div class="card"><div class="chip-filters" id="chips"></div><div class="card-body flush" id="tbl"></div></div>`;
    let cache = linhasRegua(); const recalc = () => { cache = linhasRegua(); };
    const chips = () => { el.querySelector("#chips").innerHTML = `<span class="muted">Mostrar:</span>` + FILTROS.map(([v, t]) => `<button class="chip ${filtro === v ? "active" : ""}" data-act="filtro" data-id="${v}">${t}</button>`).join(""); };
    const kpis = () => { const ativas = cache.filter((l) => !l.encerrada); const s = ativas.map(situacaoRegua);
      el.querySelector("#kpis").innerHTML = `
        <div class="kpi"><div class="kpi-label">Relacionamentos ativos</div><div class="kpi-value">${ativas.length}</div></div>
        <div class="kpi"><div class="kpi-label">Atrasados</div><div class="kpi-value" style="color:var(--red)">${s.filter((x) => x.ord === 0).length}</div></div>
        <div class="kpi"><div class="kpi-label">Para enviar hoje</div><div class="kpi-value" style="color:var(--blue)">${s.filter((x) => x.ord === 1).length}</div></div>
        <div class="kpi"><div class="kpi-label">E-mails enviados (total)</div><div class="kpi-value" style="color:var(--green)">${cache.reduce((t, l) => t + l.qtd, 0)}</div></div>`; };
    const tabela = dataTable({
      el: el.querySelector("#tbl"), rows: () => cache.filter(ok),
      search: (li, q) => [li.titulo, li.subtitulo, li.orgao?.nome, li.orgaoNome, li.orgao?.uasg, li.ataNum].some((v) => String(v || "").toLowerCase().includes(q)),
      placeholder: "Buscar pregão, órgão, UASG, ATA…", sort: { key: "sit", dir: "asc" }, empty: "Nada na régua com este filtro",
      columns: [
        { key: "titulo", label: "Licitação", sort: (li) => li.titulo, render: (li) => `<strong>${esc(li.titulo)}</strong><div class="muted" style="font-size:11px">${esc(li.subtitulo)}${li.dataRef ? " · " + fmtD(li.dataRef) : ""}</div>${li.origem === "adesao" ? tag("Adesão", "tag-purple") : ""}` },
        { key: "orgao", label: "Órgão", sort: (li) => li.orgaoNome || li.orgao?.nome || "", render: (li) => `${esc(toTitleCase(li.orgaoNome || li.orgao?.nome || "—"))}<div class="muted" style="font-size:11px">${li.orgao?.uasg ? "UASG " + esc(li.orgao.uasg) : ""}${li.ataNum ? " · " + esc(li.ataNum) : ""}</div>` },
        { key: "venc", label: "Vigência", sort: (li) => li.vencIso || "9999", render: (li) => li.vencIso ? `${fmtD(li.vencIso)}<div class="muted" style="font-size:11px">${li.diasVenc < 0 ? "encerrada" : li.diasVenc + " dias"}</div>` : "—" },
        { key: "saldo", label: "Saldo", num: true, sort: (li) => li.saldo, render: (li) => tag(fmt(li.saldo), li.saldo > 0 ? "tag-amber" : "tag-green") },
        { key: "qtd", label: "Envios", num: true, sort: (li) => li.qtd, render: (li) => `<button class="btn btn-ghost btn-sm" data-act="hist" data-id="${esc(li.origem + ":" + li.refId)}">${li.qtd}${li.retro ? "*" : ""} ${icon("eye")}</button>` },
        { key: "ultimo", label: "Último envio", sort: (li) => li.ultimo || "", render: (li) => li.ultimo ? `${fmtD(li.ultimo)}<div class="muted" style="font-size:11px">${esc(TIPO_ROTULO[li.envios[li.envios.length - 1]?.tipo] || "")}</div>` : `<span class="muted">Nunca</span>` },
        { key: "proximo", label: "Próximo", sort: (li) => li.encerrada ? "9999" : li.proximo || "", render: (li) => li.encerrada ? "—" : `${fmtD(li.proximo)}<div class="muted" style="font-size:11px">${esc(TIPO_ROTULO[li.tipoProx])}</div>` },
        { key: "sit", label: "Situação", sort: (li) => situacaoRegua(li).ord * 100000 + (li.proximo ? new Date(li.proximo).getTime() / 864e5 % 100000 : 0), render: (li) => { const s = situacaoRegua(li); return tag(s.txt, s.cls); } },
        { key: "acoes", label: "", sort: false, width: "130px", render: (li) => li.encerrada || !podeEditar() ? "" : acoes(`<button class="icon-btn sm" data-act="ver" data-id="${esc(li.origem + ":" + li.refId)}" title="Ver e-mail">${icon("eye")}</button>`, `<button class="icon-btn sm" data-act="enviar" data-id="${esc(li.origem + ":" + li.refId)}" title="Abrir no e-mail e registrar envio">${icon("mail")}</button>`, `<button class="icon-btn sm" data-act="copiar" data-id="${esc(li.origem + ":" + li.refId)}" title="Copiar texto e registrar envio">${icon("file")}</button>`) },
      ],
    });
    const achar = (key) => { const [origem, refId] = key.split(":"); return cache.find((l) => l.origem === origem && l.refId === refId); };
    onAction(el, {
      filtro: (id) => { filtro = id; chips(); tabela.refresh(); },
      ver: (k) => { const li = achar(k); if (li) verEmail(li); },
      enviar: (k) => { const li = achar(k); if (li) enviarPelaRegua(li.refId, li.origem, li.tipoProx, li.ultimos90); },
      copiar: (k) => { const li = achar(k); if (li) copiarPelaRegua(li.refId, li.origem, li.tipoProx, li.ultimos90); },
      hist: (k) => { const li = achar(k); if (!li) return; openModal({ titulo: `Envios — ${li.titulo}`, corpo: li.envios.length ? `<div class="list">${li.envios.slice().reverse().map((e) => `<div class="list-item"><div style="flex:1"><strong>${fmtD(e.data)}</strong> <span class="muted">${new Date(e.data).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span></div>${tag(TIPO_ROTULO[e.tipo] || e.tipo, "tag-blue")}${e.retro ? ` <span class="muted" style="font-size:11px">reconstruído*</span>` : ""}</div>`).join("")}</div>${li.retro ? `<p class="muted" style="font-size:11px;margin-top:8px">* Registros anteriores ao histórico detalhado: reconstruídos a partir do último carimbo de cada tipo.</p>` : ""}` : `<p class="muted">Nenhum envio registrado.</p>`, rodape: `<button class="btn btn-ghost" data-close>Fechar</button>` }); },
      excel: () => exportarExcel(cache.map((li) => { const s = situacaoRegua(li); return { Origem: li.origem === "adesao" ? "Adesão" : "Proposta", Licitação: li.titulo, Tipo: li.subtitulo, Órgão: li.orgaoNome || li.orgao?.nome || "", UASG: li.orgao?.uasg || "", ATA: li.ataNum || "", Vigência: fmtD(li.vencIso), Saldo: li.saldo, Envios: li.qtd, "Último envio": fmtD(li.ultimo), "Próximo envio": li.encerrada ? "" : fmtD(li.proximo), "Tipo do próximo": li.encerrada ? "" : TIPO_ROTULO[li.tipoProx], Situação: s.txt }; }), "Régua", "regua_de_envio"),
    });
    chips(); kpis();
    const atualizar = () => { recalc(); kpis(); tabela.refresh(); };
    unsub = store.on("*", atualizar); unsubR = onRegua(atualizar);
  },
  destroy() { unsub?.(); unsubR?.(); filtro = "todas"; },
};

export function verEmail(li) {
  const email = montarEmail(li.refId, li.origem, li.ultimos90, li.tipoProx); if (!email) return toast("Não foi possível montar o e-mail.", "erro");
  const m = openModal({ titulo: `${TIPO_ROTULO[li.tipoProx]} — ${li.titulo}`, largura: "lg",
    corpo: `<div class="info-box" style="margin-bottom:10px"><div><div class="k">Para</div>${esc(email.para || "(sem e-mail cadastrado no órgão)")}</div><div><div class="k">Assunto</div>${esc(email.assunto)}</div></div>
      <textarea class="input" rows="18" style="width:100%;font-family:inherit;font-size:13px" readonly>${esc(email.corpo)}</textarea>`,
    rodape: `<button class="btn btn-ghost" data-close>Fechar</button>${podeEditar() ? `<button class="btn btn-ghost" data-act="copiar">${icon("file")} Copiar e registrar</button><button class="btn btn-primary" data-act="enviar">${icon("mail")} Abrir no e-mail e registrar</button>` : ""}` });
  m.addEventListener("click", async (e) => { const b = e.target.closest("[data-act]"); if (!b) return;
    if (b.dataset.act === "enviar") { closeModal(); await enviarPelaRegua(li.refId, li.origem, li.tipoProx, li.ultimos90); }
    if (b.dataset.act === "copiar") { closeModal(); await copiarPelaRegua(li.refId, li.origem, li.tipoProx, li.ultimos90); } });
}

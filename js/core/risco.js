// Monitor de reequilíbrio: compara o custo gravado na proposta (época da disputa) com o custo atual do cadastro,
// para ATAs vigentes com saldo. Gatilhos (Parâmetros): lucro atual abaixo do mínimo OU alta do custo acima do limite.
import { store } from "./store.js?v=20261125-173716";
import { getProp, getLicit, getOrgao, propSaldoDetalhado, ataFoiRenovada, isVencido } from "./domain.js?v=20261125-173716";
import { getCfg, piso, encargoPct, custoVencido, diasCusto } from "./preco.js?v=20261125-173716";
import { hojeIso } from "./utils.js?v=20261125-173716";

export function itensEmRisco() {
  const cfg = getCfg(); const hoje = hojeIso();
  const lucroMinReq = cfg.lucroMinReq ?? cfg.lucroMin ?? 7, altaReq = cfg.altaCustoReq ?? 10;
  const emAndamento = store.get("reequilibrio").filter((r) => r.status === "Solicitado" || r.status === "Em Análise");
  const out = [];
  const comAta = new Set(store.get("atas").map((a) => a.propostaId).filter(Boolean));
  const avaliar = (ata, p) => {
    const l = getLicit(p.licitacaoId), o = getOrgao(l?.orgaoId);
    const sd = propSaldoDetalhado(p);
    const itens = sd.detalhado ? sd.itens : (p.itens || []).map((it) => ({ ...it, saldo: it.qtd || 0, valorSaldo: (it.qtd || 0) * (it.preco || 0) }));
    itens.forEach((it) => {
      if (!it.produtoId || !(it.saldo > 0) || !(it.preco > 0)) return;
      const prod = store.find("produtos", it.produtoId); if (!prod) return;
      const custoProp = +it.custo || 0; const semCustoCadastro = !(+prod.custo > 0); const custoAtual = semCustoCadastro ? custoProp : +prod.custo; if (!custoAtual) return; // sem custo no cadastro: avalia pelo custo da proposta
      const pisoAtual = piso(custoAtual, cfg, o?.estado);
      const lucroAtual = (1 - (cfg.simples + cfg.fretePct + encargoPct(o?.estado, cfg)) / 100) - custoAtual / it.preco; // fração do preço que sobra como lucro hoje
      const variacao = custoProp > 0 ? (custoAtual - custoProp) / custoProp * 100 : null;
      const semData = semCustoCadastro || custoVencido(prod);
      const gatilhoLucro = lucroAtual * 100 < lucroMinReq, gatilhoAlta = variacao !== null && variacao > altaReq;
      if (!gatilhoLucro && !gatilhoAlta) return;
      const pedido = emAndamento.find((r) => r.ataId === ata.id && (r.itens || []).some((x) => String(x.num) === String(it.num) || x.nome === it.nome));
      out.push({ ata, semAta: !!ata.semAta, p, l, o, item: it, prod, custoProp, custoAtual, semCustoCadastro, custoData: prod.custoData || "", diasCusto: diasCusto(prod), semData, variacao, lucroAtual: lucroAtual * 100, pisoAtual,
        impacto: it.saldo * Math.max(0, custoAtual - custoProp), abaixoPiso: it.preco < pisoAtual, gatilhoLucro, gatilhoAlta, pedidoId: pedido?.id || "", nivel: pedido ? "em_andamento" : (variacao !== null && variacao <= 1) ? "origem" : semData ? "verificar" : (it.preco < pisoAtual ? "critico" : "alerta") }); // "origem": margem já era baixa na proposta, sem alta de custo — não fundamenta reequilíbrio
    });
  };
  store.get("atas").forEach((ata) => {
    if (!ata.propostaId) return;
    if (ata.vencimento && ata.vencimento < hoje) return; // encerrada
    if (ataFoiRenovada(ata)) return; // substituída por nova geração
    const p = getProp(ata.propostaId); if (p) avaliar(ata, p);
  });
  // propostas vencidas sem ATA cadastrada (contrato/compra direta): também têm saldo a fornecer e podem precisar de reequilíbrio
  store.get("propostas").forEach((p) => {
    if (!isVencido(p) || comAta.has(p.id) || p.espelhoDeAtaId) return;
    if (["Faturado Total"].includes(p.status)) return;
    avaliar({ id: "p:" + p.id, numero: "(sem ATA)", vencimento: "", propostaId: p.id, semAta: true }, p);
  });
  return out.sort((a, b) => b.impacto - a.impacto);
}

// Solicitações de reequilíbrio sem retorno: dias desde a última cobrança (ou desde o envio)
export const REQ_ABERTO = ["Solicitado", "Em Análise"];
export function diasAguardando(r) {
  if (!REQ_ABERTO.includes(r?.status)) return null;
  const ult = (r.cobrancasRetorno || []).map((c) => c.data).sort().pop() || r.dataSolic; if (!ult) return null;
  return Math.max(0, Math.floor((new Date(hojeIso() + "T00:00:00") - new Date(String(ult).slice(0, 10) + "T00:00:00")) / 864e5));
}
export const reequilibriosSemRetorno = (min = 15) => store.get("reequilibrio").filter((r) => (diasAguardando(r) ?? -1) >= min).sort((a, b) => diasAguardando(b) - diasAguardando(a));

// Por que um órgão/ATA não aparece no monitor: diagnóstico para a busca sem resultado
export function diagnosticoRisco(q) {
  const cfg = getCfg(); const hoje = hojeIso(); const n = (x) => String(x ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); const qq = n(q).trim(); if (!qq) return [];
  const lucroMinReq = cfg.lucroMinReq ?? cfg.lucroMin ?? 7, altaReq = cfg.altaCustoReq ?? 10; const out = [];
  store.get("atas").forEach((ata) => {
    const p = getProp(ata.propostaId); const l = getLicit(p?.licitacaoId); const o = getOrgao(l?.orgaoId);
    if (![ata.numero, o?.nome, o?.uasg, l?.numero].some((v) => n(v).includes(qq))) return;
    const rot = `ATA ${ata.numero || "—"} · ${o?.nome || "—"}`;
    if (!p) return out.push({ rot, motivo: "ATA sem proposta vinculada." });
    if (ata.vencimento && ata.vencimento < hoje) return out.push({ rot, motivo: `ATA vencida em ${ata.vencimento.split("-").reverse().join("/")} — o monitor só olha ATAs vigentes.` });
    if (ataFoiRenovada(ata)) return out.push({ rot, motivo: "ATA renovada — a vigência atual é a nova geração (veja a renovação)." });
    const sd = propSaldoDetalhado(p); const itens = sd.detalhado ? sd.itens : (p.itens || []).map((it) => ({ ...it, saldo: it.qtd || 0 }));
    if (!itens.length) return out.push({ rot, motivo: "Proposta sem itens." });
    const custoDe = (it) => { const pr = it.produtoId ? store.find("produtos", it.produtoId) : null; return +pr?.custo > 0 ? +pr.custo : (+it.custo || 0); };
    const semProd = itens.filter((it) => !it.produtoId).length, semSaldo = itens.filter((it) => !(it.saldo > 0)).length, semCusto = itens.filter((it) => it.produtoId && !(custoDe(it) > 0)).length;
    const avaliados = itens.filter((it) => it.produtoId && it.saldo > 0 && it.preco > 0 && custoDe(it) > 0);
    if (!avaliados.length) return out.push({ rot, motivo: `Nenhum item avaliável: ${[semProd ? `${semProd} sem produto do catálogo vinculado` : "", semSaldo ? `${semSaldo} sem saldo a fornecer` : "", semCusto ? `${semCusto} com produto sem custo cadastrado` : ""].filter(Boolean).join(", ")}.` });
    const detalhes = avaliados.map((it) => { const ca = custoDe(it), cp = +it.custo || 0; const lucro = ((1 - (cfg.simples + cfg.fretePct + encargoPct(o?.estado, cfg)) / 100) - ca / it.preco) * 100; const v = cp > 0 ? (ca - cp) / cp * 100 : null; return `item ${it.num ?? ""}: lucro hoje ${lucro.toFixed(1)}%${v !== null ? `, custo ${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : ""}`; });
    out.push({ rot, motivo: `${avaliados.length} item(ns) avaliado(s) e nenhum atingiu os gatilhos (lucro < ${lucroMinReq}% ou custo +${altaReq}%): ${detalhes.slice(0, 6).join("; ")}${detalhes.length > 6 ? "…" : ""}.`, ok: true });
  });
  const comAta = new Set(store.get("atas").map((a) => a.propostaId).filter(Boolean));
  store.get("propostas").forEach((p) => { if (comAta.has(p.id)) return; const l = getLicit(p.licitacaoId), o = getOrgao(l?.orgaoId); if (![o?.nome, o?.uasg, l?.numero].some((v) => n(v).includes(qq))) return;
    const rot = `Proposta #${p.num || "?"} · ${l?.numero || "—"} · ${o?.nome || "—"}`;
    if (!isVencido(p)) return out.push({ rot, motivo: `Status "${p.status || "Em Andamento"}" — só propostas vencidas entram no monitor.` });
    if (p.status === "Faturado Total") return out.push({ rot, motivo: "Faturado Total — sem saldo a fornecer." });
    out.push({ rot, motivo: "Proposta vencida sem ATA cadastrada: é avaliada pelos itens da proposta; se nenhum atingiu os gatilhos, não aparece. Cadastre a ATA em Gestão de ATA para controlar vigência e saldo." }); });
  return out;
}

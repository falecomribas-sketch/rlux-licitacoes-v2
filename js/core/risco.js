// Monitor de reequilíbrio: compara o custo gravado na proposta (época da disputa) com o custo atual do cadastro,
// para ATAs vigentes com saldo. Gatilhos (Parâmetros): lucro atual abaixo do mínimo OU alta do custo acima do limite.
import { store } from "./store.js?v=20261113-205127";
import { getProp, getLicit, getOrgao, propSaldoDetalhado, ataFoiRenovada } from "./domain.js?v=20261113-205127";
import { getCfg, piso, custoVencido, diasCusto } from "./preco.js?v=20261113-205127";
import { hojeIso } from "./utils.js?v=20261113-205127";

export function itensEmRisco() {
  const cfg = getCfg(); const hoje = hojeIso();
  const lucroMinReq = cfg.lucroMinReq ?? cfg.lucroMin ?? 7, altaReq = cfg.altaCustoReq ?? 10;
  const emAndamento = store.get("reequilibrio").filter((r) => r.status === "Solicitado" || r.status === "Em Análise");
  const out = [];
  store.get("atas").forEach((ata) => {
    if (!ata.propostaId) return;
    if (ata.vencimento && ata.vencimento < hoje) return; // encerrada
    if (ataFoiRenovada(ata)) return; // substituída por nova geração
    const p = getProp(ata.propostaId); if (!p) return;
    const l = getLicit(p.licitacaoId), o = getOrgao(l?.orgaoId);
    const sd = propSaldoDetalhado(p);
    const itens = sd.detalhado ? sd.itens : (p.itens || []).map((it) => ({ ...it, saldo: it.qtd || 0, valorSaldo: (it.qtd || 0) * (it.preco || 0) }));
    itens.forEach((it) => {
      if (!it.produtoId || !(it.saldo > 0) || !(it.preco > 0)) return;
      const prod = store.find("produtos", it.produtoId); if (!prod) return;
      const custoProp = +it.custo || 0, custoAtual = +prod.custo || 0; if (!custoAtual) return;
      const pisoAtual = piso(custoAtual);
      const lucroAtual = (1 - (cfg.simples + cfg.fretePct) / 100) - custoAtual / it.preco; // fração do preço que sobra como lucro hoje
      const variacao = custoProp > 0 ? (custoAtual - custoProp) / custoProp * 100 : null;
      const semData = custoVencido(prod);
      const gatilhoLucro = lucroAtual * 100 < lucroMinReq, gatilhoAlta = variacao !== null && variacao > altaReq;
      if (!gatilhoLucro && !gatilhoAlta) return;
      const pedido = emAndamento.find((r) => r.ataId === ata.id && (r.itens || []).some((x) => String(x.num) === String(it.num) || x.nome === it.nome));
      out.push({ ata, p, l, o, item: it, prod, custoProp, custoAtual, custoData: prod.custoData || "", diasCusto: diasCusto(prod), semData, variacao, lucroAtual: lucroAtual * 100, pisoAtual,
        impacto: it.saldo * Math.max(0, custoAtual - custoProp), abaixoPiso: it.preco < pisoAtual, gatilhoLucro, gatilhoAlta, pedidoId: pedido?.id || "", nivel: pedido ? "em_andamento" : (variacao !== null && variacao <= 1) ? "origem" : semData ? "verificar" : (it.preco < pisoAtual ? "critico" : "alerta") }); // "origem": margem já era baixa na proposta, sem alta de custo — não fundamenta reequilíbrio
    });
  });
  return out.sort((a, b) => b.impacto - a.impacto);
}

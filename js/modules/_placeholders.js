// Módulos ainda não migrados. Cada um vira um arquivo próprio nas próximas fases
// e sai desta lista. Mantém o menu completo desde o início para a equipe
// enxergar a estrutura final.
import { icon } from "../core/ui.js";
import { esc } from "../core/utils.js";

const FASES = {
  2: "Fase 2 — Cadastros",
  3: "Fase 3 — Licitações e Propostas",
  4: "Fase 4 — Pós-licitação",
  5: "Fase 5 — Financeiro e CRM",
  6: "Fase 6 — Relatórios",
};

const lista = [
  { id: "categorias", titulo: "Categorias", grupo: "Cadastros", icone: "tag", fase: 2 },
  { id: "produtos", titulo: "Produtos", grupo: "Cadastros", icone: "box", fase: 2 },
  { id: "portais", titulo: "Portais", grupo: "Cadastros", icone: "globe", fase: 2 },
  { id: "orgaos", titulo: "Órgãos", grupo: "Cadastros", icone: "building", fase: 2 },
  { id: "licitacoes", titulo: "Licitações", grupo: "Licitações", icone: "clipboard", fase: 3 },
  { id: "propostas", titulo: "Propostas", grupo: "Licitações", icone: "file", fase: 3 },
  { id: "atas", titulo: "Gestão de ATA", grupo: "Pós-licitação", icone: "doc", fase: 4 },
  { id: "adesoes", titulo: "Adesão de ATA", grupo: "Pós-licitação", icone: "handshake", fase: 4 },
  { id: "empenhos", titulo: "Empenhos", grupo: "Pós-licitação", icone: "coins", fase: 4 },
  { id: "exequibilidade", titulo: "Exequibilidade", grupo: "Pós-licitação", icone: "scale", fase: 4 },
  { id: "reequilibrio", titulo: "Reequilíbrio", grupo: "Pós-licitação", icone: "trending", fase: 4 },
  { id: "cobrancas", titulo: "Cobrança Financeira", grupo: "Financeiro", icone: "wallet", fase: 5 },
  { id: "crm", titulo: "CRM — Cobranças", grupo: "CRM e análise", icone: "phone", fase: 5 },
  { id: "reguas", titulo: "Régua de Envio", grupo: "CRM e análise", icone: "send", fase: 5 },
  { id: "relatorios", titulo: "Relatórios", grupo: "CRM e análise", icone: "chart", fase: 6 },
  { id: "usuarios", titulo: "Usuários", grupo: "CRM e análise", icone: "users", fase: 2 },
];

export const placeholders = lista.map((m) => ({
  ...m,
  render(el) {
    el.innerHTML = `
      <div class="card"><div class="placeholder">
        ${icon(m.icone)}
        <h3>${esc(m.titulo)} chega na ${esc(FASES[m.fase])}</h3>
        <p>Enquanto isso, continue usando esta tela no sistema atual. Os dados são os mesmos — nada precisa ser copiado.</p>
      </div></div>`;
  },
}));

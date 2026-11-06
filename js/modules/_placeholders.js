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
  { id: "relatorios", titulo: "Relatórios", grupo: "CRM e análise", icone: "chart", fase: 6 },
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

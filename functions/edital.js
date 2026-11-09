// Análise de edital — regras portadas dos prompts "Leitor Objetivo de Editais RLUX" (8 perguntas)
// e "GPT 1" (extração de itens do portfólio), acrescidas dos campos que alimentam a licitação
// no sistema. A saída é estruturada (tool use), nunca texto livre.

// Famílias do portfólio e palavras-chave (padrão; o site pode mandar uma lista própria vinda de Categorias)
const FAMILIAS_PADRAO = [
  { nome: "Pilhas e baterias", termos: ["pilha", "pilhas", "bateria", "baterias", "AA", "AAA", "palito", "alcalina", "zinco", "9V", "LR20", "LR14", "LR6", "LR03", "selada", "VRLA", "12V 7Ah"] },
  { nome: "Lâmpadas", termos: ["lâmpada", "lampada", "lâmpadas", "lampadas", "LED", "bulbo", "tubular", "T8", "T5", "E27", "E14", "GU10", "MR16", "dicróica", "dicroica", "HO"] },
  { nome: "Luminárias, painéis e refletores", termos: ["refletor", "refletores", "luminária", "luminaria", "luminárias", "painel", "painéis", "paineis", "plafon", "plafond", "plafonier", "arandela", "emergência", "emergencia", "pública", "publica", "poste", "pétala", "projetor"] },
  { nome: "Bocais e soquetes", termos: ["bocal", "bocais", "soquete", "soquetes", "receptáculo", "receptaculo"] },
  { nome: "Fita isolante", termos: ["fita isolante", "fita isol"] },
  { nome: "Disjuntores, DR e DPS", termos: ["disjuntor", "disjuntores", "DR", "IDR", "diferencial residual", "DPS", "protetor de surto", "surtos", "caixa moldada", "minidisjuntor"] },
  { nome: "Fotocélulas", termos: ["fotocélula", "fotocelula", "fotocélulas", "relé fotoelétrico", "rele fotoeletrico", "fotocontrolador", "relé fotocontrolador"] },
  { nome: "Contatores", termos: ["contator", "contatores", "contatora", "minicontator", "relé térmico", "rele termico"] },
  { nome: "Plugs e tomadas industriais", termos: ["plug industrial", "tomada industrial", "conector industrial", "acoplador", "IEC60309", "IEC 60309", "Steck", "2P+T", "3P+T", "3P+N+T"] },
  { nome: "Barramentos", termos: ["barramento", "barramentos", "pente", "barra de neutro", "barra de terra", "trilho DIN", "protetor de barramento", "conector de barramento"] },
];

const NAO_LOCALIZADO = "Não localizado de forma expressa no edital/anexos disponibilizados.";

const PROMPTS_PADRAO = require("./prompts-padrao.json");
const CAUDA_ANALISE = "\n\nResponda SOMENTE chamando a ferramenta registrar_analise. Textos em português do Brasil.";
const CAUDA_CASAR = "\n\nResponda SOMENTE chamando a ferramenta registrar_correspondencia, com uma entrada para CADA item recebido, na mesma ordem.";
const LIMITE_PROMPT = 30000;
const textoPrompt = (custom, padrao) => (typeof custom === "string" && custom.trim().length > 50 ? custom.slice(0, LIMITE_PROMPT) : padrao);

// custom: texto editado em Parâmetros → Prompts da IA (opcional). Marcadores {{familias}} e {{naoLocalizado}} são substituídos.
function systemPrompt(familias, custom) {
  const lista = familias.map((f) => `- ${f.nome}: ${f.termos.join(", ")}`).join("\n");
  return textoPrompt(custom, PROMPTS_PADRAO.analise).replaceAll("{{familias}}", lista).replaceAll("{{naoLocalizado}}", NAO_LOCALIZADO) + CAUDA_ANALISE;
}

const TOOL = {
  name: "registrar_analise",
  description: "Registra a análise estruturada do edital.",
  input_schema: {
    type: "object",
    required: ["itens", "resumo", "documentacaoEspecial", "observacoes"],
    properties: {
      itens: {
        type: "array",
        items: {
          type: "object", required: ["item", "descricao", "familia"],
          properties: {
            item: { type: "string" }, lote: { type: "string" }, descricao: { type: "string" }, unidade: { type: "string" },
            quantidade: { type: "number" }, precoReferencia: { type: "number" },
            exclusivoMeEpp: { type: "string", description: "exclusivo, cota reservada, ampla ou vazio" }, marcaReferencia: { type: "string" },
            aceitaSimilar: { type: "boolean" }, familia: { type: "string" }, pagina: { type: "integer" },
          },
        },
      },
      resumo: {
        type: "object",
        required: ["orgao", "numero", "municipio", "estado", "validadeProposta", "exigeAmostra", "entrega", "garantiaContratual"],
        properties: {
          orgao: { type: "string" }, uasg: { type: "string" }, modalidade: { type: "string" }, numero: { type: "string", description: "Só o número, ex.: 009/2026" },
          municipio: { type: "string" }, estado: { type: "string", description: "UF" },
          validadeProposta: { type: "string" }, validadeBase: { type: "string", description: "cláusula e página" },
          exigeAmostra: { type: "string", description: "Sim/Não + condição" }, amostraBase: { type: "string" },
          entrega: { type: "string", description: "Cidade/UF do local de entrega" }, multiplosEnderecos: { type: "boolean" }, entregaDetalhe: { type: "string", description: "Uma frase sobre os locais, se forem vários" }, entregaBase: { type: "string" },
          garantiaContratual: { type: "string", description: "Sim/Não + percentual" }, garantiaBase: { type: "string" },
          dataSessao: { type: "string", description: "AAAA-MM-DD" }, horaSessao: { type: "string" }, srp: { type: "boolean" }, valorEstimado: { type: "string" }, criterioJulgamento: { type: "string" },
        },
      },
      documentacaoEspecial: {
        type: "array",
        items: { type: "object", required: ["documento", "fase"], properties: { documento: { type: "string" }, fase: { type: "string" }, clausula: { type: "string" }, pagina: { type: "integer" } } },
      },
      observacoes: { type: "array", items: { type: "string" }, description: "No máximo 3: ambiguidades ou conflitos entre anexos" },
    },
  },
};

// Auditoria por código: termos de família presentes no texto sem item correspondente
function auditoria(paginas, itens, familias) {
  const pend = [];
  for (const f of familias) {
    if (itens.some((i) => (i.familia || "").toLowerCase() === f.nome.toLowerCase())) continue;
    const termosLongos = f.termos.filter((t) => t.length >= 5); // evita falsos positivos (DR, AA, LED em "lido")
    for (let p = 0; p < paginas.length; p++) {
      const txt = paginas[p].toLowerCase();
      const t = termosLongos.find((x) => txt.includes(x.toLowerCase()));
      if (t) { pend.push({ familia: f.nome, termo: t, pagina: p + 1 }); break; }
    }
  }
  return pend;
}

module.exports = { FAMILIAS_PADRAO, NAO_LOCALIZADO, systemPrompt, TOOL, auditoria };

// ---------- Etapa C: correspondência item do edital → produto RLUX (papel do "GPT 2") ----------
function systemPromptCasar(regras, custom) {
  const padroes = (regras?.padroes || []).map((p) => `- [${p.familia}] ${p.regra}`).join("\n") || "- (nenhuma regra cadastrada)";
  const equiv = (regras?.equivalencias || []).map((q) => `- "${q.termoEdital}" = "${q.termoBase}"`).join("\n") || "- (nenhuma)";
  return textoPrompt(custom, PROMPTS_PADRAO.casar).replaceAll("{{padroes}}", padroes).replaceAll("{{equivalencias}}", equiv) + CAUDA_CASAR;
}
const TOOL_CASAR = {
  name: "registrar_correspondencia",
  description: "Registra, para cada item do edital, o produto RLUX escolhido (ou nenhum).",
  input_schema: {
    type: "object", required: ["itens"],
    properties: { itens: { type: "array", items: { type: "object", required: ["item", "produtoId", "confianca", "justificativa"],
      properties: { item: { type: "string", description: "número do item como recebido" }, produtoId: { type: "string", description: "id do candidato escolhido, ou vazio" }, confianca: { type: "string", enum: ["alta", "media", "baixa", "nenhuma"] }, justificativa: { type: "string" }, observacao: { type: "string", description: "conversão de embalagem ou ressalva" }, alternativas: { type: "array", items: { type: "string" }, description: "até 2 ids de outros candidatos plausíveis" } } } } },
  },
};
module.exports.systemPromptCasar = systemPromptCasar;
module.exports.TOOL_CASAR = TOOL_CASAR;

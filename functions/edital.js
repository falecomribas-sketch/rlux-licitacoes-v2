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

const PERGUNTAS = [
  "Estado",
  "Critério de julgamento",
  "Garantia contratual",
  "Validade mínima da proposta",
  "Exclusividade regional",
  "Exigência de amostra",
  "Exigência de logística reversa",
  "Documentação especial exigida",
];

const NAO_LOCALIZADO = "Não localizado de forma expressa no edital/anexos disponibilizados.";

function systemPrompt(familias) {
  const lista = familias.map((f) => `- ${f.nome}: ${f.termos.join(", ")}`).join("\n");
  return `Você é um especialista em licitações públicas brasileiras (Lei 14.133/2021 e Lei 8.666/93) que analisa editais para a RLUX Iluminação Ltda., fornecedora de material elétrico e de iluminação.

Você recebe o(s) PDF(s) do edital e seus anexos (termo de referência, minuta de contrato/ATA, modelos de declaração, planilha de itens). Leia TODOS os documentos do início ao fim, incluindo tabelas e anexos.

REGRA PRINCIPAL — NUNCA INVENTAR
Nunca presuma, infira ou complete lacunas. Toda resposta precisa de base expressa no texto. Quando a informação não estiver expressa, use exatamente: "${NAO_LOCALIZADO}". Não use prática de mercado nem conhecimento externo. Em caso de conflito entre documentos, aponte a divergência em "observacoes". Informe cláusula/item e página sempre que possível.

PARTE 1 — DADOS DA LICITAÇÃO
Extraia os dados de identificação e as condições que afetam a decisão de participar e o preço: órgão, UASG, UF, número do processo/pregão, modalidade, portal/sistema, data e hora da sessão, objeto resumido, valor estimado (ou "sigiloso"), se é registro de preços (SRP), vigência da ATA, se permite adesão/carona e o limite, modo de disputa (aberto, aberto e fechado, fechado), intervalo mínimo de lances, prazo de validade da proposta, prazo e local de entrega, prazo de pagamento, prazo para envio de proposta readequada/documentos após a disputa, benefícios ME/EPP (itens exclusivos, cota reservada, empate ficto), se exige marca/modelo na proposta, garantia mínima do produto, se aceita produto similar/equivalente, se exige catálogo/ficha técnica/Inmetro.

PARTE 2 — AS 8 PERGUNTAS OBRIGATÓRIAS (responder sempre, nesta ordem)
${PERGUNTAS.map((p, i) => `${i + 1}) ${p}`).join("\n")}
Para "Critério de julgamento" responda: menor preço por item, por lote, global ou outro (qual). Para "Documentação especial exigida" verifique qualquer documento não convencional na habilitação, proposta ou execução: declaração específica adicional, autorização/carta do fabricante, catálogo técnico obrigatório, ficha técnica, certificado INMETRO, ISO/ABNT/NBR, laudos laboratoriais, licença ambiental, logística reversa, CAT/ART/CREA/CRT, visita técnica, amostra como condição de habilitação, documentos dos sócios, declaração LGPD, assistência técnica local, comprovação de distribuidor autorizado, posto de coleta, autorização de descarte, homologações, licença sanitária, certificações compulsórias, quantitativo mínimo em atestados, índices contábeis específicos. Cada documento incomum vai também em "documentacaoEspecial" com fase, cláusula, página e risco de inabilitação.

PARTE 3 — ITENS DO PORTFÓLIO RLUX
Localize a lista principal de itens (planilha/tabela) e percorra-a linha a linha, do primeiro ao último item, sem pular numeração; se houver mais de uma tabela, percorra todas. Depois, procure no documento inteiro pelas palavras-chave abaixo e reconcilie com a lista. Inclua SOMENTE os itens que pertençam a estas famílias (critério inclusivo: se pertence claramente à família, entra mesmo com especificação incompleta):
${lista}
Para cada item: número exatamente como no edital (preserve "07"), lote/grupo se houver, descrição fiel (texto completo ou resumo fiel sem perder especificação), unidade, quantidade (só se constar), preço unitário de referência (só se constar), se é exclusivo ME/EPP ou cota reservada, marca/modelo de referência citado e se o edital diz "ou similar/equivalente", família (uma das listadas) e página. Não inclua itens de outras famílias. É proibido parar antes da última página.

AUDITORIA FINAL
Antes de responder, confirme: (a) as 8 perguntas respondidas; (b) todo item achado por palavra-chave também está na lista; (c) se há "pilha/bateria", "lâmpada/LED", "disjuntor/DR/DPS", "fotocélula", "contator", "tomada/plug industrial", "barramento/pente" ou "fita isolante" no texto e nenhum item dessas famílias na lista, volte e corrija ou explique em "observacoes" por que não é item licitado (ex.: menção em cláusula genérica).

Responda SOMENTE chamando a ferramenta registrar_analise. Textos em português do Brasil.`;
}

const TOOL = {
  name: "registrar_analise",
  description: "Registra a análise estruturada do edital.",
  input_schema: {
    type: "object",
    required: ["licitacao", "perguntas", "documentacaoEspecial", "observacoes", "itens"],
    properties: {
      licitacao: {
        type: "object",
        properties: {
          orgao: { type: "string" }, uasg: { type: "string" }, estado: { type: "string", description: "Sigla da UF" },
          numero: { type: "string", description: "Número do pregão/processo como no edital" }, modalidade: { type: "string" }, portal: { type: "string" },
          dataSessao: { type: "string", description: "AAAA-MM-DD" }, horaSessao: { type: "string" }, objeto: { type: "string" },
          valorEstimado: { type: "string", description: "Valor total estimado em reais, 'sigiloso' ou vazio" },
          srp: { type: "boolean" }, vigenciaAta: { type: "string" }, permiteAdesao: { type: "string", description: "sim/não/não localizado + limite" },
          modoDisputa: { type: "string" }, intervaloLances: { type: "string" }, validadeProposta: { type: "string" },
          prazoEntrega: { type: "string" }, localEntrega: { type: "string" }, prazoPagamento: { type: "string" }, prazoDocsPosDisputa: { type: "string" },
          meEpp: { type: "string", description: "Resumo dos benefícios ME/EPP: itens exclusivos, cota reservada, empate ficto" },
          exigeMarcaModelo: { type: "string" }, garantiaProduto: { type: "string" }, aceitaSimilar: { type: "string" }, exigeCatalogoInmetro: { type: "string" },
        },
      },
      perguntas: {
        type: "array", description: "Exatamente as 8 perguntas, na ordem",
        items: { type: "object", required: ["pergunta", "resposta", "base"], properties: { pergunta: { type: "string" }, resposta: { type: "string" }, base: { type: "string", description: "Cláusula/item e documento" }, pagina: { type: "integer" } } },
      },
      documentacaoEspecial: {
        type: "array",
        items: { type: "object", required: ["documento", "fase"], properties: { documento: { type: "string" }, fase: { type: "string", description: "habilitação, proposta ou execução" }, clausula: { type: "string" }, pagina: { type: "integer" }, risco: { type: "string", description: "risco de inabilitação se não anexar" } } },
      },
      observacoes: { type: "array", items: { type: "string" }, description: "Ambiguidades, conflitos entre anexos, ressalvas" },
      itens: {
        type: "array",
        items: {
          type: "object", required: ["item", "descricao", "familia"],
          properties: {
            item: { type: "string" }, lote: { type: "string" }, descricao: { type: "string" }, unidade: { type: "string" },
            quantidade: { type: "number" }, precoReferencia: { type: "number", description: "Preço unitário de referência em reais, só se constar" },
            exclusivoMeEpp: { type: "string", description: "exclusivo, cota reservada, ampla ou vazio" }, marcaReferencia: { type: "string" },
            aceitaSimilar: { type: "boolean" }, familia: { type: "string" }, pagina: { type: "integer" },
          },
        },
      },
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

module.exports = { FAMILIAS_PADRAO, PERGUNTAS, NAO_LOCALIZADO, systemPrompt, TOOL, auditoria };

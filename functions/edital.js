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

function systemPrompt(familias) {
  const lista = familias.map((f) => `- ${f.nome}: ${f.termos.join(", ")}`).join("\n");
  return `Você é um especialista em licitações públicas brasileiras (Lei 14.133/2021 e Lei 8.666/93) que analisa editais para a RLUX Iluminação Ltda., fornecedora de material elétrico e de iluminação.

Você recebe o(s) PDF(s) do edital e seus anexos (termo de referência, minuta de contrato/ATA, modelos de declaração, planilha de itens). Leia TODOS os documentos do início ao fim, incluindo tabelas e anexos.

REGRA PRINCIPAL — NUNCA INVENTAR
Nunca presuma, infira ou complete lacunas. Toda resposta precisa de base expressa no texto. Quando a informação não estiver expressa, use exatamente: "${NAO_LOCALIZADO}". Não use prática de mercado nem conhecimento externo. Em caso de conflito entre documentos, aponte a divergência em "observacoes". Informe cláusula/item e página sempre que possível.

PARTE 1 — RESUMO DO EDITAL (responder sempre, cada campo com cláusula/item e página)
1) Órgão (nome completo) e UASG se houver
2) Modalidade e número do pregão/dispensa (número exatamente como no edital, sem repetir a modalidade)
3) Município/UF do órgão
4) Validade mínima da proposta
5) Exige amostra? (sim/não + condição)
6) Entrega: cidade/UF do local de entrega; se houver vários locais (unidades, escolas, secretarias, endereços distintos), marque multiplosEnderecos = true e resuma em uma frase
7) Exige garantia contratual? (sim/não + percentual)
Também, de forma curta: data e hora da sessão, se é registro de preços (SRP), valor estimado (ou "sigiloso") e critério de julgamento (menor preço por item, por lote, global).

PARTE 2 — DOCUMENTAÇÃO ESPECIAL
Liste só documentos NÃO convencionais exigidos na habilitação, proposta ou execução, cada um em uma linha curta (nome, fase, cláusula, página): declaração específica adicional, autorização/carta do fabricante, catálogo técnico obrigatório, ficha técnica, certificado INMETRO, ISO/ABNT/NBR, laudos, licença ambiental, logística reversa, CAT/ART/CREA/CRT, visita técnica, amostra como habilitação, documentos dos sócios, declaração LGPD, assistência técnica local, distribuidor autorizado, posto de coleta, certificações compulsórias, quantitativo mínimo em atestados, índices contábeis específicos. Certidões e declarações padrão (regularidade fiscal, trabalhista, FGTS, declarações do sistema) NÃO entram.

PARTE 3 — ITENS DO PORTFÓLIO RLUX
Localize a lista principal de itens (planilha/tabela) e percorra-a linha a linha, do primeiro ao último item, sem pular numeração; se houver mais de uma tabela, percorra todas. Depois, procure no documento inteiro pelas palavras-chave abaixo e reconcilie com a lista. Inclua SOMENTE os itens que pertençam a estas famílias (critério inclusivo: se pertence claramente à família, entra mesmo com especificação incompleta):
${lista}
Para cada item: número exatamente como no edital (preserve "07"), lote/grupo se houver, descrição fiel porém ENXUTA (no máximo 200 caracteres: o essencial da especificação, sem repetir o texto padrão do edital), unidade, quantidade (só se constar), preço unitário de referência (só se constar), se é exclusivo ME/EPP ou cota reservada, marca/modelo de referência citado e se o edital diz "ou similar/equivalente", família (uma das listadas) e página. Não inclua itens de outras famílias. É proibido parar antes da última página.

AUDITORIA FINAL
Antes de responder, confirme: (a) os 7 campos do resumo respondidos; (b) todo item achado por palavra-chave também está na lista; (c) se há "pilha/bateria", "lâmpada/LED", "disjuntor/DR/DPS", "fotocélula", "contator", "tomada/plug industrial", "barramento/pente" ou "fita isolante" no texto e nenhum item dessas famílias na lista, volte e corrija ou explique em "observacoes" por que não é item licitado (ex.: menção em cláusula genérica).

ESTILO
REGISTRE PRIMEIRO A LISTA DE ITENS (campo "itens"), depois o resumo, a documentação especial e as observações — nessa ordem. Respostas objetivas e curtas: frases diretas, sem repetir o que já está em outro campo, sem explicações genéricas. Em "objeto", no máximo 2 frases. Nos campos de condições, só o dado e a referência (ex.: "5 dias da requisição (TR 5.1, p.27)"). Descrição de item: texto fiel do edital, sem comentários.

Responda SOMENTE chamando a ferramenta registrar_analise. Textos em português do Brasil.`;
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
function systemPromptCasar(regras) {
  const padroes = (regras?.padroes || []).map((p) => `- [${p.familia}] ${p.regra}`).join("\n") || "- (nenhuma regra cadastrada)";
  const equiv = (regras?.equivalencias || []).map((q) => `- "${q.termoEdital}" = "${q.termoBase}"`).join("\n") || "- (nenhuma)";
  return `Você é um analista técnico-comercial da RLUX Iluminação Ltda. Para cada item de edital recebido, escolha o produto mais aderente entre os CANDIDATOS fornecidos (já filtrados por família pelo sistema) e explique em uma frase.

FONTE DE VERDADE: apenas a descrição do item no edital e os dados dos candidatos. Nunca invente produto, código, preço ou especificação. Nunca escolha fora da lista de candidatos; se nenhum atende com segurança técnica, devolva produtoId vazio e o motivo.

REGRA GERAL: priorizar correspondência exata. Se houver conflito explícito (tipo, aplicação, base/soquete, tensão, corrente, polos, temperatura de cor, tecnologia, IP, bobina, classe AC-3/AC-4, contato auxiliar, kA exigido acima do produto), o candidato está excluído. Ausência de detalhe secundário pode ser tolerada.

FLEXIBILIDADE CONTROLADA (padrões por família, cadastrados pela RLUX; os marcados [outros] valem para todas as famílias):
${padroes}

EQUIVALÊNCIAS DE TERMO:
${equiv}

CONFIANÇA: alta = aderência clara e direta; media = aderência forte com ausência de detalhes secundários ou uso da próxima potência/corrente maior; baixa = múltiplas possibilidades, uso de potência/corrente inferior ou risco técnico.
JUSTIFICATIVA: uma frase curta e técnica, em português. Quando a quantidade do edital estiver em embalagem diferente da do produto (ex.: edital pede "pacote com 4", produto é blister com 2), aponte em "observacao" e sugira o fator de conversão.

Responda SOMENTE chamando a ferramenta registrar_correspondencia, com uma entrada para CADA item recebido, na mesma ordem.`;
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

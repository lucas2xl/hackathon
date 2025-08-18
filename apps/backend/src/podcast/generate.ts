import { ai, JSON_CONFIG } from "../config/gemini";
import { prisma } from "../lib/prisma";
import { audioService } from "../services/audio";
import { slackService } from "../services/slack";

export async function generateWeeklyPodcast(): Promise<string> {
  console.log("🎙️ Iniciando geração do podcast semanal...");

  try {
    // 1) Calcular período dos últimos 7 dias
    const { weekStart, weekEnd } = getLastWeekPeriod();
    console.log(
      `📅 Período (últimos 7 dias): ${weekStart.toLocaleDateString(
        "pt-BR"
      )} a ${weekEnd.toLocaleDateString("pt-BR")}`
    );

    // 2) Buscar trends da semana
    const weeklyTrends = await getWeeklyTrends(weekStart, weekEnd);
    console.log(`📊 Encontrados ${weeklyTrends.length} trends da semana`);

    if (weeklyTrends.length === 0) {
      console.log("⚠️ Nenhum trend encontrado para a semana");
      return "";
    }

    // 3) Gerar conteúdo do podcast
    const podcastContent = await generatePodcastScript(
      weeklyTrends,
      weekStart,
      weekEnd
    );

    // 4) Gerar áudio do podcast
    const audioFilename = `podcast-${weekStart.toISOString().split("T")[0]}-${
      weekEnd.toISOString().split("T")[0]
    }`;
    const audioUrl = await audioService.generateAudio(
      podcastContent,
      audioFilename
    );

    if (audioUrl) {
      console.log(`🎵 Áudio gerado: ${audioUrl}`);
    }

    // 5) Salvar no banco
    await prisma.weeklyPodcast.create({
      data: {
        weekStart,
        weekEnd,
        content: podcastContent,
        audioUrl: audioUrl,
      },
    });

    // 6) Enviar notificação para Slack
    try {
      await slackService.sendPodcastNotification(
        podcastContent,
        weekStart,
        weekEnd,
        audioUrl || undefined // Passar audioUrl se disponível
      );
      console.log("✅ Podcast enviado para Slack");
    } catch (slackError) {
      console.error("❌ Erro ao enviar para Slack:", slackError);
    }

    console.log("✅ Podcast gerado e salvo com sucesso!");
    return podcastContent;
  } catch (error) {
    console.error("❌ Erro na geração do podcast:", error);
    return "";
  }
}

function getLastWeekPeriod() {
  const now = new Date();

  // Buscar os últimos 7 dias incluindo hoje
  const weekEnd = new Date(now);
  weekEnd.setHours(23, 59, 59, 999);

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6); // 7 dias atrás
  weekStart.setHours(0, 0, 0, 0);

  return { weekStart, weekEnd };
}

async function getWeeklyTrends(weekStart: Date, weekEnd: Date) {
  return await prisma.trend.findMany({
    where: {
      createdAt: { gte: weekStart, lte: weekEnd },
      isRelevant: true,
    },
    include: { news: true },
    orderBy: [{ relevance: "desc" }, { createdAt: "desc" }],
    take: 25, // Máximo 25 trends da semana
  });
}

async function generatePodcastScript(
  trends: any[],
  weekStart: Date,
  weekEnd: Date
): Promise<string> {
  console.log("🤖 Gerando roteiro do podcast com IA...");

  const topScenarios = trends.slice(0, 15); // Top 15 para o podcast
  const weekStartStr = weekStart.toLocaleDateString("pt-BR");
  const weekEndStr = weekEnd.toLocaleDateString("pt-BR");

  // Agrupar por categoria
  const scenariosByCategory = topScenarios.reduce((acc: any, trend) => {
    const category = trend.category || "Outros";
    if (!acc[category]) acc[category] = [];
    acc[category].push(trend);
    return acc;
  }, {});

  // Formatar cenários para o prompt
  const formatScenariosForPrompt = (scenarios: any[]) => {
    return scenarios
      .map(
        (s, idx) =>
          `${idx + 1}. ${s.title || s.term} (Relevância: ${
            s.relevance || "N/A"
          }/10)
   Categoria: ${s.category || "N/A"}
   Descrição: ${s.description || "Sem descrição"}
   Notícias relacionadas: ${s.news?.length || 0}`
      )
      .join("\n\n");
  };

  const prompt = `
Crie um roteiro completo de podcast SOBRE OS PRINCIPAIS CENÁRIOS E TENDÊNCIAS ESTRATÉGICAS (baseado nos dados abaixo). NÃO inclua datas, NÃO escreva tempos de duração, NÃO use nome de apresentador, NÃO peça para assinar ou seguir. Apenas entregue o conteúdo direto, profissional e consultivo.

DADOS DA SEMANA (contexto para você, não repita como bloco literal):
${formatScenariosForPrompt(topScenarios)}

CATEGORIAS PRINCIPAIS (contexto):
${Object.entries(scenariosByCategory)
  .map(
    ([cat, scenarios]: [string, any]) => `${cat}: ${scenarios.length} cenários`
  )
  .join("\n")}

INSTRUÇÕES:
- Tom: profissional, claro, direto, com autoridade estratégica.
- Estrutura obrigatória em Markdown usando EXATAMENTE estes cabeçalhos, sem tempos entre parênteses:
  ## [ABERTURA]
  ## [CENÁRIOS PRINCIPAIS]
  (Dentro desta seção gerar de 5 a 7 blocos numerados como ### [CENÁRIO X] TÍTULO)
  ## [ANÁLISE ESTRATÉGICA]
  ## [FECHAMENTO]
- Em [ABERTURA]: contextualize brevemente o propósito do episódio sem citar datas ou "bem-vindo" pessoalizado.
- Em cada [CENÁRIO X]:
  * Contextualização objetiva
  * Impactos estratégicos
  * Oportunidades / riscos / ações práticas
  * Transição sutil para o próximo (exceto no último)
- Em [ANÁLISE ESTRATÉGICA]: conecte padrões, convergências e implicações.
- Em [FECHAMENTO]: síntese final + chamada à reflexão (SEM pedir para seguir, assinar, curtir, ou chamar o ouvinte para próximos episódios, e sem despedidas do tipo "até a próxima semana").
- NÃO incluir tempos de duração, nomes, datas, faixas de data, placeholders como [Seu Nome].
- NÃO incluir seções extras.
- NÃO gerar JSON, apenas Markdown final.

Retorne APENAS o roteiro Markdown final conforme instruções.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: JSON_CONFIG,
    });

    const podcastScript = response.text || "";
    console.log("✅ Roteiro do podcast gerado com sucesso!");
    console.log(
      "📝 Primeiros 300 caracteres:",
      podcastScript.substring(0, 300) + "..."
    );

    return podcastScript;
  } catch (error) {
    console.error("❌ Erro na geração do roteiro:", error);

    // Fallback manual
    return generateFallbackPodcast(topScenarios, weekStartStr, weekEndStr);
  }
}

function generateFallbackPodcast(
  scenarios: any[],
  weekStart: string,
  weekEnd: string
): string {
  return `
# Podcast TD Trends - Semana de ${weekStart} a ${weekEnd}

## [ABERTURA] (1 minuto)

Olá e bem-vindos ao TD Trends, seu podcast semanal de análise estratégica de tendências e cenários de negócios. Eu sou seu host e hoje vamos analisar os principais movimentos da semana que passou.

Esta semana identificamos ${
    scenarios.length
  } cenários estratégicos relevantes para o mundo dos negócios e tecnologia. Vamos mergulhar nos insights mais importantes e entender como eles podem impactar suas decisões estratégicas.

## [CENÁRIOS PRINCIPAIS] (10 minutos)

${scenarios
  .slice(0, 5)
  .map(
    (scenario, index) => `
### [CENÁRIO ${index + 1}] - ${scenario.title || scenario.term}

${scenario.description || "Análise em desenvolvimento"}

**Implicações estratégicas**: Este cenário apresenta oportunidades de ${
      scenario.category || "desenvolvimento"
    } que devem ser monitoradas pelos gestores.
`
  )
  .join("\n")}

## [ANÁLISE ESTRATÉGICA] (3 minutos)

Conectando todos esses cenários, observamos um padrão interessante de transformação digital e adaptação estratégica. As organizações que conseguirem antecipar essas tendências terão vantagens competitivas significativas.

## [FECHAMENTO] (1 minuto)

Esses foram os principais insights da semana. Continue acompanhando o TD Trends para não perder nenhuma tendência estratégica importante.

Até a próxima semana!
`;
}

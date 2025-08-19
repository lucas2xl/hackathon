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
Crie um roteiro completo de podcast EM PORTUGUÊS SOBRE OS PRINCIPAIS CENÁRIOS E TENDÊNCIAS ESTRATÉGICAS (baseado nos dados abaixo).

IMPORTANTE: O texto será convertido em áudio, então:
- NÃO use markdown (sem ##, ###, **, *, etc.)
- NÃO inclua datas, tempos de duração, nomes de apresentadores
- NÃO use símbolos como #, *, [, ], ou outros caracteres especiais
- Escreva texto corrido, fluido, como se fosse uma narração natural
- Use apenas texto simples em português brasileiro

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
- Estrutura do roteiro (SEM usar markdown):

ABERTURA:
Contextualize brevemente o propósito do episódio. Fale sobre inteligência estratégica e análise de tendências.

CENÁRIOS PRINCIPAIS:
Apresente 5 a 7 cenários mais relevantes da semana. Para cada cenário:
- Contextualização objetiva
- Impactos estratégicos
- Oportunidades, riscos e ações práticas
- Transição sutil para o próximo cenário

ANÁLISE ESTRATÉGICA:
Conecte padrões, convergências e implicações entre os cenários apresentados.

FECHAMENTO:
Síntese final com chamada à reflexão estratégica.

REGRAS IMPORTANTES:
- NÃO incluir tempos de duração, nomes, datas, faixas de data
- NÃO incluir seções extras ou markdown
- NÃO pedir para seguir, assinar, curtir
- NÃO usar despedidas como "até a próxima semana"
- Escreva como se fosse um texto corrido para ser lido em voz alta

Retorne APENAS o roteiro em texto simples, fluido e natural para narração em português.`;

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
Podcast TD Trends

ABERTURA

Olá, bem-vindos ao TD Trends, seu podcast de análise estratégica de tendências e cenários de negócios. Hoje vamos analisar os principais movimentos identificados na nossa análise semanal.

Esta semana identificamos ${
    scenarios.length
  } cenários estratégicos relevantes para o mundo dos negócios e tecnologia. Vamos mergulhar nos insights mais importantes e entender como eles podem impactar suas decisões estratégicas.

CENÁRIOS PRINCIPAIS

${scenarios
  .slice(0, 5)
  .map(
    (scenario, index) => `
CENÁRIO ${index + 1} - ${scenario.title || scenario.term}

${scenario.description || "Análise em desenvolvimento"}

Implicações estratégicas: Este cenário apresenta oportunidades de ${
      scenario.category || "desenvolvimento"
    } que devem ser monitoradas pelos gestores. As organizações que conseguirem antecipar essas movimentações terão vantagens competitivas importantes.
`
  )
  .join("\n")}

ANÁLISE ESTRATÉGICA

Conectando todos esses cenários, observamos um padrão interessante de transformação digital e adaptação estratégica. As organizações que conseguirem antecipar essas tendências terão vantagens competitivas significativas.

O momento atual exige uma abordagem proativa na identificação e interpretação de sinais de mudança. Os cenários apresentados hoje oferecem um mapa estratégico para decisões mais informadas.

FECHAMENTO

Esses foram os principais insights da nossa análise semanal. A capacidade de interpretar e agir com base nesses cenários pode ser o diferencial estratégico que sua organização precisa.

Continue desenvolvendo sua inteligência estratégica e mantendo-se atento aos movimentos do mercado.
`;
}

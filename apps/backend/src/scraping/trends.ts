import { chromium, type Locator, type Page } from "playwright";
import { ai, JSON_CONFIG } from "../config/gemini";
import { prisma } from "../lib/prisma";
import { searchNewsForScenarios } from "../services/news";
import { slackService } from "../services/slack";

interface TrendItem {
  position: number;
  term: string;
  volume: string;
}

interface SelectedTrend {
  titulo: string;
  descricao: string;
  categoria: string;
  relevancia: number;
  termo_origem: string;
}

export async function scrapeTrends(): Promise<void> {
  console.log("🚀 Iniciando scraping de trends...");

  const browser = await chromium.launch({
    headless: true,
    slowMo: 500,
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 768 },
  });

  const page: Page = await context.newPage();

  try {
    // 1) Scraping do Google Trends
    const allTrends = await scrapeGoogleTrends(page);
    console.log(`📊 Coletados ${allTrends.length} trends`);

    // 2) Análise com IA
    const relevantTrends = await analyzeWithAI(allTrends);
    console.log(`✅ IA retornou ${relevantTrends.length} trends relevantes`);

    // 3) Buscar notícias
    const newsResults = await searchNewsForTrends(relevantTrends);
    console.log(`✅ Busca de notícias concluída`);

    // 4) Salvar no banco
    await saveTrendsAndNews(relevantTrends, newsResults);
    console.log(`✅ Dados salvos no banco`);

    // 5) Enviar para Slack
    await sendToSlack(newsResults);

    console.log("✅ Scraping concluído com sucesso!");
  } catch (error) {
    console.error("❌ Erro no scraping:", error);
  } finally {
    await browser.close();
  }
}

async function scrapeGoogleTrends(page: Page): Promise<TrendItem[]> {
  await page.goto("https://trends.google.com/trending?geo=BR", {
    waitUntil: "domcontentloaded",
  });

  // Aguardar tabela
  const trendTableLocator = page.locator("#trend-table");
  await trendTableLocator.waitFor({ state: "visible", timeout: 15000 });

  // Alterar para 50 itens
  const dropdownXPath =
    '//*[@id="trend-table"]/div[2]/div/div[1]/div[2]/div/div[1]/div';
  const dropdownLocator: Locator = page.locator(`xpath=${dropdownXPath}`);

  await dropdownLocator.waitFor({ state: "visible", timeout: 15000 });
  await dropdownLocator.click();
  await page.waitForTimeout(1000);

  // Navegar para opção 50
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  // Aguardar carregamento
  const tbodyXPath = '//*[@id="trend-table"]/div[1]/table/tbody[2]';
  const tbody = page.locator(`xpath=${tbodyXPath}`);
  await tbody.waitFor({ state: "visible", timeout: 15000 });

  // Extrair dados
  return await extractAllTrends(page, tbody);
}

async function extractAllTrends(
  page: Page,
  tbody: Locator
): Promise<TrendItem[]> {
  const allTrends: TrendItem[] = [];
  const maxPages = 20; // Aumentar para coletar mais trends

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    console.log(`📄 Coletando página ${pageNum}...`);

    const rows = tbody.locator("tr");
    const rowCount = await rows.count();

    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const cells = row.locator("td");
      const cellCount = await cells.count();

      if (cellCount >= 2) {
        // A estrutura real: Célula 1 contém o termo + metadados, Célula 2 contém o volume
        const rawTerm = (await cells.nth(1).textContent()) || "";
        const rawVolume = (await cells.nth(2).textContent()) || "";

        // Extrair o termo principal (antes do primeiro número + info adicional)
        const term = rawTerm.split(/\d+[KM]?\+?\s*searches/)[0]?.trim() || "";

        // Extrair volume limpo
        const volume = rawVolume.replace(/arrow_upward.*$/i, "").trim();

        if (term && term !== "N/A" && term.length > 0) {
          allTrends.push({
            position: allTrends.length + 1,
            term,
            volume,
          });
        }
      }
    }

    // Próxima página
    if (pageNum < maxPages) {
      const nextSuccess = await goToNextPage(page, tbody);
      if (!nextSuccess) {
        console.log(`⏹️ Última página atingida: ${pageNum}`);
        break;
      }
    }
  }

  return allTrends;
}

async function goToNextPage(page: Page, tbody: Locator): Promise<boolean> {
  try {
    const nextButtonXPath =
      '//*[@id="trend-table"]/div[2]/div/div[2]/span[3]/button/div';
    const nextButton = page.locator(`xpath=${nextButtonXPath}`);

    await nextButton.waitFor({ state: "visible", timeout: 5000 });
    const buttonElement = nextButton.locator("..");
    const isDisabled = await buttonElement.isDisabled();

    if (isDisabled) return false;

    const firstRowBefore = await tbody.locator("tr").first().textContent();
    await nextButton.click();

    await page.waitForFunction(
      (beforeContent: string | null) => {
        const tbody = (globalThis as any).document?.querySelector(
          "#trend-table tbody:nth-child(2)"
        );
        if (!tbody) return false;
        const firstRow = tbody.querySelector("tr");
        return firstRow && firstRow.textContent !== beforeContent;
      },
      firstRowBefore,
      { timeout: 10000 }
    );

    await tbody.waitFor({ state: "visible", timeout: 5000 });
    return true;
  } catch (error) {
    return false;
  }
}

async function analyzeWithAI(trends: TrendItem[]): Promise<SelectedTrend[]> {
  console.log("🤖 Analisando trends com IA...");

  const trendsList = trends
    .map((item) => `${item.term} (${item.volume})`)
    .join("\n");

  console.log(
    `📊 Total de ${trends.length} trends enviados para IA para análise`
  );

  // 🆕 NOVO: Log completo da lista para debug
  console.log("📋 LISTA COMPLETA DE TRENDS PARA DEBUG:");
  console.log("=====================================");
  trends.forEach((trend, index) => {
    console.log(`${index + 1}. "${trend.term}" | Volume: ${trend.volume}`);
  });
  console.log("=====================================");

  console.log(
    `📝 Lista completa de trends (${trendsList.length} chars) enviada para IA`
  );

  const prompt = `
Analise TODOS os seguintes trending topics do Google Trends Brasil (${trends.length} trends no total) e selecione apenas os 5 tópicos mais relevantes para consultoria empresarial e estratégia de negócios:

TRENDING TOPICS COMPLETOS:
${trendsList}

INSTRUÇÕES IMPORTANTES:
- Analise TODA a lista de ${trends.length} trending topics acima
- Ignore tópicos sobre esportes, entretenimento superficial, celebridades, memes
- PRIORIZE tópicos relacionados a: tecnologia, economia, política, inovação, mercado, regulamentação, sustentabilidade, transformação digital
- Selecione APENAS os 5 tópicos mais estratégicos para negócios
- USE O TERMO EXATO DO TRENDING TOPIC como título (não crie títulos elaborados)
- Para cada tópico selecionado, analise seu impacto estratégico para negócios
- Foque em: impactos nos negócios, oportunidades, riscos, tendências de mercado
- Categorize cada cenário (Tecnologia, Economia, Social, Política, Inovação, etc.)
- Dê uma nota de relevância de 1-10 (sendo 10 = extremamente relevante para estratégia empresarial)

CRITÉRIOS DE SELEÇÃO:
✅ Relevante para negócios e estratégia
✅ Impacto no mercado brasileiro
✅ Oportunidades ou riscos empresariais
✅ Tendências tecnológicas ou econômicas
❌ Entretenimento puro
❌ Esportes (exceto se tiver impacto econômico significativo)
❌ Celebridades ou memes

FORMATO DE RESPOSTA (JSON):
[
  {
    "titulo": "termo exato do trending topic (sem elaboração)",
    "descricao": "Análise estratégica detalhada do impacto deste trending topic para empresas e consultoria",
    "categoria": "Categoria do cenário",
    "relevancia": 8,
    "termo_origem": "termo exato do trending topic"
  }
]

EXEMPLO CORRETO:
Se o trending topic for "boletim focus", o título deve ser exatamente "boletim focus", não "Análise do Boletim Focus: Implicações para o Planejamento Econômico".

Retorne APENAS o JSON válido com os 5 trending topics mais estratégicos usando os termos EXATOS.`;

  try {
    const config = {
      ...JSON_CONFIG,
      responseSchema: {
        type: "array",
        minItems: 1,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            titulo: { type: "string" },
            descricao: { type: "string" },
            categoria: { type: "string" },
            relevancia: { type: "number" },
            termo_origem: { type: "string" },
          },
          required: [
            "titulo",
            "descricao",
            "categoria",
            "relevancia",
            "termo_origem",
          ],
          additionalProperties: false,
        },
      },
    };

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config,
    });

    const selectedTrends: SelectedTrend[] = JSON.parse(response.text || "[]");
    console.log(`✅ IA selecionou ${selectedTrends.length} trends relevantes`);

    // 🆕 NOVO: Log detalhado dos cenários selecionados
    console.log("🎯 CENÁRIOS SELECIONADOS PELA IA:");
    console.log("=================================");
    selectedTrends.forEach((trend, index) => {
      console.log(`${index + 1}. TÍTULO: "${trend.titulo}"`);
      console.log(`   ORIGEM: "${trend.termo_origem}"`);
      console.log(`   CATEGORIA: ${trend.categoria}`);
      console.log(`   RELEVÂNCIA: ${trend.relevancia}/10`);
      console.log(`   DESCRIÇÃO: ${trend.descricao.substring(0, 100)}...`);
      console.log("   ---");
    });
    console.log("=================================");

    return selectedTrends;
  } catch (error) {
    console.error("❌ Erro na análise com IA:", error);
    console.log(
      "🔄 Fallback: usando todos os trends disponíveis e selecionando os 5 melhores"
    );

    // Em caso de erro, usar TODOS os trends disponíveis e selecionar os 5 melhores
    const bestTrends = trends
      .filter((trend) => trend.term && trend.term.length > 2)
      .slice(0, 20) // Pegar os top 20 para não sobrecarregar
      .map((trend, index) => ({
        titulo: trend.term, // Usar o termo exato
        descricao: `Análise estratégica do trending topic "${trend.term}" - relevante para estratégia empresarial e tendências de mercado`,
        categoria: "Tendências",
        relevancia: Math.max(8 - Math.floor(index / 4), 5), // Relevância decrescente
        termo_origem: trend.term,
      }))
      .slice(0, 5); // Selecionar apenas os 5 melhores

    return bestTrends;
  }
}

async function searchNewsForTrends(trends: SelectedTrend[]) {
  console.log("🔍 Buscando notícias para trends selecionados...");

  try {
    const scenarios = trends.map((trend) => trend.titulo);
    const allNewsData = await searchNewsForScenarios(scenarios);

    const newsResults = trends.map((trend, index) => {
      const scenarioKey = `cenario_${index + 1}`;
      const news = allNewsData[scenarioKey] || [];

      console.log(`✅ "${trend.titulo}": ${news.length} notícias`);
      return { trend, news };
    });

    const totalNews = newsResults.reduce(
      (sum, result) => sum + result.news.length,
      0
    );
    console.log(`🎯 Total: ${totalNews} notícias encontradas`);

    return newsResults;
  } catch (error) {
    console.error("❌ Erro na busca de notícias:", error);
    return trends.map((trend) => ({ trend, news: [] }));
  }
}

async function saveTrendsAndNews(trends: SelectedTrend[], newsResults: any[]) {
  console.log(`💾 Salvando ${trends.length} trends no banco...`);

  try {
    for (let i = 0; i < trends.length; i++) {
      const trend = trends[i];
      const newsData = newsResults[i]?.news;

      if (!trend) {
        console.log(`⚠️ Trend ${i + 1} está undefined, pulando...`);
        continue;
      }

      // Salvar trend
      const savedTrend = await prisma.trend.create({
        data: {
          term: trend.titulo,
          title: trend.titulo,
          description: trend.descricao,
          category: trend.categoria,
          sourceOrigin: trend.termo_origem,
          relevance: trend.relevancia,
          isRelevant: true,
          position: i + 1,
        },
      });

      console.log(
        `✅ [${i + 1}/${trends.length}] Trend salvo: ${savedTrend.id}`
      );

      // Salvar notícias (máximo 3)
      if (newsData && newsData.length > 0) {
        for (const newsItem of newsData.slice(0, 3)) {
          await prisma.news.create({
            data: {
              title: newsItem.title,
              description: newsItem.description,
              link: newsItem.link,
              publishedAt: newsItem.publishedAt
                ? new Date(newsItem.publishedAt)
                : null,
              source: newsItem.source,
              trendId: savedTrend.id,
            },
          });
        }
        console.log(
          `📰 [${i + 1}/${trends.length}] ${newsData.length} notícias salvas`
        );
      }
    }

    // Criar relatório diário
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.dailyReport.upsert({
      where: { date: today },
      update: {
        totalTrends: trends.length,
        selectedNews: newsResults.length,
      },
      create: {
        date: today,
        totalTrends: trends.length,
        selectedNews: newsResults.length,
      },
    });

    console.log("✅ Dados salvos no banco com sucesso!");
  } catch (error) {
    console.error("❌ Erro ao salvar no banco:", error);
  }
}

async function sendToSlack(newsResults: any[]) {
  try {
    const slackReports = newsResults.map((result) => ({
      trend: {
        titulo: result.trend.titulo,
        relevancia: result.trend.relevancia,
        descricao: result.trend.descricao,
        categoria: result.trend.categoria,
      },
      news: result.news,
    }));

    await slackService.sendDailyReport(slackReports);
    console.log("✅ Relatório enviado para Slack");
  } catch (slackError) {
    console.error("❌ Erro ao enviar para Slack:", slackError);
  }
}

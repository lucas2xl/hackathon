import { ai, SEARCH_TOOLS } from "../config/gemini";

export interface NewsItem {
  title: string;
  description: string;
  link: string;
  publishedAt?: string;
  source?: string;
}

// =========================
// Utilitários
// =========================

function logNewsProcessing(action: string, url: string, details?: any) {
  console.log(
    `🔗 ${action}: ${url}`,
    details ? JSON.stringify(details, null, 2) : ""
  );
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return ["http:", "https:"].includes(u.protocol);
  } catch {
    return false;
  }
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

async function resolveRedirectUrl(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.url || url;
  } catch {
    return url;
  }
}

function cleanGoogleSearchUrl(url: string): string {
  if (!url) return url;

  // Padrões de URLs de redirecionamento que precisamos processar
  const redirectPatterns = [
    /google\.com\/url\?/,
    /vertexaisearch\.cloud/,
    /grounding-api-redirect/,
    /google\.com\/search\?/,
  ];

  // Se não é uma URL de redirecionamento conhecida, retorna como está
  if (!redirectPatterns.some((pattern) => pattern.test(url))) {
    return url;
  }

  try {
    const u = new URL(url);

    // Tenta extrair a URL real dos parâmetros mais comuns
    const urlParams = ["url", "q", "link", "target", "dest", "rurl"];

    for (const param of urlParams) {
      const candidate = u.searchParams.get(param);
      if (candidate && isValidUrl(candidate)) {
        return decodeURIComponent(candidate);
      }
    }

    // Para URLs do Vertex AI Search, tenta extrair da estrutura específica
    if (
      url.includes("vertexaisearch") ||
      url.includes("grounding-api-redirect")
    ) {
      // Tenta extrair URL do final da string se houver padrão específico
      const match = url.match(/(?:url=|link=|target=)([^&]+)/);
      if (match && match[1]) {
        const decoded = decodeURIComponent(match[1]);
        if (isValidUrl(decoded)) {
          return decoded;
        }
      }
    }
  } catch (error) {
    console.warn("Erro ao processar URL de redirecionamento:", error);
  }

  return url;
}

function isRedirectUrl(url: string): boolean {
  return /google\.com\/url|vertexaisearch|grounding-api-redirect|google\.com\/search/.test(
    url
  );
}

async function validateAndCleanNews(raw: NewsItem[]): Promise<NewsItem[]> {
  const collected: NewsItem[] = [];

  console.log(`📝 Processando ${raw.length} notícias brutas...`);

  for (const n of raw) {
    if (!n || !n.title || !n.description || !n.link) {
      console.log("❌ Notícia descartada - campos obrigatórios ausentes:", {
        title: !!n?.title,
        description: !!n?.description,
        link: !!n?.link,
      });
      continue;
    }

    let link = n.link;
    logNewsProcessing("URL Original", link);

    // Se é uma URL de redirecionamento, tenta extrair a URL real
    if (isRedirectUrl(link)) {
      logNewsProcessing("URL é redirecionamento, tentando extrair", link);

      // Primeiro tenta extrair pelos parâmetros
      const cleanedLink = cleanGoogleSearchUrl(link);

      // Se conseguiu extrair uma URL diferente, usa ela
      if (cleanedLink !== link && isValidUrl(cleanedLink)) {
        logNewsProcessing("URL extraída dos parâmetros", cleanedLink);
        link = cleanedLink;
      } else {
        // Se não conseguiu extrair pelos parâmetros, tenta seguir o redirecionamento
        try {
          logNewsProcessing("Tentando seguir redirecionamento", link);
          const resolvedLink = await resolveRedirectUrl(link);
          if (resolvedLink !== link && isValidUrl(resolvedLink)) {
            logNewsProcessing(
              "URL resolvida via redirecionamento",
              resolvedLink
            );
            link = resolvedLink;
          } else {
            logNewsProcessing(
              "Redirecionamento não resolveu para URL diferente",
              resolvedLink
            );
          }
        } catch (error) {
          console.warn(
            `Erro ao resolver redirecionamento para ${link}:`,
            error
          );
        }
      }
    }

    // Validações básicas
    if (!isValidUrl(link)) {
      logNewsProcessing("URL descartada - inválida", link);
      continue;
    }

    // Remove URLs que ainda são claramente redirecionamentos do Google não resolvidos
    if (/google\.com\/(search|url)\?/.test(link)) {
      logNewsProcessing(
        "URL descartada - redirecionamento Google não resolvido",
        link
      );
      continue;
    }

    // Se ainda é um redirecionamento não resolvido do Vertex AI, tenta manter se tem conteúdo válido
    if (isRedirectUrl(link)) {
      logNewsProcessing("URL de redirecionamento mantida", link);
    }

    logNewsProcessing("URL aceita", link);
    collected.push({ ...n, link });
  }

  console.log(
    `✅ Coletadas ${collected.length} notícias válidas antes da remoção de duplicatas`
  );

  // Remove duplicatas
  const seen = new Set<string>();
  const final = collected.filter((n) => {
    const key = normalizeTitle(n.title) + "|" + extractHostname(n.link);
    if (seen.has(key)) {
      console.log(`🔄 Duplicata removida: ${n.title}`);
      return false;
    }
    seen.add(key);
    return true;
  });

  console.log(`🎯 Final: ${final.length} notícias únicas`);
  return final;
}

// =========================
// MODO BATCH (um único pedido para todos os cenários)
// =========================

function buildBatchPrompt(scenarios: string[]): string {
  const list = scenarios.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return `USE O GOOGLE SEARCH OBRIGATORIAMENTE PARA CADA TEMA.\nRetorne notícias REAIS (últimos ~45 dias, preferir últimos 30).\nNÃO invente. Se não achar nada real para um tema, deixe array vazio.\nTemas:\n${list}\n\nRegras Gerais:\n- ACEITE qualquer URL de notícia válida, incluindo redirecionamentos\n- URLs do vertexaisearch.cloud, grounding-api-redirect são VÁLIDAS - mantenha-as\n- Links de google.com/url também são válidos se contêm uma URL de destino\n- Inclua o máximo de fontes possíveis: jornais, blogs, sites especializados\n- Máx 5 itens por tema.\n- Títulos e descrições fiéis ao conteúdo encontrado.\n- Datas no formato YYYY-MM-DD quando disponíveis (ou omita publishedAt).\n- NÃO mesclar notícias de um tema em outro.\n- Se a URL for um redirecionamento, mantenha-a - o sistema irá processar depois\n\nFormato JSON ESTRITO (sem texto extra): {\n  \"cenario_1\": [{\"title\":\"...\",\"description\":\"...\",\"link\":\"https://...\",\"publishedAt\":\"YYYY-MM-DD\",\"source\":\"Fonte\"}],\n  \"cenario_2\": [...],\n  ...\n}\n`;
}

function parseBatchResponse(text: string): Record<string, any> {
  if (!text) return {};
  let cleaned = text.replace(/```json|```/g, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first !== -1 && last !== -1) cleaned = cleaned.slice(first, last + 1);
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {}
  return {};
}

/**
 * Busca notícias em paralelo para cada cenário individualmente
 * @param scenarios Lista de cenários para buscar notícias
 * @returns Objeto com notícias agrupadas por cenário
 */
export async function searchNewsParallel(
  scenarios: string[]
): Promise<Record<string, NewsItem[]>> {
  console.log(
    `🔍 (BATCH) Buscando notícias para ${scenarios.length} cenários em uma única chamada...`
  );
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const prompt = buildBatchPrompt(scenarios);
  let rawText = "";
  try {
    const resp = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      // responseMimeType NÃO suportado junto com tools → removido
      config: { tools: SEARCH_TOOLS },
    });
    rawText = resp.text || "";
    if (!rawText) {
      console.warn("⚠️ Resposta vazia do modelo (rawText vazio)");
    } else {
      console.log(`📥 Resposta bruta (${rawText.length} chars)`);
    }
  } catch (e) {
    console.error("❌ Erro na chamada batch:", e);
    // Retry sem tools como fallback mínimo (pode gerar menos qualidade)
    try {
      console.log("🔁 Retry sem tools (fallback)");
      const retryResp = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  prompt +
                  "\n(Se não conseguir usar busca, ainda retorne JSON pedido)",
              },
            ],
          },
        ],
      });
      rawText = retryResp.text || "";
    } catch (e2) {
      console.error("❌ Fallback também falhou:", e2);
      return Object.fromEntries(
        scenarios.map((_, i) => [`cenario_${i + 1}`, []])
      );
    }
  }

  const parsed = parseBatchResponse(rawText);
  const result: Record<string, NewsItem[]> = {};
  let total = 0;

  // Processa todos os cenários em paralelo
  const promises = scenarios.map(async (_, i) => {
    const key = `cenario_${i + 1}`;
    let arr: any[] = [];
    if (Array.isArray(parsed[key])) {
      arr = parsed[key];
    } else {
      // Fallback: tentar encontrar chave alternativa (ex: usando nome do cenário)
      const altKeyByIndex = Object.keys(parsed).filter((k) =>
        Array.isArray((parsed as any)[k])
      )[i];
      if (altKeyByIndex && Array.isArray((parsed as any)[altKeyByIndex])) {
        arr = (parsed as any)[altKeyByIndex];
        console.log(
          `ℹ️ Mapeando chave '${altKeyByIndex}' -> '${key}' (fallback index)`
        );
      }
    }

    const cleaned = (await validateAndCleanNews(arr as any)).slice(0, 5);
    if (cleaned.length === 0 && arr.length > 0) {
      console.log(
        `⚠️ Todos os itens descartados em ${key} (possível problema de links inválidos ou formato).`
      );
    }

    return { key, cleaned };
  });

  // Aguarda todos os processamentos
  const results = await Promise.all(promises);

  // Monta o resultado final
  results.forEach(({ key, cleaned }) => {
    total += cleaned.length;
    result[key] = cleaned;
  });
  if (total === 0) {
    console.warn(
      "⚠️ Nenhuma notícia válida retornada. Verifique se a API KEY possui acesso à ferramenta de busca e se o modelo está habilitado para tool use."
    );
    console.warn("🔎 Raw JSON recebido:", rawText.slice(0, 400));
  }
  console.log(`🎯 (BATCH) Total de notícias válidas: ${total}`);
  return result;
}

/**
 * Função utilitária para testar e debuggar o processamento de uma URL específica
 * @param url URL para testar
 * @returns Resultado do processamento com logs detalhados
 */
export async function debugUrlProcessing(url: string): Promise<{
  original: string;
  isRedirect: boolean;
  cleaned: string;
  resolved: string;
  isValid: boolean;
  finalUrl: string;
}> {
  console.log("🔍 === DEBUG URL PROCESSING ===");
  console.log("Original URL:", url);

  const isRedirect = isRedirectUrl(url);
  console.log("Is redirect URL:", isRedirect);

  let cleaned = url;
  if (isRedirect) {
    cleaned = cleanGoogleSearchUrl(url);
    console.log("Cleaned URL (from params):", cleaned);
  }

  let resolved = cleaned;
  if (isRedirect && cleaned === url) {
    try {
      resolved = await resolveRedirectUrl(url);
      console.log("Resolved URL (via HTTP):", resolved);
    } catch (error) {
      console.log("Error resolving URL:", error);
    }
  }

  const finalUrl = resolved;
  const isValid = isValidUrl(finalUrl);
  console.log("Final URL:", finalUrl);
  console.log("Is valid:", isValid);
  console.log("=================================");

  return {
    original: url,
    isRedirect,
    cleaned,
    resolved,
    isValid,
    finalUrl,
  };
}

/**
 * Busca notícias reais dos últimos 30 dias usando Google Search
 * @param scenarios Lista de cenários para buscar notícias
 * @returns Objeto com notícias agrupadas por cenário
 */
export async function searchNewsForScenarios(
  scenarios: string[]
): Promise<Record<string, NewsItem[]>> {
  console.log(
    `🔍 Iniciando busca de notícias para ${scenarios.length} cenários...`
  );

  try {
    // Tentar busca paralela primeiro (método mais eficiente)
    console.log("🚀 Busca batch única com Google Search tools...");
    const parallelResults = await searchNewsParallel(scenarios);

    const totalParallelNews = Object.values(parallelResults).reduce(
      (sum, news) => sum + news.length,
      0
    );

    return parallelResults;
  } catch (error) {
    console.error("❌ Erro na busca de notícias:", error);

    // Retorno seguro
    const emptyResult: Record<string, NewsItem[]> = {};
    scenarios.forEach((_, idx) => (emptyResult[`cenario_${idx + 1}`] = []));
    return emptyResult;
  }
}

// (Loop anterior removido a pedido do usuário; implementação agora é somente batch.)

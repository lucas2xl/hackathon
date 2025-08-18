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

function cleanGoogleSearchUrl(url: string): string {
  if (!url) return url;
  if (!/google\.com|vertexaisearch\.cloud/.test(url)) return url;
  try {
    const u = new URL(url);
    const candidate = u.searchParams.get("url") || u.searchParams.get("q");
    if (candidate && isValidUrl(candidate)) return candidate;
  } catch {
    return url;
  }
  return url;
}

// NÃO criar URL fictícia. Se não conseguimos extrair a URL real, descartamos depois.
function isRedirectGoogle(url: string): boolean {
  return /vertexaisearch|grounding-api-redirect/.test(url);
}

function validateAndCleanNews(raw: NewsItem[]): NewsItem[] {
  const collected: NewsItem[] = [];
  for (const n of raw) {
    if (!n || !n.title || !n.description || !n.link) continue;
    let link = cleanGoogleSearchUrl(n.link);
    // Se ainda é redirect do Google após tentativa de limpeza, vamos descartar depois
    if (!isValidUrl(link)) continue;
    if (/google\.com\//.test(link)) continue;
    if (isRedirectGoogle(link)) continue; // descarta redirect não resolvido
    collected.push({ ...n, link });
  }
  const seen = new Set<string>();
  return collected.filter((n) => {
    const key = normalizeTitle(n.title) + "|" + extractHostname(n.link);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// =========================
// MODO BATCH (um único pedido para todos os cenários)
// =========================

function buildBatchPrompt(scenarios: string[]): string {
  const list = scenarios.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return `USE O GOOGLE SEARCH OBRIGATORIAMENTE PARA CADA TEMA.\nRetorne notícias REAIS (últimos ~45 dias, preferir últimos 30).\nNÃO invente. Se não achar nada real para um tema, deixe array vazio.\nTemas:\n${list}\n\nRegras Gerais:\n- Qualquer domínio de notícia/artigo é aceito (evite spam / páginas de listagem genérica).\n- Não usar links google.com / vertexaisearch / grounding-api-redirect.\n- Se só encontrar redirecionamento do Google, tente buscar novamente a URL original; se falhar, omita a notícia.\n- Máx 5 itens por tema.\n- Títulos e descrições fiéis.\n- Datas no formato YYYY-MM-DD quando disponíveis (ou omita publishedAt).\n- NÃO mesclar notícias de um tema em outro.\n\nFormato JSON ESTRITO (sem texto extra): {\n  \"cenario_1\": [{\"title\":\"...\",\"description\":\"...\",\"link\":\"https://...\",\"publishedAt\":\"YYYY-MM-DD\",\"source\":\"Fonte\"}],\n  \"cenario_2\": [...],\n  ...\n}\n`;
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
  scenarios.forEach((_, i) => {
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
    const cleaned = validateAndCleanNews(arr as any).slice(0, 5);
    if (cleaned.length === 0 && arr.length > 0) {
      console.log(
        `⚠️ Todos os itens descartados em ${key} (possível problema de links inválidos ou formato).`
      );
    }
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

// Teste rápido para debuggar o processamento de URLs
// Execute com: node test-news-debug.js

const { debugUrlProcessing } = require("./apps/backend/src/services/news.ts");

async function testUrls() {
  console.log("🧪 Testando processamento de URLs...\n");

  // Exemplos de URLs que você pode ter encontrado
  const testUrls = [
    "https://vertexaisearch.cloud/grounding-api-redirect/AaVoq6KLt5n...",
    "https://google.com/url?q=https://example.com/news&sa=U",
    "https://g.co/search?q=tech+news",
    "https://www.cnn.com/2024/news-article",
    "https://vertexaisearch.cloud/some/redirect/path",
  ];

  for (const url of testUrls) {
    try {
      await debugUrlProcessing(url);
      console.log("\n---\n");
    } catch (error) {
      console.error("Erro ao testar URL:", url, error);
    }
  }
}

testUrls().catch(console.error);

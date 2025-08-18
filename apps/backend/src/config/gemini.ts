import { GoogleGenAI } from "@google/genai";

// ✅ Configuração única e centralizada do Gemini
export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
});

// Configurações padrão para JSON Mode
export const JSON_CONFIG = {
  responseMimeType: "application/json" as const,
};

// Configurações padrão para Google Search
export const SEARCH_TOOLS = [{ googleSearch: {} }];

// Configuração completa para busca + JSON
export const SEARCH_JSON_CONFIG = {
  tools: SEARCH_TOOLS,
  ...JSON_CONFIG,
};

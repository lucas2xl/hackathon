import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import fs from "fs";
import path from "path";

export class AudioService {
  private client: ElevenLabsClient;
  private audioDir: string;

  constructor() {
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      console.warn(
        "⚠️ ELEVENLABS_API_KEY não configurada - áudio não será gerado"
      );
      this.client = null as any;
    } else {
      this.client = new ElevenLabsClient({ apiKey });
    }

    // Diretório para salvar os áudios
    this.audioDir = path.join(process.cwd(), "uploads", "podcasts");
    if (!fs.existsSync(this.audioDir)) {
      fs.mkdirSync(this.audioDir, { recursive: true });
    }
  }

  /**
   * Gera áudio a partir do texto usando ElevenLabs
   */
  async generateAudio(text: string, filename: string): Promise<string | null> {
    if (!this.client) {
      console.log("⚠️ ElevenLabs não configurado - pulando geração de áudio");
      return null;
    }

    try {
      console.log("🔊 Iniciando geração de áudio...");

      // Limpar o texto JSON se necessário
      const cleanText = this.extractPodcastText(text);
      console.log(`🧹 Texto preparado para áudio (${cleanText.length} chars)`);
      if (cleanText.length === 0) {
        console.warn(
          "⚠️ Texto do roteiro vazio após extração. Usando fallback simples."
        );
        return null;
      }

      // Truncamento opcional (evitar custo alto)
      const maxChars = parseInt(
        process.env.PODCAST_AUDIO_MAX_CHARS || "8000",
        10
      );
      const finalText =
        cleanText.length > maxChars
          ? cleanText.slice(0, maxChars) + "..."
          : cleanText;
      if (finalText.length !== cleanText.length) {
        console.log(
          `✂️ Texto truncado de ${cleanText.length} para ${finalText.length} caracteres por limite configurado.`
        );
      }

      // Gerar áudio com ElevenLabs
      const response = await this.client.textToSpeech.convert(
        process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB", // Voz padrão (Adam)
        {
          text: finalText,
          modelId: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2", // Modelo que suporta português
          voiceSettings: {
            stability: 0.75,
            similarityBoost: 0.75,
            style: 0.5,
            useSpeakerBoost: true,
          },
        }
      );

      // Salvar o áudio
      const audioPath = path.join(this.audioDir, `${filename}.mp3`);

      // Converter ReadableStream para Buffer
      const chunks: Uint8Array[] = [];
      const reader = response.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const audioBuffer = Buffer.concat(chunks);
      fs.writeFileSync(audioPath, audioBuffer);

      console.log(`✅ Áudio gerado com sucesso: ${audioPath}`);

      // Retornar URL relativa para ser servida pelo backend
      return `/uploads/podcasts/${filename}.mp3`;
    } catch (error: any) {
      console.error("❌ Erro ao gerar áudio:", error);
      // Tratamento específico quota_exceeded
      const detailStatus = error?.body?.detail?.status || error?.detail?.status;
      if (detailStatus === "quota_exceeded") {
        console.warn(
          "⚠️ Quota excedida - tentando fallback com modelo mais leve e texto reduzido"
        );
        try {
          const fallbackText = this.extractPodcastText(text);
          const response = await this.client.textToSpeech.convert(
            process.env.ELEVENLABS_VOICE_ID!,
            {
              text: fallbackText,
              modelId: "eleven_turbo_v2",
              voiceSettings: {
                stability: 0.6,
                similarityBoost: 0.6,
                style: 0.3,
                useSpeakerBoost: true,
              },
            }
          );
          const audioPath = path.join(this.audioDir, `${filename}-parcial.mp3`);
          const chunks: Uint8Array[] = [];
          const reader = response.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          const audioBuffer = Buffer.concat(chunks);
          fs.writeFileSync(audioPath, audioBuffer);
          console.log("✅ Áudio parcial gerado (fallback quota)");
          return `/uploads/podcasts/${filename}-parcial.mp3`;
        } catch (fallbackErr) {
          console.error("❌ Fallback de áudio também falhou:", fallbackErr);
        }
      }
      return null;
    }
  }

  /**
   * Extrai o texto limpo do podcast, removendo JSON e formatação
   */
  private extractPodcastText(rawText: string): string {
    try {
      // Se for JSON, extrair o podcast_script
      if (rawText.trim().startsWith("{")) {
        const parsed = JSON.parse(rawText);
        // Novo formato possível: podcast_title, episode_date_range, sections[]
        if (parsed.podcast_title || parsed.sections) {
          const parts: string[] = [];
          if (parsed.podcast_title) parts.push(parsed.podcast_title);
          if (Array.isArray(parsed.sections)) {
            parsed.sections.forEach((sec: any) => {
              if (!sec) return;
              const title = sec.title || sec.name || "";
              const body = sec.script || sec.content || sec.text || "";
              if (title) parts.push(title);
              if (body) parts.push(body.trim());
              if (!body && Array.isArray(sec.points)) {
                parts.push(sec.points.map((p: any) => `${p}`).join(" "));
              }
            });
          }
          return this.cleanMarkdownForAudio(parts.join(" ").trim());
        }
        const script = parsed.podcast_script;
        if (typeof script === "string")
          return this.cleanMarkdownForAudio(script);
        if (Array.isArray(script)) {
          const parts: string[] = [];
          script.forEach((sec: any) => {
            if (!sec) return;
            const title = sec.section || sec.title || "";
            const body = sec.content || sec.script || sec.text || "";
            if (title) parts.push(title);
            if (body) parts.push(body.trim());
            else if (Array.isArray(sec.points)) {
              parts.push(sec.points.map((p: any) => `${p}`).join(" "));
            }
          });
          return this.cleanMarkdownForAudio(parts.join(" ").trim());
        }
        if (script && typeof script === "object") {
          try {
            const parts: string[] = [];
            if (script.title) parts.push(script.title);
            const sections = script.sections || script.capitulos || [];
            if (Array.isArray(sections)) {
              sections.forEach((sec: any) => {
                if (!sec) return;
                const name = sec.name || sec.titulo || "";
                if (name) parts.push(name);

                // Tentar extrair conteúdo textual
                const possibleTextFields = [
                  "content",
                  "texto",
                  "body",
                  "resumo",
                  "narration",
                  "script",
                ];
                let body = "";
                for (const f of possibleTextFields) {
                  if (sec[f] && typeof sec[f] === "string") {
                    body = sec[f];
                    break;
                  }
                }
                // Se houver bullets / points
                if (!body && Array.isArray(sec.points)) {
                  body = sec.points.map((p: any) => `${p}`).join(" ");
                }
                if (!body && Array.isArray(sec.topics)) {
                  body = sec.topics.map((p: any) => `${p}`).join(" ");
                }
                if (body) parts.push(body.trim());
              });
            }
            return this.cleanMarkdownForAudio(parts.join(" ").trim());
          } catch (e) {
            return this.cleanMarkdownForAudio(rawText);
          }
        }
        return this.cleanMarkdownForAudio(rawText);
      }

      // Se não for JSON, limpar markdown diretamente
      return this.cleanMarkdownForAudio(rawText);
    } catch {
      // Se não for JSON válido, limpar markdown e retornar
      return this.cleanMarkdownForAudio(rawText);
    }
  }

  /**
   * Remove markdown e formatação para deixar texto limpo para áudio
   */
  private cleanMarkdownForAudio(text: string): string {
    let cleaned = text;

    // Remove marcações de markdown
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, ""); // Remove ## ### etc
    cleaned = cleaned.replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1"); // Remove **bold** e *italic*
    cleaned = cleaned.replace(/`([^`]+)`/g, "$1"); // Remove `code`
    cleaned = cleaned.replace(/\[([^\]]+)\]/g, "$1"); // Remove [texto] mantendo só o texto
    cleaned = cleaned.replace(/^\s*[-*+]\s+/gm, ""); // Remove bullets - * +
    cleaned = cleaned.replace(/^\s*\d+\.\s+/gm, ""); // Remove numeração 1. 2. etc

    // Remove formatações especiais
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, "$1"); // **texto**
    cleaned = cleaned.replace(/\*([^*]+)\*/g, "$1"); // *texto*
    cleaned = cleaned.replace(/_([^_]+)_/g, "$1"); // _texto_

    // Remove quebras de linha extras e espaços
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n"); // Max 2 quebras seguidas
    cleaned = cleaned.replace(/\s{2,}/g, " "); // Max 1 espaço seguido

    // Remove caracteres especiais problemáticos para TTS
    cleaned = cleaned.replace(/[#*`_~\[\]]/g, ""); // Remove #, *, `, _, ~, [, ]
    cleaned = cleaned.replace(/^\s*[-=]{3,}\s*$/gm, ""); // Remove linhas separadoras

    // Limpa espaços no início e fim de linhas
    cleaned = cleaned
      .split("\n")
      .map((line) => line.trim())
      .join("\n");

    // Remove linhas vazias extras
    cleaned = cleaned.replace(/\n\s*\n\s*\n/g, "\n\n");

    return cleaned.trim();
  }

  /**
   * Lista vozes disponíveis (útil para configuração)
   */
  async listVoices(): Promise<any[]> {
    if (!this.client) {
      return [];
    }

    try {
      const response = await this.client.voices.getAll();
      return response.voices || [];
    } catch (error) {
      console.error("❌ Erro ao listar vozes:", error);
      return [];
    }
  }
}

export const audioService = new AudioService();

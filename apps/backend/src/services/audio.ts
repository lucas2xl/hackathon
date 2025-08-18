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
          const fallbackText = this.extractPodcastText(text).slice(0, 2500);
          const response = await this.client.textToSpeech.convert(
            process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB",
            {
              text: fallbackText,
              modelId: "eleven_turbo_v2", // modelo potencialmente mais barato
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
          if (parsed.podcast_title) parts.push(`# ${parsed.podcast_title}`);
          if (parsed.episode_date_range)
            parts.push(`Período: ${parsed.episode_date_range}`);
          if (Array.isArray(parsed.sections)) {
            parsed.sections.forEach((sec: any, idx: number) => {
              if (!sec) return;
              const title = sec.title || sec.name || `Seção ${idx + 1}`;
              const time =
                sec.time_estimate || sec.time_approx || sec.tempo || "";
              const body = sec.script || sec.content || sec.text || "";
              parts.push(`\n[${title}]${time ? ` (${time})` : ""}`);
              if (body) parts.push(body.trim());
              if (!body && Array.isArray(sec.points)) {
                parts.push(sec.points.map((p: any) => `• ${p}`).join("\n"));
              }
            });
          }
          return parts.join("\n").trim();
        }
        const script = parsed.podcast_script;
        if (typeof script === "string") return script;
        if (Array.isArray(script)) {
          const parts: string[] = [];
          script.forEach((sec: any, idx: number) => {
            if (!sec) return;
            const title = sec.section || sec.title || `Seção ${idx + 1}`;
            const time =
              sec.time_approx || sec.time_estimate || sec.tempo || "";
            const body = sec.content || sec.script || sec.text || "";
            parts.push(`\n[${title}]${time ? ` (${time})` : ""}`);
            if (body) parts.push(body.trim());
            else if (Array.isArray(sec.points)) {
              parts.push(sec.points.map((p: any) => `• ${p}`).join("\n"));
            }
          });
          const combined = parts.join("\n").trim();
          if (combined.length > 0) return combined;
        }
        if (script && typeof script === "object") {
          try {
            const parts: string[] = [];
            if (script.title) parts.push(`# ${script.title}`);
            if (script.episode_date || script.estimated_duration) {
              parts.push(
                `Data: ${script.episode_date || ""}$${
                  script.estimated_duration
                    ? " | Duração: " + script.estimated_duration
                    : ""
                }`.replace("$|", "|")
              );
            }
            const sections = script.sections || script.capitulos || [];
            if (Array.isArray(sections)) {
              sections.forEach((sec: any, idx: number) => {
                if (!sec) return;
                const name = sec.name || sec.titulo || `Seção ${idx + 1}`;
                const time = sec.time_approx || sec.tempo || "";
                parts.push(`\n[${name}]${time ? ` (${time})` : ""}`);
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
                  body = sec.points.map((p: any) => `• ${p}`).join("\n");
                }
                if (!body && Array.isArray(sec.topics)) {
                  body = sec.topics.map((p: any) => `• ${p}`).join("\n");
                }
                if (!body && typeof sec === "object") {
                  // fallback: concatenar valores curtos
                  body = Object.entries(sec)
                    .filter(([k, v]) =>
                      ["name", "titulo", "time_approx", "tempo"].includes(k)
                        ? false
                        : typeof v === "string" && v.length < 600
                    )
                    .map(([, v]) => v)
                    .join("\n");
                }
                parts.push(body.trim());
              });
            }
            return parts.join("\n").trim();
          } catch (e) {
            return JSON.stringify(script);
          }
        }
        return rawText;
      }

      return rawText;
    } catch {
      // Se não for JSON válido, retornar como está
      return rawText;
    }
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

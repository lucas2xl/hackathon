import { WebClient } from "@slack/web-api";
import fs from "fs";
import path from "path";

interface NewsReport {
  trend: {
    titulo: string;
    relevancia: number;
    descricao: string;
    categoria?: string;
  };
  news: Array<{
    title: string;
    description: string;
    link: string;
    publishedAt?: string;
    source?: string;
  }>;
}

class SlackService {
  private client: WebClient;
  private channelId: string;

  constructor() {
    const token = process.env.SLACK_BOT_TOKEN;
    this.channelId = process.env.SLACK_CHANNEL_ID || "";

    if (!token) {
      console.warn("⚠️ SLACK_BOT_TOKEN não configurado");
      this.client = new WebClient();
    } else {
      this.client = new WebClient(token);
    }
  }

  async sendDailyReport(newsReports: NewsReport[]): Promise<void> {
    if (!process.env.SLACK_BOT_TOKEN || !this.channelId) {
      console.log("⚠️ Slack não configurado, pulando envio");
      return;
    }

    try {
      console.log("📤 Enviando relatório diário para o Slack...");

      const blocks = this.buildDailyReportBlocks(newsReports);

      await this.client.chat.postMessage({
        channel: this.channelId,
        blocks,
        text: `📊 Relatório Diário TD Trends - ${new Date().toLocaleDateString(
          "pt-BR"
        )}`,
      });

      console.log("✅ Relatório enviado para o Slack com sucesso!");
    } catch (error) {
      console.error("❌ Erro ao enviar para o Slack:", error);
      throw error;
    }
  }

  async sendPodcastNotification(
    podcastContent: string,
    weekStart: Date,
    weekEnd: Date,
    audioUrl?: string
  ): Promise<void> {
    if (!process.env.SLACK_BOT_TOKEN || !this.channelId) {
      console.log("⚠️ Slack não configurado, pulando envio do podcast");
      return;
    }

    try {
      console.log("🎙️ Enviando podcast para o Slack...");

      // Se temos áudio, enviar o arquivo de áudio
      if (audioUrl) {
        await this.sendPodcastAudio(audioUrl, weekStart, weekEnd);
      } else {
        // Fallback: enviar apenas texto se não houver áudio
        await this.sendPodcastText(podcastContent, weekStart, weekEnd);
      }

      console.log("✅ Podcast enviado para o Slack com sucesso!");
    } catch (error) {
      console.error("❌ Erro ao enviar podcast para o Slack:", error);
      throw error;
    }
  }

  private async sendPodcastAudio(
    audioUrl: string,
    weekStart: Date,
    weekEnd: Date
  ): Promise<void> {
    try {
      // Construir caminho do arquivo de áudio
      const audioPath = path.join(
        process.cwd(),
        audioUrl.replace("/uploads/", "uploads/")
      );

      if (!fs.existsSync(audioPath)) {
        console.warn(
          "⚠️ Arquivo de áudio não encontrado, enviando apenas texto"
        );
        return;
      }

      // Enviar arquivo de áudio para o Slack
      const result = await this.client.files.uploadV2({
        channel_id: this.channelId,
        file: fs.createReadStream(audioPath),
        filename: `td-trends-podcast-${
          weekStart.toISOString().split("T")[0]
        }.mp3`,
        title: `🎙️ Podcast TD Trends - Semana ${weekStart.toLocaleDateString(
          "pt-BR"
        )} a ${weekEnd.toLocaleDateString("pt-BR")}`,
        initial_comment: this.buildPodcastComment(weekStart, weekEnd),
      });

      console.log("✅ Arquivo de áudio enviado:", result.file?.id);
    } catch (error) {
      console.error("❌ Erro ao enviar áudio:", error);
      throw error;
    }
  }

  private async sendPodcastText(
    podcastContent: string,
    weekStart: Date,
    weekEnd: Date
  ): Promise<void> {
    const blocks = this.buildPodcastBlocks(podcastContent, weekStart, weekEnd);

    await this.client.chat.postMessage({
      channel: this.channelId,
      blocks,
      text: `🎙️ Podcast Semanal TD Trends - Semana ${weekStart.toLocaleDateString(
        "pt-BR"
      )} a ${weekEnd.toLocaleDateString("pt-BR")}`,
    });
  }

  private buildPodcastComment(weekStart: Date, weekEnd: Date): string {
    return `🎙️ *Podcast Semanal TD Trends*

📅 *Período:* ${weekStart.toLocaleDateString(
      "pt-BR"
    )} a ${weekEnd.toLocaleDateString("pt-BR")}

🎯 *Conteúdo:* Análise estratégica das principais tendências da semana, com insights para consultoria empresarial e tomada de decisão.

🔊 *Duração estimada:* 10-15 minutos
🤖 *Gerado automaticamente* pelo TD Trends System

Aproveite o áudio e mantenha-se atualizado com as tendências que importam para o seu negócio! 🚀`;
  }

  private buildDailyReportBlocks(newsReports: NewsReport[]) {
    const today = new Date().toLocaleDateString("pt-BR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const blocks: any[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "📊 TD Trends - Relatório Diário",
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `📅 ${today} | 🔍 ${newsReports.length} cenários estratégicos relevantes`,
          },
        ],
      },
      {
        type: "divider",
      },
    ];

    // Adicionar cada trend com suas notícias
    newsReports.forEach((report, index) => {
      const { trend, news } = report;

      // Header do trend
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${index + 1}. ${trend.titulo}*\n📈 Relevância: ${
            trend.relevancia
          }/10${
            trend.categoria ? `\n🏷️ ${trend.categoria}` : ""
          }\n💡 ${trend.descricao.substring(0, 200)}${
            trend.descricao.length > 200 ? "..." : ""
          }`,
        },
      });

      // Notícias relacionadas
      if (news && news.length > 0) {
        const newsText = news
          .slice(0, 2)
          .map(
            (
              newsItem // Máximo 2 notícias por trend
            ) =>
              `• <${newsItem.link}|${
                newsItem.title
              }>\n  _${newsItem.description?.substring(0, 100)}${
                newsItem.description && newsItem.description.length > 100
                  ? "..."
                  : ""
              }_\n  📰 ${newsItem.source} ${
                newsItem.publishedAt
                  ? `• ${new Date(newsItem.publishedAt).toLocaleDateString(
                      "pt-BR"
                    )}`
                  : ""
              }`
          )
          .join("\n\n");

        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: newsText,
          },
        });
      }

      // Separador entre trends
      if (index < newsReports.length - 1) {
        blocks.push({ type: "divider" });
      }
    });

    // Footer
    blocks.push(
      { type: "divider" },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "🤖 Relatório gerado automaticamente pelo TD Trends System | Próximo relatório: amanhã às 8h",
          },
        ],
      }
    );

    return blocks;
  }

  private buildPodcastBlocks(content: string, weekStart: Date, weekEnd: Date) {
    const blocks: any[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🎙️ TD Trends - Podcast Semanal",
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `📅 Semana de ${weekStart.toLocaleDateString(
              "pt-BR"
            )} a ${weekEnd.toLocaleDateString("pt-BR")}`,
          },
        ],
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Resumo Semanal das Principais Tendências*",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            content.substring(0, 2900) +
            (content.length > 2900
              ? "...\n\n_Conteúdo completo disponível no dashboard web._"
              : ""),
        },
      },
      {
        type: "divider",
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "🤖 Podcast gerado automaticamente pelo TD Trends System | Próximo podcast: segunda-feira",
          },
        ],
      },
    ];

    return blocks;
  }

  async testConnection(): Promise<boolean> {
    if (!process.env.SLACK_BOT_TOKEN) {
      console.log("⚠️ Token do Slack não configurado");
      return false;
    }

    try {
      const result = await this.client.auth.test();
      console.log("✅ Conexão com Slack OK:", result.user);
      return true;
    } catch (error) {
      console.error("❌ Erro na conexão com Slack:", error);
      return false;
    }
  }
}

export const slackService = new SlackService();

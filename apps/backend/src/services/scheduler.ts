import * as cron from "node-cron";
import { generateWeeklyPodcast } from "../podcast/generate";
import { scrapeTrends } from "../scraping/trends";

class SchedulerService {
  private jobs: Map<string, cron.ScheduledTask> = new Map();

  start(): void {
    console.log("⏰ Iniciando agendador de tarefas...");

    // Agendar scraping diário às 8h
    this.scheduleDailyScraping();

    // Agendar podcast semanal (segunda-feira às 9h)
    this.scheduleWeeklyPodcast();

    console.log("✅ Agendador iniciado com sucesso!");
  }

  stop(): void {
    console.log("⏹️ Parando agendador de tarefas...");

    this.jobs.forEach((job, name) => {
      job.stop();
      console.log(`⏹️ Job parado: ${name}`);
    });

    this.jobs.clear();
    console.log("✅ Agendador parado!");
  }

  private scheduleDailyScraping(): void {
    // Executar todo dia às 8h (horário brasileiro)
    const dailyJob = cron.schedule(
      "0 8 * * *",
      async () => {
        console.log("🚀 Iniciando scraping diário agendado...");

        try {
          await scrapeTrends();
          console.log("✅ Scraping diário concluído com sucesso!");
        } catch (error) {
          console.error("❌ Erro no scraping diário agendado:", error);
        }
      },
      {
        scheduled: true,
        timezone: "America/Sao_Paulo",
      }
    );

    this.jobs.set("daily-scraping", dailyJob);
    console.log("📅 Scraping diário agendado para 8h (todo dia)");
  }

  private scheduleWeeklyPodcast(): void {
    // Executar toda segunda-feira às 9h (horário brasileiro)
    const weeklyJob = cron.schedule(
      "0 9 * * 1",
      async () => {
        console.log("🎙️ Iniciando geração de podcast semanal...");

        try {
          await generateWeeklyPodcast();
          console.log("✅ Podcast semanal gerado com sucesso!");
        } catch (error) {
          console.error("❌ Erro na geração do podcast semanal:", error);
        }
      },
      {
        scheduled: true,
        timezone: "America/Sao_Paulo",
      }
    );

    this.jobs.set("weekly-podcast", weeklyJob);
    console.log("📅 Podcast semanal agendado para segunda-feira às 9h");
  }

  // Métodos para execução manual (útil para testes)
  async runDailyScrapingNow(): Promise<void> {
    console.log("🚀 Executando scraping manual...");
    try {
      await scrapeTrends();
      console.log("✅ Scraping manual concluído!");
    } catch (error) {
      console.error("❌ Erro no scraping manual:", error);
      throw error;
    }
  }

  async runWeeklyPodcastNow(): Promise<void> {
    console.log("🎙️ Executando geração de podcast manual...");
    try {
      await generateWeeklyPodcast();
      console.log("✅ Podcast manual gerado!");
    } catch (error) {
      console.error("❌ Erro na geração manual do podcast:", error);
      throw error;
    }
  }

  // Método para verificar status dos jobs
  getJobsStatus(): { name: string; running: boolean; nextRun?: Date }[] {
    const status: { name: string; running: boolean; nextRun?: Date }[] = [];

    this.jobs.forEach((job, name) => {
      status.push({
        name,
        running: job.running,
      });
    });

    return status;
  }

  // Agendar execução única (útil para testes)
  scheduleOneTime(
    cronExpression: string,
    task: () => Promise<void>,
    name: string
  ): void {
    const job = cron.schedule(
      cronExpression,
      async () => {
        console.log(`🚀 Executando tarefa agendada: ${name}`);

        try {
          await task();
          console.log(`✅ Tarefa concluída: ${name}`);
        } catch (error) {
          console.error(`❌ Erro na tarefa ${name}:`, error);
        } finally {
          // Remover job após execução
          job.stop();
          this.jobs.delete(name);
        }
      },
      {
        scheduled: true,
        timezone: "America/Sao_Paulo",
      }
    );

    this.jobs.set(name, job);
    console.log(`📅 Tarefa única agendada: ${name} (${cronExpression})`);
  }
}

export const schedulerService = new SchedulerService();

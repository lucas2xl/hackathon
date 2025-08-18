import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { generateWeeklyPodcast } from "../podcast/generate";
export const podcastRouter = new Hono();

// GET /api/podcast - Listar podcasts
podcastRouter.get("/", async (c) => {
  try {
    const { page = "1", limit = "10" } = c.req.query();
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [podcasts, total] = await Promise.all([
      prisma.weeklyPodcast.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
        select: {
          id: true,
          weekStart: true,
          weekEnd: true,
          createdAt: true,
          content: true,
          audioUrl: true,
        },
      }),
      prisma.weeklyPodcast.count(),
    ]);

    return c.json({
      podcasts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Erro ao buscar podcasts:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// GET /api/podcast/latest - Último podcast
podcastRouter.get("/latest", async (c) => {
  try {
    const podcast = await prisma.weeklyPodcast.findFirst({
      orderBy: { createdAt: "desc" },
  select: { id: true, weekStart: true, weekEnd: true, createdAt: true, content: true, audioUrl: true }
    });

    if (!podcast) {
      return c.json({ error: "Nenhum podcast encontrado" }, 404);
    }

    return c.json({ podcast });
  } catch (error) {
    console.error("Erro ao buscar último podcast:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// GET /api/podcast/:id - Detalhes de um podcast
podcastRouter.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");

    const podcast = await prisma.weeklyPodcast.findUnique({
      where: { id },
  select: { id: true, weekStart: true, weekEnd: true, createdAt: true, content: true, audioUrl: true }
    });

    if (!podcast) {
      return c.json({ error: "Podcast não encontrado" }, 404);
    }

    return c.json({ podcast });
  } catch (error) {
    console.error("Erro ao buscar podcast:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// POST /api/podcast/generate - Gerar podcast da semana
podcastRouter.post("/generate", async (c) => {
  try {
    console.log("🎙️ Iniciando geração de podcast via API...");

    // Executar geração em background usando a função principal
    generateWeeklyPodcast()
      .then(() => console.log("✅ Podcast gerado com sucesso"))
      .catch((error) => console.error("❌ Erro na geração do podcast:", error));

    return c.json({
      message: "Geração de podcast iniciada em background",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Erro ao iniciar geração de podcast:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// POST /api/podcast/generate-current - Gerar podcast da semana atual
podcastRouter.post("/generate-current", async (c) => {
  try {
    console.log("🎙️ Iniciando geração de podcast da semana atual via API...");

    // Executar geração em background
    generateWeeklyPodcast()
      .then(() => console.log("✅ Podcast da semana atual gerado"))
      .catch((error) => console.error("❌ Erro na geração do podcast:", error));

    return c.json({
      message: "Geração de podcast da semana atual iniciada em background",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Erro ao iniciar geração de podcast:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// GET /api/podcast/stats - Estatísticas dos podcasts
podcastRouter.get("/stats", async (c) => {
  try {
    const [totalPodcasts, lastWeekPodcast] = await Promise.all([
      prisma.weeklyPodcast.count(),
      prisma.weeklyPodcast.findFirst({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          weekStart: true,
          weekEnd: true,
          createdAt: true,
        },
      }),
    ]);

    return c.json({
      totalPodcasts,
      lastWeekPodcast,
    });
  } catch (error) {
    console.error("Erro ao buscar estatísticas dos podcasts:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

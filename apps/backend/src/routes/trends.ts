import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { scrapeTrends } from "../scraping/trends";
export const trendsRouter = new Hono();

// GET /api/trends - Listar trends
trendsRouter.get("/", async (c) => {
  try {
    const { page = "1", limit = "20", date } = c.req.query();
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: any = { isRelevant: true };

    if (date) {
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      where.createdAt = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    const [trends, total] = await Promise.all([
      prisma.trend.findMany({
        where,
        include: {
          news: {
            take: 3,
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: [{ createdAt: "desc" }, { relevance: "desc" }],
        skip,
        take: parseInt(limit),
      }),
      prisma.trend.count({ where }),
    ]);

    return c.json({
      trends,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Erro ao buscar trends:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// GET /api/trends/stats - Estatísticas
trendsRouter.get("/stats", async (c) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayTrends, totalTrends, totalNews, recentReports] =
      await Promise.all([
        prisma.trend.count({
          where: {
            createdAt: { gte: today },
            isRelevant: true,
          },
        }),
        prisma.trend.count({
          where: { isRelevant: true },
        }),
        prisma.news.count(),
        prisma.dailyReport.findMany({
          orderBy: { date: "desc" },
          take: 7,
        }),
      ]);

    return c.json({
      todayTrends,
      totalTrends,
      totalNews,
      recentReports,
    });
  } catch (error) {
    console.error("Erro ao buscar estatísticas:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// POST /api/trends/scrape - Executar scraping manual
trendsRouter.post("/scrape", async (c) => {
  try {
    console.log("🚀 Iniciando scraping manual via API...");

    // Executar scraping em background
    scrapeTrends()
      .then(() => console.log("✅ Scraping manual concluído"))
      .catch((error) => console.error("❌ Erro no scraping manual:", error));

    return c.json({
      message: "Scraping iniciado em background",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Erro ao iniciar scraping:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// GET /api/trends/:id - Detalhes de um trend
trendsRouter.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");

    const trend = await prisma.trend.findUnique({
      where: { id },
      include: {
        news: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!trend) {
      return c.json({ error: "Trend não encontrado" }, 404);
    }

    return c.json({ trend });
  } catch (error) {
    console.error("Erro ao buscar trend:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// GET /api/trends/search/:term - Buscar trends por termo
trendsRouter.get("/search/:term", async (c) => {
  try {
    const term = c.req.param("term");

    const trends = await prisma.trend.findMany({
      where: {
        term: {
          contains: term,
          mode: "insensitive",
        },
        isRelevant: true,
      },
      include: {
        news: {
          take: 2,
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ relevance: "desc" }, { createdAt: "desc" }],
      take: 10,
    });

    return c.json({ trends });
  } catch (error) {
    console.error("Erro na busca de trends:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

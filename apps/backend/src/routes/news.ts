import { Hono } from "hono";
import { prisma } from "../lib/prisma";
export const newsRouter = new Hono();

// GET /api/news - Listar notícias
newsRouter.get("/", async (c) => {
  try {
    const { page = "1", limit = "20", trendId, date } = c.req.query();
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: any = {};

    if (trendId) {
      where.trendId = trendId;
    }

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

    const [news, total] = await Promise.all([
      prisma.news.findMany({
        where,
        include: {
          trend: {
            select: {
              id: true,
              term: true,
              relevance: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
      }),
      prisma.news.count({ where }),
    ]);

    return c.json({
      news,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Erro ao buscar notícias:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// GET /api/news/recent - Notícias mais recentes
newsRouter.get("/recent", async (c) => {
  try {
    const limit = parseInt(c.req.query("limit") || "10");

    const news = await prisma.news.findMany({
      include: {
        trend: {
          select: {
            id: true,
            term: true,
            relevance: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return c.json({ news });
  } catch (error) {
    console.error("Erro ao buscar notícias recentes:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// GET /api/news/:id - Detalhes de uma notícia
newsRouter.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");

    const news = await prisma.news.findUnique({
      where: { id },
      include: {
        trend: true,
      },
    });

    if (!news) {
      return c.json({ error: "Notícia não encontrada" }, 404);
    }

    return c.json({ news });
  } catch (error) {
    console.error("Erro ao buscar notícia:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// GET /api/news/search/:term - Buscar notícias por termo
newsRouter.get("/search/:term", async (c) => {
  try {
    const term = c.req.param("term");

    const news = await prisma.news.findMany({
      where: {
        OR: [
          {
            title: {
              contains: term,
              mode: "insensitive",
            },
          },
          {
            description: {
              contains: term,
              mode: "insensitive",
            },
          },
        ],
      },
      include: {
        trend: {
          select: {
            id: true,
            term: true,
            relevance: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return c.json({ news });
  } catch (error) {
    console.error("Erro na busca de notícias:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

// PATCH /api/news/:id/mark-sent - Marcar notícia como enviada para Slack
newsRouter.patch("/:id/mark-sent", async (c) => {
  try {
    const id = c.req.param("id");

    const news = await prisma.news.update({
      where: { id },
      data: { sentToSlack: true },
    });

    return c.json({ news });
  } catch (error) {
    console.error("Erro ao marcar notícia como enviada:", error);
    return c.json({ error: "Erro interno do servidor" }, 500);
  }
});

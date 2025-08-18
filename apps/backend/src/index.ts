import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { newsRouter } from "./routes/news";
import { podcastRouter } from "./routes/podcast";
import { trendsRouter } from "./routes/trends";
import { schedulerService } from "./services/scheduler";

const app = new Hono();

// Middlewares
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["http://localhost:3000", "http://localhost:5173"],
    credentials: true,
  })
);

// Health check
app.get("/", (c) => {
  return c.json({
    message: "TD Trends API is running!",
    timestamp: new Date().toISOString(),
  });
});

// Servir arquivos estáticos (áudios de podcast)
app.use("/uploads/*", serveStatic({ root: "./" }));

// Routes
app.route("/api/trends", trendsRouter);
app.route("/api/news", newsRouter);
app.route("/api/podcast", podcastRouter);

// Start scheduler
schedulerService.start();

const port = Number(process.env.PORT) || 3001;

console.log(`🚀 Server running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});

import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { resolve, join } from "node:path";
import { ProjectStore } from "@synapse/storage";
import { apiKeyPlugin } from "./plugins/auth.js";
import { EdgeGateway } from "./edge/gateway.js";
import { enginesRoutes } from "./routes/engines.js";
import { projectsRoutes } from "./routes/projects.js";
import { generatedRoutes } from "./routes/generated.js";
import { mcpRoutes } from "./routes/mcp.js";
import { capabilitiesRoutes } from "./routes/capabilities.js";
import { metricsRoutes } from "./routes/metrics.js";
import { edgeRoutes } from "./routes/edge.js";

const PORT = Number(process.env.PORT ?? 3000);
const PLATFORM_API_KEY = process.env.PLATFORM_API_KEY ?? "dev-key";
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "dev-encryption-key-change-me";
const DATA_DIR = process.env.DATA_DIR ?? resolve(process.cwd(), "../../data");

async function main() {
  const store = new ProjectStore(join(DATA_DIR, "synapsee.sqlite"), ENCRYPTION_KEY);
  const edge = new EdgeGateway(store);

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: ["req.headers.authorization", "password", "body.password"],
    },
  });

  // Tolerate empty bodies when clients send Content-Type: application/json (e.g. DELETE).
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body, done) => {
      try {
        const text = typeof body === "string" ? body : body.toString("utf8");
        done(null, text ? JSON.parse(text) : {});
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  await app.register(cors, {
    origin: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "X-API-Key",
      "Authorization",
      "Mcp-Session-Id",
      "Last-Event-ID",
      "Mcp-Protocol-Version",
      "Accept",
    ],
    exposedHeaders: ["Mcp-Session-Id"],
  });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  app.decorate("store", store);
  app.decorate("edge", edge);

  // Auth hook on root instance (not encapsulated) so all routes are covered.
  await app.register(apiKeyPlugin, { apiKey: PLATFORM_API_KEY });

  app.get("/health", async () => ({ ok: true }));

  await app.register(enginesRoutes);
  await app.register(projectsRoutes);
  await app.register(capabilitiesRoutes);
  await app.register(metricsRoutes);
  await app.register(generatedRoutes);
  await app.register(mcpRoutes);
  await app.register(edgeRoutes);

  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`Synapsee API on http://localhost:${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

declare module "fastify" {
  interface FastifyInstance {
    store: ProjectStore;
    edge: EdgeGateway;
  }
}

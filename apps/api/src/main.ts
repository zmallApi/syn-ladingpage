import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { resolve, join } from "node:path";
import { ProjectStore } from "@synapse/storage";
import { authPlugin } from "./plugins/auth.js";
import { EdgeGateway } from "./edge/gateway.js";
import { enginesRoutes } from "./routes/engines.js";
import { projectsRoutes } from "./routes/projects.js";
import { generatedRoutes } from "./routes/generated.js";
import { mcpRoutes } from "./routes/mcp.js";
import { capabilitiesRoutes } from "./routes/capabilities.js";
import { metricsRoutes } from "./routes/metrics.js";
import { edgeRoutes } from "./routes/edge.js";
import { knowledgeRoutes } from "./routes/knowledge.js";
import { missionsRoutes } from "./routes/missions.js";
import { authRoutes } from "./routes/auth.js";

const PORT = Number(process.env.PORT ?? 3000);
const PLATFORM_API_KEY = process.env.PLATFORM_API_KEY ?? "dev-key";
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "dev-encryption-key-change-me";
const JWT_SECRET = process.env.JWT_SECRET ?? ENCRYPTION_KEY;
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
  app.decorate("store", store);
  app.decorate("edge", edge);

  // Auth before rate-limit so keyGenerator can use req.auth when present.
  await app.register(authPlugin, {
    platformApiKey: PLATFORM_API_KEY,
    jwtSecret: JWT_SECRET,
    store,
  });

  // Admin polls project status often; 100/min by IP was choking local use.
  const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX ?? 600);
  await app.register(rateLimit, {
    max: Number.isFinite(RATE_LIMIT_MAX) && RATE_LIMIT_MAX > 0 ? RATE_LIMIT_MAX : 600,
    timeWindow: "1 minute",
    // CORS preflight + health must not burn the budget.
    allowList: (req) => {
      if (req.method === "OPTIONS") return true;
      const path = req.url.split("?")[0] ?? "";
      return path === "/health" || path === "/edge/ws" || path === "/edge/version";
    },
    keyGenerator: (req) => {
      const auth = req.auth;
      if (auth?.type === "user") return `user:${auth.userId}`;
      if (auth?.type === "tenant_key") return `tenant:${auth.tenantId}`;
      if (auth?.type === "mcp_key") return `mcp:${auth.keyId}`;
      if (auth?.type === "platform") return "platform";
      const bearer = req.headers.authorization;
      if (typeof bearer === "string" && bearer.startsWith("Bearer ")) {
        return `jwt:${bearer.slice(7, 47)}`;
      }
      const key = req.headers["x-api-key"];
      if (typeof key === "string" && key) return `key:${key.slice(0, 24)}`;
      return req.ip;
    },
  });

  app.get("/health", async () => ({ ok: true }));

  await app.register(authRoutes, { jwtSecret: JWT_SECRET });
  await app.register(enginesRoutes);
  await app.register(projectsRoutes);
  await app.register(capabilitiesRoutes);
  await app.register(metricsRoutes);
  await app.register(generatedRoutes);
  await app.register(mcpRoutes);
  await app.register(edgeRoutes);
  await app.register(knowledgeRoutes);
  await app.register(missionsRoutes);

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

import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

const plugin: FastifyPluginAsync<{ apiKey: string }> = async (app, opts) => {
  app.addHook("onRequest", async (req, reply) => {
    // Browser CORS preflight must pass without API key.
    if (req.method === "OPTIONS") return;
    const path = req.url.split("?")[0];
    if (path === "/health") return;
    // Edge agent uses Project Token over WebSocket — not the platform key.
    if (path === "/edge/ws" || path === "/edge/version") return;
    const key = req.headers["x-api-key"];
    if (key !== opts.apiKey) {
      return reply.code(401).send({ error: "API key inválida ou ausente (header X-API-Key)" });
    }
  });
};

/** Break encapsulation so the hook applies to sibling routes. */
export const apiKeyPlugin = fp(plugin, { name: "api-key-auth" });

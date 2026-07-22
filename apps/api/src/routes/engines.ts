import type { FastifyPluginAsync } from "fastify";
import { listEngines } from "@synapse/core";

export const enginesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/engines", async () => listEngines());
};

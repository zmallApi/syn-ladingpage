import type { FastifyPluginAsync } from "fastify";
import websocket from "@fastify/websocket";
import type { EdgeGateway } from "../edge/gateway.js";

const EDGE_VERSION = "0.1.0";

export const edgeRoutes: FastifyPluginAsync = async (app) => {
  await app.register(websocket);

  app.get("/edge/version", async () => ({
    version: EDGE_VERSION,
    image: "synapsee/edge:latest",
  }));

  app.get(
    "/edge/ws",
    { websocket: true },
    (socket, req) => {
      let registered = false;
      let projectId: string | null = null;

      const send = (msg: Record<string, unknown>) => {
        try {
          socket.send(JSON.stringify(msg));
        } catch {
          /* ignore */
        }
      };

      const timeout = setTimeout(() => {
        if (!registered) {
          send({ type: "error", error: "register timeout" });
          socket.close(4001, "register timeout");
        }
      }, 15_000);

      socket.on("message", (raw) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        } catch {
          send({ type: "error", error: "invalid json" });
          return;
        }

        const type = String(msg.type ?? "");

        if (!registered) {
          if (type !== "register") {
            send({ type: "error", error: "first message must be register" });
            return;
          }
          const token = String(msg.token ?? "");
          const resolved = app.store.resolveEdgeToken(token);
          if (!resolved) {
            send({ type: "error", error: "invalid token" });
            socket.close(4003, "invalid token");
            return;
          }
          const project = app.store.get(resolved.projectId);
          if (!project || project.connectionMode !== "edge") {
            send({ type: "error", error: "project not edge mode" });
            socket.close(4003, "not edge");
            return;
          }

          clearTimeout(timeout);
          registered = true;
          projectId = resolved.projectId;
          app.edge.attachSocket(projectId, socket);
          // Agent is connected; DB health comes from heartbeats (probe).
          app.store.setEdgePresence(projectId, {
            status: "pending",
            version: typeof msg.version === "string" ? msg.version : EDGE_VERSION,
            engine: typeof msg.engine === "string" ? msg.engine : project.engine,
          });
          send({
            type: "registered",
            projectId,
            cloudVersion: EDGE_VERSION,
          });
          req.log.info({ projectId }, "Edge registered");
          return;
        }

        // Heartbeats / results handled by EdgeGateway via same socket listeners.
        // Gateway already attached listeners; this handler only for pre-register.
        // After register, gateway's listener also fires — Fastify may stack handlers.
        // We forward heartbeats if gateway didn't get them (duplicate ok).
        if (type === "heartbeat" && projectId) {
          const raw = String(msg.status ?? "online");
          const status =
            raw === "error" ? "error" : raw === "offline" ? "offline" : "online";
          app.store.setEdgePresence(projectId, {
            status,
            version: typeof msg.version === "string" ? msg.version : undefined,
            engine: typeof msg.engine === "string" ? msg.engine : undefined,
            resourceCount:
              typeof msg.resourceCount === "number" ? msg.resourceCount : undefined,
          });
        }
      });

      socket.on("close", () => {
        clearTimeout(timeout);
      });
    },
  );
};

declare module "fastify" {
  interface FastifyInstance {
    edge: EdgeGateway;
  }
}

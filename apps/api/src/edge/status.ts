/** Business/ERP: WebSocket ≠ banco OK. Só online com dbOk. */
export function resolveBusinessAwareStatus(
  vertical: string | undefined,
  msg: Record<string, unknown>,
): "online" | "offline" | "error" | "pending" {
  const raw = String(msg.status ?? "online");
  let status: "online" | "offline" | "error" | "pending" =
    raw === "error"
      ? "error"
      : raw === "offline"
        ? "offline"
        : raw === "pending"
          ? "pending"
          : "online";

  if (vertical === "engineering") return status;

  // Business / ERP — agente sem DB ou probe falhou não pode ficar "online"
  if (msg.dbOk === false) return "error";
  if (String(msg.engine ?? "") === "engineering") return "error";
  if (msg.hasDb === false) return "error";
  return status;
}

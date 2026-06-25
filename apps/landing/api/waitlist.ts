import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  formatWaitlistMessage,
  sendTelegramMessage,
  validatePayload,
} from "./lib/telegram";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return res.status(500).json({ error: "Telegram não configurado no servidor" });
  }

  const payload = validatePayload(req.body);
  if (!payload) {
    return res.status(400).json({ error: "Nome e e-mail válidos são obrigatórios" });
  }

  try {
    const text = formatWaitlistMessage(payload);
    await sendTelegramMessage(text, token, chatId);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Telegram send failed:", err);
    return res.status(502).json({ error: "Não foi possível enviar a notificação" });
  }
}

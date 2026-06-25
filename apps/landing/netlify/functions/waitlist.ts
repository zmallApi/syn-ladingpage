import type { Handler } from "@netlify/functions";
import {
  formatWaitlistMessage,
  sendTelegramMessage,
  validatePayload,
} from "../../api/lib/telegram";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Método não permitido" }),
    };
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Telegram não configurado no servidor" }),
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(event.body ?? "{}");
  } catch {
    return {
      statusCode: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "JSON inválido" }),
    };
  }

  const payload = validatePayload(json);
  if (!payload) {
    return {
      statusCode: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Nome e e-mail válidos são obrigatórios" }),
    };
  }

  try {
    const text = formatWaitlistMessage(payload);
    await sendTelegramMessage(text, token, chatId);
    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error("Telegram send failed:", err);
    return {
      statusCode: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Não foi possível enviar a notificação" }),
    };
  }
};

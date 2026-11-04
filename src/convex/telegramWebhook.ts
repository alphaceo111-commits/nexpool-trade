/**
 * Telegram only accepts webhook secret tokens made of A-Z, a-z, 0-9, _ and -.
 * The configured bot token is a strong server-side secret but contains a colon,
 * so registration with it directly is rejected. Deriving a SHA-256 hex token
 * keeps the webhook protected without adding another secret to manage.
 */
export async function telegramWebhookSecret() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

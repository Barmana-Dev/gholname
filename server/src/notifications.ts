import { config } from "./config.js";
import { withSmsPaymentWarning } from "./financial-abuse.js";

export async function sendSms(
  recipient: string,
  message: string,
): Promise<void> {
  if (!config.NOTIFICATION_WEBHOOK_URL)
    throw new Error("Official notification provider is not configured");
  const response = await fetch(config.NOTIFICATION_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.NOTIFICATION_WEBHOOK_TOKEN
        ? { Authorization: `Bearer ${config.NOTIFICATION_WEBHOOK_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({
      channel: "sms",
      recipient,
      message: withSmsPaymentWarning(message),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(`Notification provider returned ${response.status}`);
}

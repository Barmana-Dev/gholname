import crypto from "node:crypto";
import { registryConnection } from "./config.js";
import { decryptField } from "./crypto.js";
import { transaction } from "./db.js";
import {
  extractRegistryTrackingId,
  integrationError,
  jsonValue,
  sha256,
} from "./registry-integration.js";

let workerRunning = false;
const maxResponseBytes = 1024 * 1024;

// MariaDB versions shipped with XAMPP before 10.6 do not support SKIP LOCKED.
// The claim transaction is intentionally kept short so a second worker waits
// only for the row claim and then receives the next available job.
export const claimJobQuery =
  "SELECT * FROM integration_jobs WHERE ((status IN ('queued','failed') AND available_at<=NOW()) OR (status='processing' AND locked_at<DATE_SUB(NOW(),INTERVAL 5 MINUTE))) AND attempts<max_attempts ORDER BY id LIMIT 1 FOR UPDATE";

async function claimJob(): Promise<any | null> {
  return transaction(async (connection) => {
    const [items] = await connection.execute<any[]>(
      claimJobQuery,
    );
    const job = items[0];
    if (!job) return null;
    await connection.execute(
      "UPDATE integration_jobs SET status='processing',attempts=attempts+1,locked_at=NOW() WHERE id=?",
      [job.id],
    );
    return { ...job, attempts: Number(job.attempts) + 1 };
  });
}

async function readResponseBody(
  response: Response,
): Promise<{ hash: string; text: string }> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxResponseBytes)
    throw new Error("REGISTRY_RESPONSE_TOO_LARGE");
  if (!response.body) return { hash: sha256(""), text: "" };
  const reader = response.body.getReader();
  const hash = crypto.createHash("sha256");
  const chunks: Buffer[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxResponseBytes) {
      await reader.cancel();
      throw new Error("REGISTRY_RESPONSE_TOO_LARGE");
    }
    const chunk = Buffer.from(value);
    chunks.push(chunk);
    hash.update(chunk);
  }
  return {
    hash: hash.digest("hex"),
    text: Buffer.concat(chunks).toString("utf8"),
  };
}

export async function processIntegrationJobs(): Promise<void> {
  if (workerRunning) return;
  workerRunning = true;
  try {
    for (let processed = 0; processed < 10; processed += 1) {
      const job = await claimJob();
      if (!job) break;
      const started = Date.now();
      let responseStatus: number | null = null;
      let responseHash: string | null = null;
      let responseContentType: string | null = null;
      let registryTrackingId: string | null = null;
      try {
        const connection = registryConnection();
        if (!connection) throw new Error("REGISTRY_CONNECTION_NOT_CONFIGURED");
        const payloadText = decryptField(job.encrypted_payload);
        if (!payloadText || sha256(payloadText) !== job.payload_sha256)
          throw new Error("REGISTRY_PAYLOAD_INTEGRITY_FAILED");
        const response = await fetch(
          new URL(
            `/services/${encodeURIComponent(job.service_code)}`,
            connection.baseUrl,
          ),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: `Bearer ${connection.token}`,
              "Idempotency-Key": job.idempotency_key,
              "X-Request-Id": job.request_id,
            },
            body: payloadText,
            signal: AbortSignal.timeout(15_000),
          },
        );
        responseStatus = response.status;
        responseContentType =
          response.headers.get("content-type")?.slice(0, 120) ?? null;
        const responseBody = await readResponseBody(response);
        responseHash = responseBody.hash;
        if (response.ok && responseBody.text) {
          try {
            registryTrackingId = extractRegistryTrackingId(
              jsonValue(responseBody.text),
            );
          } catch {
            registryTrackingId = null;
          }
        }
        if (!response.ok) throw new Error(`REGISTRY_HTTP_${response.status}`);
        await transaction(async (connection) => {
          if (registryTrackingId && job.application_id) {
            const [currentRows] = await connection.execute<any[]>(
              "SELECT registry_tracking_id registryTrackingId FROM applications WHERE id=? FOR UPDATE",
              [job.application_id],
            );
            const currentTrackingId = currentRows[0]?.registryTrackingId;
            if (currentTrackingId && currentTrackingId !== registryTrackingId)
              throw new Error("REGISTRY_TRACKING_ID_CONFLICT");
            const [conflicts] = await connection.execute<any[]>(
              "SELECT id FROM applications WHERE registry_tracking_id=? AND id<>? LIMIT 1",
              [registryTrackingId, job.application_id],
            );
            if (conflicts.length)
              throw new Error("REGISTRY_TRACKING_ID_CONFLICT");
            if (!currentTrackingId)
              await connection.execute(
                "UPDATE applications SET registry_tracking_id=? WHERE id=?",
                [registryTrackingId, job.application_id],
              );
          }
          await connection.execute(
            "UPDATE integration_jobs SET status='succeeded',completed_at=NOW(),last_error=NULL,locked_at=NULL WHERE id=?",
            [job.id],
          );
          await connection.execute(
            "UPDATE api_logs SET status_code=?,duration_ms=?,outcome='success',error_code=NULL,response_body_sha256=?,response_content_type=? WHERE request_id=?",
            [
              responseStatus,
              Date.now() - started,
              responseHash,
              responseContentType,
              job.request_id,
            ],
          );
        });
      } catch (error) {
        const failure = integrationError(error);
        const finalAttempt = job.attempts >= job.max_attempts;
        const delaySeconds = Math.min(3600, 2 ** job.attempts * 15);
        await transaction(async (connection) => {
          await connection.execute(
            "UPDATE integration_jobs SET status=?,available_at=DATE_ADD(NOW(),INTERVAL ? SECOND),last_error=?,locked_at=NULL WHERE id=?",
            [
              finalAttempt ? "dead_letter" : "failed",
              delaySeconds,
              failure.internalMessage,
              job.id,
            ],
          );
          await connection.execute(
            "UPDATE api_logs SET status_code=?,duration_ms=?,outcome=?,error_code=?,response_body_sha256=?,response_content_type=? WHERE request_id=?",
            [
              responseStatus,
              Date.now() - started,
              failure.outcome,
              failure.code,
              responseHash,
              responseContentType,
              job.request_id,
            ],
          );
          if (finalAttempt)
            await connection.execute(
              "INSERT INTO security_events (event_type,severity,details) VALUES ('integration_dead_letter','high',?)",
              [JSON.stringify({ jobId: job.id, requestId: job.request_id })],
            );
        });
      }
    }
  } finally {
    workerRunning = false;
  }
}

export function newRequestId(): string {
  return `REG-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
}

import { config } from "./config.js";
import { execute, rows } from "./db.js";

/**
 * Records the current head of the audit hash chain in audit_anchors and, when
 * AUDIT_ANCHOR_URL is configured, sends it to an independent HTTPS endpoint
 * (WORM storage, a log service, another organisation). A database
 * administrator who rewrites audit_logs and recomputes the chain cannot also
 * rewrite what was already delivered outside the database.
 */
export async function anchorAuditChain(): Promise<void> {
  const [head] = await rows<any[]>(
    "SELECT id,entry_hash FROM audit_logs ORDER BY id DESC LIMIT 1",
  );
  if (!head) return;
  const [last] = await rows<any[]>(
    "SELECT last_audit_id FROM audit_anchors ORDER BY id DESC LIMIT 1",
  );
  if (last && Number(last.last_audit_id) === Number(head.id)) return;

  let delivered = 0;
  if (config.AUDIT_ANCHOR_URL) {
    const response = await fetch(config.AUDIT_ANCHOR_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.AUDIT_ANCHOR_TOKEN
          ? { Authorization: `Bearer ${config.AUDIT_ANCHOR_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        service: "regbroker",
        lastAuditId: Number(head.id),
        entryHash: head.entry_hash,
        anchoredAt: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    delivered = response.ok ? 1 : 0;
    if (!response.ok)
      console.error(`Audit anchor endpoint answered HTTP ${response.status}`);
  }
  await execute(
    "INSERT INTO audit_anchors (last_audit_id,entry_hash,delivered_externally) VALUES (?,?,?)",
    [head.id, head.entry_hash, delivered],
  );
}

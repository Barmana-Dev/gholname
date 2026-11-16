/**
 * Re-verifies the audit hash chain:
 *   - every row's previous_hash equals the preceding row's entry_hash;
 *   - for version-2 rows, sha256(entry_payload) equals entry_hash and the
 *     payload agrees with the row's own columns (actor, action, entity, IP,
 *     user-agent, previous hash).
 * Compare the last verified hash with the latest externally delivered anchor
 * (table audit_anchors / AUDIT_ANCHOR_URL). Usage: npm run audit:verify -w server
 */
import crypto from "node:crypto";
import { db } from "../db.js";

async function main() {
  const [all] = await db.query<any[]>(
    "SELECT id,actor_id,action,entity_type,entity_id,ip_address,user_agent,previous_hash,entry_hash,entry_payload FROM audit_logs ORDER BY id",
  );
  let previous: string | null = null;
  const problems: string[] = [];
  let legacy = 0;
  for (const row of all) {
    if ((row.previous_hash ?? null) !== previous)
      problems.push(`#${row.id}: previous_hash does not match the preceding entry`);
    if (row.entry_payload) {
      if (crypto.createHash("sha256").update(row.entry_payload).digest("hex") !== row.entry_hash)
        problems.push(`#${row.id}: entry_hash does not match entry_payload`);
      const p = JSON.parse(row.entry_payload);
      const same =
        p.actor === (row.actor_id ?? null) &&
        p.action === row.action &&
        p.entityType === row.entity_type &&
        (p.entityId ?? null) === (row.entity_id ?? null) &&
        (p.ipAddress ?? null) === (row.ip_address ?? null) &&
        (p.userAgent ?? null) === (row.user_agent ?? null) &&
        (p.previousHash ?? null) === (row.previous_hash ?? null);
      if (!same) problems.push(`#${row.id}: row columns differ from the hashed payload`);
    } else legacy += 1;
    previous = row.entry_hash;
  }
  console.log(`checked ${all.length} entries (${legacy} legacy entries have only chain-link verification)`);
  console.log(`head hash: ${previous ?? "(empty)"}`);
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exitCode = 1;
  } else console.log("audit chain OK");
  await db.end();
}
void main();

import fs from "node:fs";
import os from "node:os";
import { config } from "./config.js";
import { execute, rows } from "./db.js";

let monitoringRunning = false;

export async function recordHealthSnapshot(): Promise<void> {
  if (monitoringRunning) return;
  monitoringRunning = true;
  const started = performance.now();
  try {
    await rows<any[]>("SELECT 1 connected");
    const responseTime = Math.round(performance.now() - started);
    const disk = fs.statfsSync(config.MONITOR_DISK_PATH);
    const diskFreeRatio = disk.bavail / Math.max(1, disk.blocks);
    const memoryFreeRatio = os.freemem() / Math.max(1, os.totalmem());
    const [queue] = await rows<any[]>(
      "SELECT SUM(status='dead_letter') deadLetters,SUM(status IN ('queued','failed','processing')) pending FROM integration_jobs",
    );
    const status =
      diskFreeRatio < 0.05 || Number(queue?.deadLetters ?? 0) > 0
        ? "degraded"
        : "operational";
    await execute(
      "INSERT INTO service_health (service_code,status,response_time_ms,error_rate,details) VALUES ('regbroker-api',?,?,?,?)",
      [
        status,
        responseTime,
        Number(queue?.deadLetters ?? 0) > 0 ? 1 : 0,
        JSON.stringify({
          diskFreePercent: Number((diskFreeRatio * 100).toFixed(2)),
          memoryFreePercent: Number((memoryFreeRatio * 100).toFixed(2)),
          queuePending: Number(queue?.pending ?? 0),
          deadLetters: Number(queue?.deadLetters ?? 0),
          loadAverage: os.loadavg(),
        }),
      ],
    );
    if (diskFreeRatio < 0.05)
      await execute(
        "INSERT INTO security_events (event_type,severity,details) SELECT 'disk_capacity_low','critical',? WHERE NOT EXISTS (SELECT 1 FROM security_events WHERE event_type='disk_capacity_low' AND status='open' AND created_at>=DATE_SUB(NOW(),INTERVAL 1 HOUR))",
        [JSON.stringify({ diskFreePercent: diskFreeRatio * 100 })],
      );
  } finally {
    monitoringRunning = false;
  }
}

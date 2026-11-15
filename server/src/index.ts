import { app } from "./app.js";
import { config } from "./config.js";
import { db } from "./db.js";
import { processIntegrationJobs } from "./integration-queue.js";
import { recordHealthSnapshot } from "./monitoring.js";
import { purgeExpiredSessions } from "./security.js";
import { cleanupOrphanUploads } from "./upload-security.js";
import { assertNoDefaultSeedCredentials } from "./seed-guard.js";

async function start() {
  try {
    await db.query("SELECT 1");
    await assertNoDefaultSeedCredentials();
    app.listen(config.PORT, () =>
      console.log(`RegBroker API listening on http://localhost:${config.PORT}`),
    );
    const queueTimer = setInterval(() => {
      void processIntegrationJobs().catch((error) =>
        console.error("Queue worker failed", error),
      );
    }, 10_000);
    queueTimer.unref();
    void processIntegrationJobs().catch((error) =>
      console.error("Queue worker failed", error),
    );
    const monitoringTimer = setInterval(() => {
      void recordHealthSnapshot().catch((error) =>
        console.error("Monitoring snapshot failed", error),
      );
    }, 60_000);
    monitoringTimer.unref();
    const housekeeping = () => {
      void purgeExpiredSessions().catch((error) =>
        console.error("Session cleanup failed", error),
      );
      void cleanupOrphanUploads().catch((error) =>
        console.error("Orphan upload cleanup failed", error),
      );
    };
    housekeeping();
    setInterval(housekeeping, 6 * 60 * 60 * 1000).unref();
    void recordHealthSnapshot().catch((error) =>
      console.error("Monitoring snapshot failed", error),
    );
  } catch (error) {
    if (error instanceof Error && error.name === "SeedCredentialsError") {
      console.error(error.message);
      process.exit(1);
    }
    console.error(
      "Database connection failed. Start MySQL in XAMPP and import database/schema.sql and database/seed.sql.",
      error,
    );
    process.exit(1);
  }
}
void start();

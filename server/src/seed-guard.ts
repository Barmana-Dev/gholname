import { config } from "./config.js";
import { rows } from "./db.js";

/** bcrypt hash of the shared development seed password in database/seed-dev-users.sql. */
export const SEED_PASSWORD_HASH =
  "$2b$12$XsMWKqcR3Q9W1YVCzJdyeOoPDMWAJyTf3sGGnjCxtlQeWVmrwjKX6";

export class SeedCredentialsError extends Error {
  constructor(count: number) {
    super(
      `Refusing to start in production: ${count} account(s) still use the well-known development seed password. ` +
        "Reset or delete them, or create the first admin with `npm run bootstrap:admin -w server`.",
    );
    this.name = "SeedCredentialsError";
  }
}

export async function assertNoDefaultSeedCredentials(): Promise<void> {
  const [result] = await rows<any[]>(
    "SELECT COUNT(*) count FROM users WHERE password_hash=? AND status='active'",
    [SEED_PASSWORD_HASH],
  );
  const count = Number(result?.count ?? 0);
  if (count === 0) return;
  if (config.NODE_ENV === "production") throw new SeedCredentialsError(count);
  console.warn(
    `[security] ${count} account(s) use the shared development seed password. This is only acceptable in development.`,
  );
}

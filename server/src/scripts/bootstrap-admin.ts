/**
 * Creates the first administrator for a fresh production database without
 * seed-dev-users.sql (load only seed-base.sql). The password is random, shown once, and must be changed on first
 * login. Usage:
 *   BOOTSTRAP_ADMIN_MOBILE=09xxxxxxxxx BOOTSTRAP_ADMIN_NAME="نام مدیر" \
 *     npm run bootstrap:admin -w server
 */
import bcrypt from "bcrypt";
import { db, rows } from "../db.js";
import { generateInvitePassword } from "../invite-password.js";

async function main() {
  const mobile = process.env.BOOTSTRAP_ADMIN_MOBILE ?? "";
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "مدیر سامانه";
  if (!/^09\d{9}$/.test(mobile)) {
    console.error("Set BOOTSTRAP_ADMIN_MOBILE to a valid mobile number (09xxxxxxxxx).");
    process.exit(2);
  }
  const [existing] = await rows<any[]>(
    "SELECT COUNT(*) count FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code='admin'",
  );
  if (Number(existing?.count ?? 0) > 0) {
    console.error("An administrator already exists; refusing to create another.");
    process.exit(3);
  }
  const [role] = await rows<any[]>("SELECT id FROM roles WHERE code='admin' LIMIT 1");
  if (!role) {
    console.error("Role 'admin' is missing. Load database/schema.sql and the role seed first.");
    process.exit(4);
  }
  const password = generateInvitePassword();
  await db.execute(
    "INSERT INTO users (role_id,full_name,email,mobile,password_hash,must_change_password,status) VALUES (?,?,?,?,?,1,'active')",
    [role.id, name, `${mobile}@mobile.regbroker.local`, mobile, await bcrypt.hash(password, 12)],
  );
  console.log("Administrator created. This password is shown only once:\n");
  console.log(`  mobile:   ${mobile}`);
  console.log(`  password: ${password}\n`);
  console.log("You must change it at first login, and enable two-factor authentication.");
  await db.end();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { blindIndex, encryptField } from "../crypto.js";
import { db } from "../db.js";

function jsonStorageText(value: unknown): string {
  if (typeof value !== "string") return JSON.stringify(value);
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
  } catch {
    return value;
  }
}

async function run() {
  const [users] = await db.query<any[]>(
    "SELECT id,national_id,organization_national_id FROM users",
  );
  for (const user of users) {
    const nationalId = user.national_id as string | null;
    const organizationNationalId = user.organization_national_id as
      string | null;
    await db.execute(
      "UPDATE users SET national_id=?,national_id_hash=?,organization_national_id=?,organization_national_id_hash=? WHERE id=?",
      [
        encryptField(nationalId),
        nationalId ? blindIndex(nationalId) : null,
        encryptField(organizationNationalId),
        organizationNationalId ? blindIndex(organizationNationalId) : null,
        user.id,
      ],
    );
  }

  const [parties] = await db.query<any[]>(
    "SELECT id,national_id FROM application_parties",
  );
  for (const party of parties) {
    const nationalId = party.national_id as string | null;
    await db.execute(
      "UPDATE application_parties SET national_id=?,national_id_hash=? WHERE id=?",
      [
        encryptField(nationalId),
        nationalId ? blindIndex(nationalId) : null,
        party.id,
      ],
    );
  }

  const [applications] = await db.query<any[]>(
    "SELECT id,form_data FROM applications",
  );
  for (const application of applications) {
    const raw = jsonStorageText(application.form_data);
    await db.execute("UPDATE applications SET form_data=? WHERE id=?", [
      JSON.stringify(encryptField(raw)),
      application.id,
    ]);
  }

  const [properties] = await db.query<any[]>(
    "SELECT id,address,coordinates,notes FROM properties",
  );
  for (const property of properties) {
    const coordinates = property.coordinates
      ? jsonStorageText(property.coordinates)
      : null;
    await db.execute(
      "UPDATE properties SET address=?,coordinates=?,notes=? WHERE id=?",
      [
        encryptField(property.address),
        coordinates ? JSON.stringify(encryptField(coordinates)) : null,
        encryptField(property.notes),
        property.id,
      ],
    );
  }
  await db.end();
  console.log(
    `Encrypted ${users.length} users, ${parties.length} parties, ${applications.length} applications and ${properties.length} properties.`,
  );
}

run().catch(async (error) => {
  console.error(error);
  await db.end();
  process.exitCode = 1;
});

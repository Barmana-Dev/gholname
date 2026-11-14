import { rows } from "./db.js";
import type { AuthUser } from "./types.js";

export type ArchiveAccessMode = "view" | "export";

export function ownsArchivedApplication(
  user: AuthUser,
  applicantId: number,
): boolean {
  return ["applicant", "representative"].includes(user.role) &&
    Number(applicantId) === Number(user.id);
}

export async function hasArchivedApplicationAccess(
  user: AuthUser,
  applicationId: string | number,
  applicantId: number,
  mode: ArchiveAccessMode,
): Promise<boolean> {
  if (ownsArchivedApplication(user, applicantId)) return true;
  const [grant] = await rows<any[]>(
    "SELECT id FROM archive_access_requests WHERE application_id=? AND requested_by=? AND status='approved' AND access_mode IN (?, 'export') AND valid_until>=NOW() ORDER BY id DESC LIMIT 1",
    [applicationId, user.id, mode],
  );
  return Boolean(grant);
}

export function canApproveArchiveAccess(user: AuthUser): boolean {
  return ["operations_manager", "admin"].includes(user.role) &&
    user.mfaVerified === true;
}

export function isValidArchiveGrantPeriod(
  validUntil: Date,
  now = new Date(),
): boolean {
  const maximum = new Date(now);
  maximum.setUTCDate(maximum.getUTCDate() + 366);
  return validUntil > now && validUntil <= maximum;
}

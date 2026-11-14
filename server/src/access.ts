import type { AuthRequest } from "./types.js";
import type { NextFunction, Response } from "express";

export const roleCapabilities = {
  applicant: [
    "panel.view",
    "applications.read_own",
    "applications.create",
    "complaints.manage_own",
    "support.manage_own",
    "profile.manage_own",
  ],
  representative: [
    "panel.view",
    "applications.read_own",
    "applications.create",
    "complaints.manage_own",
    "support.manage_own",
    "profile.manage_own",
  ],
  registry_expert: [
    "panel.view",
    "workspace.use",
    "applications.read_assigned",
    "documents.review",
    "reports.create",
    "support.read",
    "profile.manage_own",
  ],
  surveyor: [
    "panel.view",
    "workspace.use",
    "applications.read_assigned",
    "documents.review",
    "reports.create",
    "support.read",
    "profile.manage_own",
  ],
  support: [
    "panel.view",
    "workspace.use",
    "applications.read_supported",
    "support.manage",
    "complaints.read",
    "profile.manage_own",
  ],
  finance: [
    "panel.view",
    "workspace.use",
    "applications.read_financial",
    "payments.manage",
    "refunds.manage",
    "profile.manage_own",
  ],
  operations_manager: [
    "panel.view",
    "workspace.use",
    "applications.read_all",
    "applications.manage",
    "assignments.manage",
    "services.manage",
    "users.read",
    "payments.read",
    "support.manage",
    "complaints.manage",
    "audit.read",
    "dashboard.view",
    "management.view",
    "organization_profile.read",
    "reports.export",
    "archives.read",
    "archives.request",
    "archives.approve",
    "internal_controls.read",
    "internal_controls.manage",
    "registry.enqueue",
    "registry.read",
    "profile.manage_own",
  ],
  compliance: [
    "panel.view",
    "workspace.use",
    "applications.read_all",
    "risk.manage",
    "complaints.manage",
    "audit.read",
    "dashboard.view",
    "management.view",
    "organization_profile.read",
    "reports.export",
    "archives.read",
    "archives.request",
    "internal_controls.read",
    "internal_controls.manage",
    "registry.read",
    "profile.manage_own",
  ],
  technical: [
    "panel.view",
    "workspace.use",
    "incidents.manage",
    "monitoring.read",
    "internal_controls.read",
    "internal_controls.evidence_manage",
    "audit.read",
    "dashboard.view",
    "management.view",
    "registry.read",
    "profile.manage_own",
  ],
  admin: ["*"],
  observer: [
    "panel.view",
    "applications.read_all",
    "audit.read",
    "dashboard.view",
    "management.view",
    "organization_profile.read",
    "reports.export",
    "archives.read",
    "internal_controls.read",
    "registry.read",
    "profile.manage_own",
  ],
} as const;

export function capabilitiesForRole(
  role: keyof typeof roleCapabilities,
): string[] {
  return [...roleCapabilities[role]];
}

export function hasCapability(
  role: keyof typeof roleCapabilities,
  capability: string,
): boolean {
  if (capability === "history.delete") return false;
  const capabilities: readonly string[] = roleCapabilities[role];
  return capabilities.includes("*") || capabilities.includes(capability);
}

export function requireCapability(capability: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !hasCapability(req.user.role, capability)) {
      res
        .status(403)
        .json({ message: "سطح دسترسی شما برای این قابلیت کافی نیست." });
      return;
    }
    next();
  };
}

export const roleCapabilities: Record<string, string[]> = {
  applicant: [
    "panel.view",
    "applications.read",
    "applications.create",
    "complaints",
    "support",
    "profile",
  ],
  representative: [
    "panel.view",
    "applications.read",
    "applications.create",
    "complaints",
    "support",
    "profile",
  ],
  registry_expert: [
    "panel.view",
    "applications.read",
    "workspace",
    "support",
    "profile",
  ],
  surveyor: [
    "panel.view",
    "applications.read",
    "workspace",
    "support",
    "profile",
  ],
  support: [
    "panel.view",
    "applications.read",
    "workspace",
    "complaints",
    "support",
    "profile",
  ],
  finance: [
    "panel.view",
    "applications.read",
    "workspace",
    "profile",
  ],
  operations_manager: [
    "panel.view",
    "applications.read",
    "workspace",
    "complaints",
    "support",
    "dashboard",
    "management",
    "internal_controls",
    "organizationProfile",
    "profile",
  ],
  compliance: [
    "panel.view",
    "applications.read",
    "workspace",
    "complaints",
    "dashboard",
    "management",
    "internal_controls",
    "organizationProfile",
    "profile",
  ],
  technical: [
    "panel.view",
    "workspace",
    "dashboard",
    "management",
    "internal_controls",
    "organizationProfile",
    "profile",
  ],
  admin: ["*"],
  observer: [
    "panel.view",
    "applications.read",
    "dashboard",
    "management",
    "internal_controls",
    "profile",
  ],
};

const serverCapabilityAliases: Record<string, string[]> = {
  "panel.view": ["panel.view"],
  "applications.read": ["applications.read_"],
  "applications.create": ["applications.create"],
  workspace: ["workspace.use"],
  complaints: ["complaints."],
  support: ["support."],
  profile: ["profile.manage_own"],
  dashboard: ["dashboard.view"],
  management: ["management.view"],
  internal_controls: ["internal_controls.read"],
  organizationProfile: ["organization_profile."],
};

export function can(
  role: string | undefined,
  capability: string,
  grantedCapabilities?: string[],
): boolean {
  if (!role) return false;
  if (grantedCapabilities) {
    if (grantedCapabilities.includes("*")) return true;
    const aliases = serverCapabilityAliases[capability] ?? [capability];
    return aliases.some((alias) =>
      grantedCapabilities.some(
        (granted) => granted === alias || granted.startsWith(alias),
      ),
    );
  }
  const capabilities = roleCapabilities[role] ?? [];
  return capabilities.includes("*") || capabilities.includes(capability);
}

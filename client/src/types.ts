export interface User {
  mustChangePassword?: boolean;
  id: number;
  name: string;
  role: string;
  capabilities?: string[];
}
export interface Service {
  id: number;
  code: string;
  title: string;
  category: "legal" | "technical";
  description: string;
  requirements: string[];
  workflow?: string[];
  requirementsVersion?: string;
  feeRials: number;
  legalFeeRials: number;
  serviceFeeRials: number;
  servicePolicy?: {
    documentTypes: string[];
    requiredDocuments: string[];
  } | null;
}
export interface ApplicationItem {
  id: number;
  fileNumber: string;
  serviceTitle: string;
  applicantName: string;
  status: string;
  riskLevel: string;
  createdAt: string;
  updatedAt: string;
}
export interface DashboardData {
  counts: { totalApplications: number; completed: number; highRisk: number };
  byStatus: { status: string; count: number }[];
  complaints: { status: string; count: number }[];
  api: {
    serviceCode: string;
    requests: number;
    averageDurationMs: number;
    minimumDurationMs: number;
    maximumDurationMs: number;
    errors: number;
  }[];
  apiTrend: {
    day: string;
    requests: number;
    averageDurationMs: number;
    errors: number;
  }[];
  auditEvents: { action: string; entityType: string; createdAt: string }[];
  incidents: {
    incidentCode: string;
    serviceCode: string;
    severity: string;
    title: string;
    resolvedAt: string | null;
  }[];
  securityEvents: {
    id: number;
    eventType: string;
    severity: string;
    status: string;
    createdAt: string;
  }[];
  resources: {
    processUptimeSeconds: number;
    systemUptimeSeconds: number;
    processMemoryMb: number;
    totalMemoryMb: number;
    freeMemoryMb: number;
    cpuCount: number;
    loadAverage: number[];
    diskTotalMb: number;
    diskFreeMb: number;
    pendingJobs: number;
    deadLetterJobs: number;
    database: string;
  };
  kpis: {
    completionRate: number;
    averageFirstResponseMinutes: number;
    complaintResolutionRate: number;
    successfulPayments: number;
    archivedApplications: number;
    averageInitialReviewHours: number;
    supportQualityScore: number;
    serviceAvailabilityRate: number;
    apiSuccessRate: number;
    backupStatus: string;
  };
  sla: {
    targetPercent: number;
    periodDays: number;
    availabilityPercent: number;
    observations: number;
    degradedObservations: number;
    outageObservations: number;
    averageResponseMs: number;
    openIncidents: number;
    targetMet: boolean;
    fallbackReady: boolean;
  };
  integrations: { payment: string; registryApi: string };
}

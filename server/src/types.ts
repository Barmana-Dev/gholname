import type { Request } from "express";

export type RoleCode =
  | "applicant"
  | "representative"
  | "registry_expert"
  | "surveyor"
  | "support"
  | "finance"
  | "operations_manager"
  | "compliance"
  | "technical"
  | "admin"
  | "observer";

export interface AuthUser {
  id: number;
  role: RoleCode;
  name: string;
  mfaVerified?: boolean;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

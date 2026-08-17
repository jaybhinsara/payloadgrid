import { AuthorizationError, type SessionContext } from "@/lib/auth";

function operatorEmails() {
  const configured = process.env.PAYLOADGRID_ADMIN_EMAILS || process.env.PAYLOADGRID_OPERATOR_EMAILS || "";
  return new Set(configured.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
}

export function isPlatformOperator(email: string) {
  return operatorEmails().has(email.trim().toLowerCase());
}

export function requirePlatformOperator(context: SessionContext) {
  if (!isPlatformOperator(context.user.email)) throw new AuthorizationError("Platform operator access is required");
}

export const isPlatformAdmin = isPlatformOperator;
export function requirePlatformAdmin(context: SessionContext) {
  if (!isPlatformAdmin(context.user.email)) throw new AuthorizationError("Platform admin access is required");
}

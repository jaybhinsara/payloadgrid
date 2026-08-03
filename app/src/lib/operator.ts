import { AuthorizationError, type SessionContext } from "@/lib/auth";

function operatorEmails() {
  return new Set((process.env.PAYLOADGRID_OPERATOR_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
}

export function isPlatformOperator(email: string) {
  return operatorEmails().has(email.trim().toLowerCase());
}

export function requirePlatformOperator(context: SessionContext) {
  if (!isPlatformOperator(context.user.email)) throw new AuthorizationError("Platform operator access is required");
}

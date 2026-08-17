export function paymentsEnabled() {
  return process.env.PAYMENTS_ENABLED?.trim().toLowerCase() === "true";
}

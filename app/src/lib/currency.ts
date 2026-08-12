export const supportedCurrencies = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY", "SGD", "AED", "CHF", "NZD", "BRL"] as const;

export function currencySymbol(currency: string) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value || currency;
  } catch {
    return currency;
  }
}

export function normalizeCurrencyCode(value: unknown) {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

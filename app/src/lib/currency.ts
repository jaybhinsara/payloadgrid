export const supportedCurrencies = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY", "SGD", "AED", "CHF", "NZD", "BRL"] as const;

const currencySymbols: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", INR: "₹", CAD: "CA$", AUD: "A$", JPY: "¥",
  SGD: "S$", AED: "د.إ", CHF: "Fr", NZD: "NZ$", BRL: "R$"
};

export function currencySymbol(currency: string) {
  const code = currency.toUpperCase();
  if (currencySymbols[code]) return currencySymbols[code];
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: "symbol" })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value || code;
  } catch {
    return code;
  }
}

export function currencyLabel(currency: string) {
  const code = currency.toUpperCase();
  const symbol = currencySymbol(code);
  return symbol === code ? code : `${symbol} ${code}`;
}

export function normalizeCurrencyCode(value: unknown) {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

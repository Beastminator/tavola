const fmt = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

export function formatEuro(cents: number): string {
  return fmt.format(cents / 100);
}

/** Parses "12", "12.5", "12,50", "€ 12.50" into integer cents. Returns null if invalid. */
export function parseEuro(input: string): number | null {
  const s = input.replace(/[€\s]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

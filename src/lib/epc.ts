// EPC069-12 "GiroCode" / SEPA Credit Transfer QR payload (version 002, BIC optional).
export function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

/** ISO 13616 mod-97 check. */
export function isValidIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const digit of v) rem = (rem * 10 + Number(digit)) % 97;
  }
  return rem === 1;
}

export function epcPayload(opts: {
  name: string;
  iban: string;
  amountCents: number;
  reference?: string;
  bic?: string;
}): string {
  const amount = (opts.amountCents / 100).toFixed(2);
  return [
    "BCD",
    "002",
    "1", // UTF-8
    "SCT",
    opts.bic ?? "",
    opts.name.slice(0, 70),
    normalizeIban(opts.iban),
    `EUR${amount}`,
    "", // purpose
    "", // structured reference
    (opts.reference ?? "").slice(0, 140),
  ].join("\n");
}

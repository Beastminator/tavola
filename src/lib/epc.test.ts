import { describe, it, expect } from "vitest";
import { epcPayload, isValidIban } from "./epc";

describe("epc", () => {
  it("builds a valid BCD payload", () => {
    const p = epcPayload({
      name: "Mario Rossi",
      iban: "it60 x054 2811 1010 0000 0123 456",
      amountCents: 834,
      reference: "Tavola dinner 18/11",
    });
    expect(p.split("\n")).toEqual([
      "BCD",
      "002",
      "1",
      "SCT",
      "",
      "Mario Rossi",
      "IT60X0542811101000000123456",
      "EUR8.34",
      "",
      "",
      "Tavola dinner 18/11",
    ]);
  });
  it("validates IBAN checksums", () => {
    expect(isValidIban("IT60 X054 2811 1010 0000 0123 456")).toBe(true);
    expect(isValidIban("DE89370400440532013000")).toBe(true);
    expect(isValidIban("DE89370400440532013001")).toBe(false);
    expect(isValidIban("hello")).toBe(false);
  });
});

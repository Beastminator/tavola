import { describe, it, expect } from "vitest";
import { isLeftoverSlot, leftoverSlots } from "./leftovers";

describe("leftoverSlots", () => {
  it("starts right after the source and spans the next few days", () => {
    const slots = leftoverSlots({ date: "2026-03-28", slot: "lunch" }); // DST change weekend
    expect(slots[0]).toEqual({ date: "2026-03-28", slot: "dinner" });
    expect(slots.at(-1)).toEqual({ date: "2026-04-01", slot: "dinner" });
    expect(slots).toHaveLength(9);
  });
  it("rejects the same or earlier slots and ones too far away", () => {
    const src = { date: "2026-01-05", slot: "dinner" } as const;
    expect(isLeftoverSlot({ date: "2026-01-05", slot: "dinner" }, src)).toBe(false);
    expect(isLeftoverSlot({ date: "2026-01-05", slot: "lunch" }, src)).toBe(false);
    expect(isLeftoverSlot({ date: "2026-01-06", slot: "lunch" }, src)).toBe(true);
    expect(isLeftoverSlot({ date: "2026-01-10", slot: "lunch" }, src)).toBe(false);
  });
});

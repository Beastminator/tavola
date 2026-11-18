import { describe, expect, it } from "vitest";
import { canRate, formatScore, summarizeRatings, zorkasmLabel } from "./zorkasm";

describe("zorkasm", () => {
  it("averages to one decimal", () => {
    expect(summarizeRatings([])).toEqual({ count: 0, average: null });
    expect(summarizeRatings([{ score: 8 }, { score: 9 }, { score: 9 }])).toEqual({ count: 3, average: 8.7 });
    expect(summarizeRatings([{ score: 10 }])).toEqual({ count: 1, average: 10 });
  });

  it("formats scores", () => {
    expect(formatScore(8)).toBe("8");
    expect(formatScore(8.7)).toBe("8.7");
  });

  it("labels the top end", () => {
    expect(zorkasmLabel(10)).toMatch(/Zorkasm/);
    expect(zorkasmLabel(2)).toBe("Rough night");
  });

  it("only allows rating meals that happened", () => {
    expect(canRate({ date: "2026-11-18", status: "open" }, "2026-11-18")).toBe(true);
    expect(canRate({ date: "2026-11-19", status: "open" }, "2026-11-18")).toBe(false);
    expect(canRate({ date: "2026-11-10", status: "cancelled" }, "2026-11-18")).toBe(false);
  });
});

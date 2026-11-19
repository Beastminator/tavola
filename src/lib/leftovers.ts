import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { TZ } from "./time";

type Slot = "lunch" | "dinner";
type SlotRef = { date: string; slot: Slot };

/** Leftovers have to come after the original meal, and at most this many days later. */
export const LEFTOVER_MAX_DAYS = 4;

const slotIndex = (slot: Slot) => (slot === "lunch" ? 0 : 1);

/** true when `a` is a later lunch/dinner than `b`. */
export function isAfter(a: SlotRef, b: SlotRef): boolean {
  return a.date > b.date || (a.date === b.date && slotIndex(a.slot) > slotIndex(b.slot));
}

/** The lunches/dinners that could be leftovers of `source`: every slot after it, up to LEFTOVER_MAX_DAYS later. */
export function leftoverSlots(source: SlotRef): SlotRef[] {
  const start = fromZonedTime(`${source.date}T12:00:00`, TZ);
  const out: SlotRef[] = [];
  for (let i = 0; i <= LEFTOVER_MAX_DAYS; i++) {
    const date = formatInTimeZone(addDays(start, i), TZ, "yyyy-MM-dd");
    for (const slot of ["lunch", "dinner"] as const) {
      if (isAfter({ date, slot }, source)) out.push({ date, slot });
    }
  }
  return out;
}

/** true when `target` is a valid leftovers slot for `source`. */
export function isLeftoverSlot(target: SlotRef, source: SlotRef): boolean {
  return leftoverSlots(source).some((s) => s.date === target.date && s.slot === target.slot);
}

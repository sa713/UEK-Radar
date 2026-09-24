export type CollectionSchedule = { mode: "daily" | "selected"; days: number[]; time_msk: string; updated_at: number };
export type MoscowClock = { date: string; day: number; time: string };
const weekday: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function moscowClock(now = new Date()): MoscowClock {
 const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
  weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
 }).formatToParts(now).map(part => [part.type, part.value]));
 return { date: `${parts.year}-${parts.month}-${parts.day}`, day: weekday[parts.weekday], time: `${parts.hour}:${parts.minute}` };
}

export function isCollectionDue(schedule: CollectionSchedule, clock: MoscowClock): boolean {
 return (schedule.mode === "daily" || schedule.days.includes(clock.day)) && clock.time >= schedule.time_msk;
}

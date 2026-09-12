export type DayActivity = { date: string; ms: number };
export type ActivityLedger = { days: DayActivity[]; clockAnomalies: number; undatedMs: number };
const localDate = (wall: number) => {
  const date = new Date(wall);
  if (!Number.isFinite(date.getTime()) || date.getFullYear() < 0 || date.getFullYear() > 9999)
    return undefined;
  return `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
};
// Duration always comes from the monotonic clock. Wall time only allocates it
// between local dates; clock changes cannot invent practice hours.
export function recordActivity(ledger: ActivityLedger, ms: number, start: number, end: number) {
  const add = (date: string, amount: number) => {
    if (amount <= 0) return;
    const entry = ledger.days.find((day) => day.date === date);
    if (entry) entry.ms += amount;
    else ledger.days.push({ date, ms: amount });
  };
  if (!Number.isFinite(ms) || ms <= 0 || ms > 5000) return;
  const from = localDate(start),
    to = localDate(end),
    wall = end - start;
  if (!from || !to) {
    ledger.clockAnomalies++;
    if (to) add(to, ms);
    else ledger.undatedMs += ms;
    return;
  }
  if (wall <= 0 || Math.abs(wall - ms) > 1000) {
    ledger.clockAnomalies++;
    add(to, ms);
    return;
  }
  if (from === to) {
    add(to, ms);
    return;
  }
  const date = new Date(start),
    midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
  if (midnight < start || midnight > end) {
    ledger.clockAnomalies++;
    add(to, ms);
    return;
  }
  const before = (ms * (midnight - start)) / wall;
  add(from, before);
  add(to, ms - before);
}

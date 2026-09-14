import { localDate, type ActivityLedger } from '../curriculum/activity';
export const isDailyGoal = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 120;
export function dailyGoal(ledger: ActivityLedger, minutes: number, wall = Date.now()) {
  const date = localDate(wall);
  const ms = ledger.days.find((day) => day.date === date)?.ms ?? 0;
  const met = minutes > 0 && ms >= minutes * 60000;
  // Floor both displays. 599,999 ms must never look like a completed 10-minute goal.
  const wholeMinutes = Math.floor(ms / 60000);
  const seconds = Math.floor(ms / 1000) % 60;
  const exact = `${wholeMinutes} min ${seconds} s`;
  return {
    date,
    ms,
    met,
    label:
      minutes === 0
        ? ''
        : met
          ? `Daily goal met · ${wholeMinutes} min today`
          : `Today ${wholeMinutes} / ${minutes} min`,
    detail: `${date ?? 'Local date unavailable'} · ${exact} active today${minutes === 0 ? ' · Goal off.' : met ? ' · Daily goal met. Continue as long as you like.' : ` / ${minutes} min goal.`} Based on recorded activity across all keyboard histories.`,
  };
}

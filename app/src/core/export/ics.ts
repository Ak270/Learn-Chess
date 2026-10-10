// Calendar reminder (docs/backend/10 §6): a recurring daily event; no push server. Rest day is excluded.
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const pad = (n: number) => String(n).padStart(2, '0');

export function dailyIcs(o: { time?: string; minutes: number; restDay: number; today?: Date }): string {
  const d = o.today ?? new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const [h, m] = (o.time ?? '19:00').split(':');
  const byday = DAYS.filter((_, i) => i !== o.restDay).join(',');
  const rest = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][o.restDay];
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mentor//Daily session//EN',
    'BEGIN:VEVENT',
    `UID:mentor-daily-${stamp}@local`,
    `DTSTAMP:${stamp}T000000Z`,
    `DTSTART:${stamp}T${h}${m}00`,
    `DURATION:PT${o.minutes}M`,
    `RRULE:FREQ=WEEKLY;BYDAY=${byday}`,
    'SUMMARY:Chess session with Mentor',
    `DESCRIPTION:Today's plan is waiting. Rest day: ${rest}.`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

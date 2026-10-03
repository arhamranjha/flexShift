/**
 * The UTC instant at which the wall-clock time `hour:minute` occurs on a calendar day in a timezone.
 * `day` is any Date on that calendar day in UTC (only its UTC Y/M/D is used). Handles daylight saving, including the
 * hours around a changeover (two passes converge on the right offset).
 */
export function zonedTime(day: Date, hour: number, minute: number, timeZone: string): Date {
  const wall = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute);
  const offsetMs = (at: number) => {
    const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(new Date(at))
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'; // "GMT", "GMT+13", "GMT-3:30"
    const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) * 60_000 : 0;
  };
  const first = wall - offsetMs(wall);
  return new Date(wall - offsetMs(first));
}

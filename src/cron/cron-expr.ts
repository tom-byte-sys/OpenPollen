/**
 * Lightweight 5-field cron expression parser.
 * Format: minute hour day month weekday
 *
 * Supports:
 *   *      — any value
 *   N      — exact value
 *   N-M    — range (inclusive)
 *   N,M,O  — list
 *   *\/N    — step (every N)
 *   N-M/S  — range with step
 */

interface CronFields {
  minute: number[];
  hour: number[];
  day: number[];
  month: number[];
  weekday: number[];
}

function parseField(field: string, min: number, max: number): number[] {
  const values = new Set<number>();

  for (const part of field.split(',')) {
    const trimmed = part.trim();

    // step: */N or N-M/S
    if (trimmed.includes('/')) {
      const [range, stepStr] = trimmed.split('/');
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) throw new Error(`Invalid step: ${trimmed}`);

      let start = min;
      let end = max;

      if (range !== '*') {
        if (range.includes('-')) {
          const [a, b] = range.split('-').map(Number);
          start = a;
          end = b;
        } else {
          start = parseInt(range, 10);
        }
      }

      for (let i = start; i <= end; i += step) {
        values.add(i);
      }
      continue;
    }

    // range: N-M
    if (trimmed.includes('-')) {
      const [a, b] = trimmed.split('-').map(Number);
      if (isNaN(a) || isNaN(b)) throw new Error(`Invalid range: ${trimmed}`);
      for (let i = a; i <= b; i++) {
        values.add(i);
      }
      continue;
    }

    // wildcard
    if (trimmed === '*') {
      for (let i = min; i <= max; i++) {
        values.add(i);
      }
      continue;
    }

    // exact value
    const n = parseInt(trimmed, 10);
    if (isNaN(n)) throw new Error(`Invalid value: ${trimmed}`);
    values.add(n);
  }

  return Array.from(values).sort((a, b) => a - b);
}

export function parseCronExpr(expr: string): CronFields {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Cron expression must have 5 fields, got ${parts.length}: "${expr}"`);
  }

  return {
    minute: parseField(parts[0], 0, 59),
    hour: parseField(parts[1], 0, 23),
    day: parseField(parts[2], 1, 31),
    month: parseField(parts[3], 1, 12),
    weekday: parseField(parts[4], 0, 6), // 0 = Sunday
  };
}

/**
 * Calculate the next run time after `afterMs` for a parsed cron expression.
 * Returns a timestamp in milliseconds, or null if no match found within ~2 years.
 */
export function nextRun(expr: string, afterMs: number): number | null {
  const fields = parseCronExpr(expr);

  // Start from the next minute after afterMs
  const start = new Date(afterMs);
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);

  // Search up to ~2 years ahead (enough for any valid cron)
  const maxIterations = 366 * 24 * 60; // ~1 year in minutes
  const d = new Date(start.getTime());

  for (let i = 0; i < maxIterations; i++) {
    const month = d.getMonth() + 1; // 1-12
    const day = d.getDate();        // 1-31
    const weekday = d.getDay();     // 0-6
    const hour = d.getHours();      // 0-23
    const minute = d.getMinutes();  // 0-59

    if (
      fields.month.includes(month) &&
      fields.day.includes(day) &&
      fields.weekday.includes(weekday) &&
      fields.hour.includes(hour) &&
      fields.minute.includes(minute)
    ) {
      return d.getTime();
    }

    // Advance by 1 minute
    d.setMinutes(d.getMinutes() + 1);
  }

  return null;
}

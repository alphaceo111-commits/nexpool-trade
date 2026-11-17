/**
 * Pure chart aggregation used by the NEXPOOL financial terminal.
 *
 * Everything here works on integer nano-NEX (9 decimals), matching the
 * accounting grid in `engine.ts`, so balance candles never accumulate
 * floating-point dust. Values are converted back to NEX only at the edge.
 */

export const TERMINAL_TIMEFRAMES = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1H",
  "4H",
  "1D",
  "1W",
  "1M",
] as const;

export type TerminalTimeframe = (typeof TERMINAL_TIMEFRAMES)[number];

export const TIMEFRAME_LABEL: Record<TerminalTimeframe, string> = {
  "1m": "Minute",
  "5m": "5 minutes",
  "15m": "15 minutes",
  "30m": "30 minutes",
  "1H": "Hourly",
  "4H": "4 hours",
  "1D": "Daily",
  "1W": "Weekly",
  "1M": "Monthly",
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Bucket width for the fixed-length timeframes. Weeks and months are
 * calendar based and resolved separately. */
export const TIMEFRAME_MS: Record<
  Exclude<TerminalTimeframe, "1W" | "1M">,
  number
> = {
  "1m": MINUTE,
  "5m": 5 * MINUTE,
  "15m": 15 * MINUTE,
  "30m": 30 * MINUTE,
  "1H": HOUR,
  "4H": 4 * HOUR,
  "1D": DAY,
};

/** How much history each timeframe shows. Chosen so no chart renders more
 * than ~720 candles and the read stays bounded in Convex. */
export const TIMEFRAME_WINDOW_MS: Record<TerminalTimeframe, number> = {
  "1m": 8 * HOUR,
  "5m": 2 * DAY,
  "15m": 4 * DAY,
  "30m": 7 * DAY,
  "1H": 30 * DAY,
  "4H": 120 * DAY,
  "1D": 365 * DAY,
  "1W": 3 * 365 * DAY,
  "1M": 6 * 365 * DAY,
};

export function isTerminalTimeframe(
  value: unknown,
): value is TerminalTimeframe {
  return (
    typeof value === "string" &&
    (TERMINAL_TIMEFRAMES as readonly string[]).includes(value)
  );
}

export function normaliseTimeframe(value: unknown): TerminalTimeframe {
  return isTerminalTimeframe(value) ? value : "1D";
}

/** Start of the UTC bucket that contains `ts`. */
export function bucketStart(ts: number, timeframe: TerminalTimeframe): number {
  if (timeframe === "1M") {
    const date = new Date(ts);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  }
  if (timeframe === "1W") {
    const date = new Date(ts);
    const midnight = Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
    );
    const mondayOffset = (date.getUTCDay() + 6) % 7;
    return midnight - mondayOffset * DAY;
  }
  const width = TIMEFRAME_MS[timeframe];
  return Math.floor(ts / width) * width;
}

/** Start of the bucket before the one that begins at `start`. */
export function previousBucketStart(
  start: number,
  timeframe: TerminalTimeframe,
): number {
  if (timeframe === "1M") {
    const date = new Date(start);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1);
  }
  if (timeframe === "1W") return start - 7 * DAY;
  return start - TIMEFRAME_MS[timeframe];
}

/** Start of the bucket after the one that begins at `start`. */
export function nextBucketStart(
  start: number,
  timeframe: TerminalTimeframe,
): number {
  if (timeframe === "1M") {
    const date = new Date(start);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  }
  if (timeframe === "1W") return start + 7 * DAY;
  return start + TIMEFRAME_MS[timeframe];
}

export type LedgerAmount = {
  /** Unix ms of the confirmed movement. */
  t: number;
  /** Signed amount in nano-NEX. */
  nano: number;
};

export type ChartCandle = {
  /** Bucket start, unix ms (UTC). */
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** NEX credited during the bucket (positive movements only). */
  volume: number;
  credits: number;
  debits: number;
  movements: number;
};

export type BuildCandlesOptions = {
  points: LedgerAmount[];
  timeframe: TerminalTimeframe;
  /** Confirmed balance immediately before the first bucket, in nano-NEX. */
  baselineNano: number;
  /** Window start (unix ms). The first bucket is the one containing it. */
  from: number;
  /** Window end (unix ms). The last bucket is the one containing it. */
  to: number;
  /** Hard cap on rendered buckets; older buckets are dropped. */
  maxBuckets?: number;
};

const NANO = 1_000_000_000;

const toNex = (nano: number) => Math.round(nano) / NANO;

/**
 * Build OHLC candles of the *cumulative confirmed balance*.
 *
 * - open  = confirmed balance at the start of the interval
 * - high  = highest confirmed balance reached inside the interval
 * - low   = lowest confirmed balance reached inside the interval
 * - close = confirmed balance at the end of the interval
 * - volume = NEX credited during the interval
 *
 * Intervals without ledger activity are emitted as flat candles (open = high
 * = low = close, volume 0). Nothing is interpolated or invented: a flat candle
 * means the balance genuinely did not move.
 */
export function buildCandles({
  points,
  timeframe,
  baselineNano,
  from,
  to,
  maxBuckets = 900,
}: BuildCandlesOptions): ChartCandle[] {
  const end = Math.max(to, from);
  const rendered = bucketRange(timeframe, from, end, maxBuckets);

  const ordered = [...points]
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.nano))
    .sort((left, right) => left.t - right.t);

  const windowStart = rendered.length ? rendered[0] : bucketStart(from, timeframe);

  // Balance entering the first rendered bucket.
  let running = Math.round(baselineNano);
  let pointIndex = 0;
  while (pointIndex < ordered.length && ordered[pointIndex].t < windowStart) {
    running += Math.round(ordered[pointIndex].nano);
    pointIndex += 1;
  }

  const candles: ChartCandle[] = [];

  for (let index = 0; index < rendered.length; index += 1) {
    const bucket = rendered[index];
    const bucketEnd = index + 1 < rendered.length ? rendered[index + 1] : end + 1;

    const openBalance = running;
    let balance = running;
    let high = running;
    let low = running;
    let credits = 0;
    let debits = 0;
    let movements = 0;

    while (pointIndex < ordered.length) {
      const point = ordered[pointIndex];
      if (point.t >= bucketEnd) break;
      const amount = Math.round(point.nano);
      balance += amount;
      if (balance > high) high = balance;
      if (balance < low) low = balance;
      if (amount > 0) credits += amount;
      else if (amount < 0) debits -= amount;
      movements += 1;
      pointIndex += 1;
    }

    running = balance;
    candles.push({
      t: bucket,
      open: toNex(openBalance),
      high: toNex(high),
      low: toNex(low),
      close: toNex(balance),
      volume: toNex(credits),
      credits: toNex(credits),
      debits: toNex(debits),
      movements,
    });
  }

  return candles;
}

export type CandleSummary = {
  baseline: number;
  change: number;
  changePercent: number | null;
  highest: number;
  lowest: number;
  credits: number;
  debits: number;
  movements: number;
  activeBuckets: number;
};

export function summariseCandles(
  candles: ChartCandle[],
  baselineNano: number,
): CandleSummary {
  const baseline = toNex(baselineNano);
  let credits = 0;
  let debits = 0;
  let movements = 0;
  let activeBuckets = 0;
  let highest = baseline;
  let lowest = baseline;

  for (const candle of candles) {
    credits += candle.credits;
    debits += candle.debits;
    movements += candle.movements;
    if (candle.movements > 0) activeBuckets += 1;
    if (candle.high > highest) highest = candle.high;
    if (candle.low < lowest) lowest = candle.low;
  }

  const close = candles.length ? candles[candles.length - 1].close : baseline;
  const change = Math.round((close - baseline) * NANO) / NANO;

  return {
    baseline: Math.round(baseline * NANO) / NANO,
    change,
    changePercent: baseline > 0 ? (change / baseline) * 100 : null,
    highest: Math.round(highest * NANO) / NANO,
    lowest: Math.round(lowest * NANO) / NANO,
    credits: Math.round(credits * NANO) / NANO,
    debits: Math.round(debits * NANO) / NANO,
    movements,
    activeBuckets,
  };
}

/**
 * Bucket starts for a window. Built backwards from the newest bucket so a
 * long span can never truncate the recent end of the chart.
 */
export function bucketRange(
  timeframe: TerminalTimeframe,
  from: number,
  to: number,
  maxBuckets = 900,
): number[] {
  const first = bucketStart(from, timeframe);
  const last = bucketStart(Math.max(to, from), timeframe);
  const buckets: number[] = [];
  let cursor = last;
  while (buckets.length < maxBuckets && cursor >= first) {
    buckets.push(cursor);
    cursor = previousBucketStart(cursor, timeframe);
  }
  return buckets.reverse();
}

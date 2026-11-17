/**
 * Indicator math for the NEXPOOL terminal.
 *
 * These are descriptive statistics over the account's confirmed balance and
 * earnings history. They are not trading signals: NEX has no market price, so
 * "overbought" or "crossover" has no market meaning here.
 */

export type Point = { time: number; value: number };

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= period) sum -= values[index - period];
    out.push(index >= period - 1 ? sum / period : null);
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  const k = 2 / (period + 1);
  let previous: number | null = null;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (previous === null) {
      if (index === period - 1) {
        const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
        previous = seed;
        out.push(seed);
      } else {
        out.push(null);
      }
      continue;
    }
    previous = value * k + previous * (1 - k);
    out.push(previous);
  }
  return out;
}

export function bollinger(
  values: number[],
  period = 20,
  multiplier = 2,
): { middle: (number | null)[]; upper: (number | null)[]; lower: (number | null)[] } {
  const middle = sma(values, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const mean = middle[index];
    if (mean === null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    const slice = values.slice(index - period + 1, index + 1);
    const variance =
      slice.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period;
    const deviation = Math.sqrt(variance);
    upper.push(mean + multiplier * deviation);
    lower.push(mean - multiplier * deviation);
  }
  return { middle, upper, lower };
}

export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = [null];
  let gainSum = 0;
  let lossSum = 0;
  for (let index = 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);
    if (index <= period) {
      gainSum += gain;
      lossSum += loss;
      if (index === period) {
        const avgGain = gainSum / period;
        const avgLoss = lossSum / period;
        out.push(avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss));
      } else {
        out.push(null);
      }
      continue;
    }
    gainSum = (gainSum * (period - 1) + gain) / period;
    lossSum = (lossSum * (period - 1) + loss) / period;
    out.push(lossSum === 0 ? (gainSum === 0 ? 50 : 100) : 100 - 100 / (1 + gainSum / lossSum));
  }
  return out;
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const fastLine = ema(values, fast);
  const slowLine = ema(values, slow);
  const line: (number | null)[] = values.map((_, index) => {
    const a = fastLine[index];
    const b = slowLine[index];
    return a === null || b === null ? null : a - b;
  });

  const defined = line.filter((value): value is number => value !== null);
  const signalDefined = ema(defined, signalPeriod);
  let cursor = 0;
  const signal: (number | null)[] = line.map((value) => {
    if (value === null) return null;
    const next = signalDefined[cursor];
    cursor += 1;
    return next ?? null;
  });

  const histogram = line.map((value, index) => {
    const sig = signal[index];
    return value === null || sig === null ? null : value - sig;
  });

  return { macd: line, signal, histogram };
}

/** Pair a value series with candle times, dropping undefined gaps. */
export function toLine(time: number[], values: (number | null)[]): Point[] {
  const out: Point[] = [];
  for (let index = 0; index < time.length; index += 1) {
    const value = values[index];
    if (value === null || !Number.isFinite(value)) continue;
    out.push({ time: time[index], value });
  }
  return out;
}


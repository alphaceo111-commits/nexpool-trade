import { describe, expect, it } from "vitest";
import {
  bucketStart,
  buildCandles,
  normaliseTimeframe,
  summariseCandles,
  type LedgerAmount,
} from "./terminalMath";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NANO = 1_000_000_000;

const points = (...rows: [number, number][]): LedgerAmount[] =>
  rows.map(([t, amountNex]) => ({ t, nano: Math.round(amountNex * NANO) }));

describe("timeframe buckets", () => {
  it("aligns fixed buckets to UTC boundaries", () => {
    const ts = Date.UTC(2026, 4, 17, 13, 47, 23);
    expect(bucketStart(ts, "1H")).toBe(Date.UTC(2026, 4, 17, 13));
    expect(bucketStart(ts, "4H")).toBe(Date.UTC(2026, 4, 17, 12));
    expect(bucketStart(ts, "15m")).toBe(Date.UTC(2026, 4, 17, 13, 45));
    expect(bucketStart(ts, "1D")).toBe(Date.UTC(2026, 4, 17));
  });

  it("aligns weeks to Monday and months to the first", () => {
    // 2026-05-17 is a Sunday.
    expect(bucketStart(Date.UTC(2026, 4, 17, 9), "1W")).toBe(
      Date.UTC(2026, 4, 11),
    );
    expect(bucketStart(Date.UTC(2026, 4, 17, 9), "1M")).toBe(
      Date.UTC(2026, 4, 1),
    );
  });

  it("falls back to a daily view for unknown input", () => {
    expect(normaliseTimeframe("nonsense")).toBe("1D");
    expect(normaliseTimeframe(undefined)).toBe("1D");
    expect(normaliseTimeframe("15m")).toBe("15m");
  });
});

describe("balance candles", () => {
  const from = Date.UTC(2026, 4, 17, 10);
  const to = Date.UTC(2026, 4, 17, 13, 30);

  it("carries the baseline into the first candle and fills flat intervals", () => {
    const candles = buildCandles({
      points: points([Date.UTC(2026, 4, 17, 10, 5), 0.000001]),
      timeframe: "1H",
      baselineNano: Math.round(0.0005 * NANO),
      from,
      to,
    });

    expect(candles).toHaveLength(4);
    expect(candles[0].open).toBeCloseTo(0.0005, 9);
    expect(candles[0].close).toBeCloseTo(0.000501, 9);
    expect(candles[0].high).toBeCloseTo(0.000501, 9);
    // No activity at all: every later candle is flat, still showing the balance.
    for (const candle of candles.slice(1)) {
      expect(candle.open).toBeCloseTo(0.000501, 9);
      expect(candle.high).toBeCloseTo(0.000501, 9);
      expect(candle.low).toBeCloseTo(0.000501, 9);
      expect(candle.volume).toBe(0);
      expect(candle.movements).toBe(0);
    }
  });

  it("tracks intra-interval highs and lows from the movements", () => {
    const candles = buildCandles({
      points: points(
        [Date.UTC(2026, 4, 17, 11, 5), 0.001],
        [Date.UTC(2026, 4, 17, 11, 20), -0.0004],
        [Date.UTC(2026, 4, 17, 11, 40), 0.0002],
      ),
      timeframe: "1H",
      baselineNano: 0,
      from,
      to,
    });

    const hour = candles.find(
      (candle) => candle.t === Date.UTC(2026, 4, 17, 11),
    );
    expect(hour).toBeDefined();
    expect(hour?.open).toBe(0);
    expect(hour?.high).toBeCloseTo(0.001, 9);
    expect(hour?.low).toBe(0);
    expect(hour?.close).toBeCloseTo(0.0008, 9);
    expect(hour?.credits).toBeCloseTo(0.0012, 9);
    expect(hour?.debits).toBeCloseTo(0.0004, 9);
    expect(hour?.volume).toBeCloseTo(0.0012, 9);
    expect(hour?.movements).toBe(3);
  });

  it("opens each candle at the previous close", () => {
    const candles = buildCandles({
      points: points(
        [Date.UTC(2026, 4, 17, 10, 30), 0.002],
        [Date.UTC(2026, 4, 17, 12, 15), 0.003],
      ),
      timeframe: "1H",
      baselineNano: Math.round(0.01 * NANO),
      from,
      to,
    });
    expect(candles[1].open).toBeCloseTo(candles[0].close, 9);
    expect(candles[2].open).toBeCloseTo(candles[1].close, 9);
    expect(candles[2].close).toBeCloseTo(0.015, 9);
  });

  it("does not invent movement for a withdrawal-free flat balance", () => {
    const candles = buildCandles({
      points: [],
      timeframe: "1D",
      baselineNano: Math.round(2.5 * NANO),
      from: Date.UTC(2026, 4, 10),
      to: Date.UTC(2026, 4, 17),
    });
    expect(candles.length).toBeGreaterThan(1);
    expect(candles.every((candle) => candle.volume === 0)).toBe(true);
    expect(candles.every((candle) => candle.high === candle.low)).toBe(true);
    expect(candles[candles.length - 1].close).toBeCloseTo(2.5, 9);
  });

  it("summarises net change and percentage from the window", () => {
    const candles = buildCandles({
      points: points([Date.UTC(2026, 4, 17, 10, 10), 0.5]),
      timeframe: "1H",
      baselineNano: Math.round(1 * NANO),
      from,
      to,
    });
    const summary = summariseCandles(candles, Math.round(1 * NANO));
    expect(summary.change).toBeCloseTo(0.5, 9);
    expect(summary.changePercent).toBeCloseTo(50, 6);
    expect(summary.highest).toBeCloseTo(1.5, 9);
    expect(summary.lowest).toBeCloseTo(1, 9);
    expect(summary.movements).toBe(1);
    expect(summary.activeBuckets).toBe(1);
  });

  it("keeps nano precision without float drift", () => {
    const candles = buildCandles({
      points: Array.from({ length: 50 }, (_, index) => ({
        t: Date.UTC(2026, 4, 17, 10, index % 59),
        nano: 6_000,
      })),
      timeframe: "1H",
      baselineNano: 0,
      from,
      to,
    });
    expect(candles[0].close).toBeCloseTo(0.0003, 9);
  });

  it("never renders more buckets than the cap", () => {
    const candles = buildCandles({
      points: [],
      timeframe: "1m",
      baselineNano: 0,
      from: Date.UTC(2026, 4, 1),
      to: Date.UTC(2026, 4, 17),
      maxBuckets: 120,
    });
    expect(candles).toHaveLength(120);
    expect(candles[candles.length - 1].t).toBe(
      bucketStart(Date.UTC(2026, 4, 17), "1m"),
    );
  });
});

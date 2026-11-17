import { useEffect, useRef } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { ChartCandle } from "@/convex/terminalMath";
import { bollinger, ema, macd, rsi, sma, toLine } from "@/lib/terminal-indicators";

export type ChartMode = "candles" | "balance" | "earnings";

export type IndicatorFlags = {
  sma: boolean;
  ema: boolean;
  bands: boolean;
  volume: boolean;
  rsi: boolean;
  macd: boolean;
};

const PALETTE = {
  up: "#5fe08c",
  down: "#f2685f",
  gold: "#d9b46b",
  blue: "#7aa2f7",
  grid: "rgba(255,255,255,0.045)",
  border: "rgba(255,255,255,0.08)",
  text: "#7d857f",
};

export function axisNex(value: number) {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toFixed(0);
  if (abs >= 1) return value.toFixed(2);
  if (abs >= 0.01) return value.toFixed(4);
  if (abs >= 0.0001) return value.toFixed(6);
  return value.toExponential(1);
}

const nexFormat = { type: "custom" as const, formatter: axisNex, minMove: 0.000000001 };

function baseChart(container: HTMLElement) {
  return createChart(container, {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: "transparent" },
      textColor: PALETTE.text,
      fontSize: 10,
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: PALETTE.grid },
      horzLines: { color: PALETTE.grid },
    },
    rightPriceScale: {
      borderColor: PALETTE.border,
      scaleMargins: { top: 0.12, bottom: 0.08 },
    },
    timeScale: {
      borderColor: PALETTE.border,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 2,
      barSpacing: 7,
      minBarSpacing: 0.4,
      fixLeftEdge: true,
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: "rgba(217,180,107,0.55)",
        width: 1,
        style: 2,
        labelBackgroundColor: "#2a2b26",
      },
      horzLine: {
        color: "rgba(217,180,107,0.55)",
        width: 1,
        style: 2,
        labelBackgroundColor: "#2a2b26",
      },
    },
    localization: {
      timeFormatter: (time: number) =>
        new Date(time * 1000).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "UTC",
        }),
      priceFormatter: axisNex,
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
    handleScale: {
      axisPressedMouseMove: true,
      mouseWheel: true,
      pinch: true,
    },
  });
}

type MainSeries = {
  candles: ISeriesApi<"Candlestick">;
  area: ISeriesApi<"Area">;
  volume: ISeriesApi<"Histogram">;
  sma: ISeriesApi<"Line">;
  ema: ISeriesApi<"Line">;
  bandUpper: ISeriesApi<"Line">;
  bandLower: ISeriesApi<"Line">;
};

type OscSeries = {
  rsi: ISeriesApi<"Line">;
  macd: ISeriesApi<"Line">;
  signal: ISeriesApi<"Line">;
  histogram: ISeriesApi<"Histogram">;
};

const stamp = (points: { time: number; value: number }[]) =>
  points.map((point) => ({
    time: point.time as UTCTimestamp,
    value: point.value,
  }));

function applyOscillator(series: OscSeries, candles: ChartCandle[]) {
  const time = candles.map((candle) => candle.t / 1000);
  const closes = candles.map((candle) => candle.close);
  series.rsi.setData(stamp(toLine(time, rsi(closes, 14))));
  const momentum = macd(closes);
  series.macd.setData(stamp(toLine(time, momentum.macd)));
  series.signal.setData(stamp(toLine(time, momentum.signal)));
  series.histogram.setData(
    stamp(toLine(time, momentum.histogram)).map((point) => ({
      time: point.time,
      value: point.value,
      color: point.value >= 0 ? "rgba(95,224,140,0.5)" : "rgba(242,104,95,0.5)",
    })),
  );
}

export function TerminalChart({
  candles,
  mode,
  indicators,
  frameKey,
  resetKey,
  showOscillator,
  onHover,
}: {
  candles: ChartCandle[];
  mode: ChartMode;
  indicators: IndicatorFlags;
  frameKey: string;
  resetKey: number;
  showOscillator: boolean;
  onHover: (payload: { candle: ChartCandle | null; time: number | null }) => void;
}) {
  const mainRef = useRef<HTMLDivElement | null>(null);
  const oscRef = useRef<HTMLDivElement | null>(null);
  const candlesRef = useRef<ChartCandle[]>(candles);
  const hoverRef = useRef(onHover);
  const firstTime = useRef<number | null>(null);
  const syncing = useRef(false);

  const chartRef = useRef<IChartApi | null>(null);
  const mainSeries = useRef<MainSeries | null>(null);
  const oscChartRef = useRef<IChartApi | null>(null);
  const oscSeries = useRef<OscSeries | null>(null);

  candlesRef.current = candles;
  hoverRef.current = onHover;

  // Build the main chart once. Every overlay series exists up front and is
  // toggled with `visible`, so live ledger updates never rebuild the chart or
  // reset the user's zoom.
  useEffect(() => {
    const container = mainRef.current;
    if (!container) return;

    const chart = baseChart(container);
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: PALETTE.up,
      downColor: PALETTE.down,
      borderUpColor: PALETTE.up,
      borderDownColor: PALETTE.down,
      wickUpColor: PALETTE.up,
      wickDownColor: PALETTE.down,
      priceFormat: nexFormat,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: PALETTE.gold,
      topColor: "rgba(217,180,107,0.28)",
      bottomColor: "rgba(217,180,107,0)",
      lineWidth: 2,
      priceFormat: nexFormat,
      priceLineVisible: false,
      visible: false,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: nexFormat,
      priceScaleId: "volume",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.84, bottom: 0 },
      borderVisible: false,
    });

    const overlay = {
      lineWidth: 1 as const,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: nexFormat,
    };
    const smaSeries = chart.addSeries(LineSeries, {
      ...overlay,
      color: PALETTE.gold,
      visible: false,
    });
    const emaSeries = chart.addSeries(LineSeries, {
      ...overlay,
      color: PALETTE.blue,
      visible: false,
    });
    const bandUpperSeries = chart.addSeries(LineSeries, {
      ...overlay,
      color: "rgba(217,180,107,0.42)",
      lineStyle: 2,
      visible: false,
    });
    const bandLowerSeries = chart.addSeries(LineSeries, {
      ...overlay,
      color: "rgba(217,180,107,0.42)",
      lineStyle: 2,
      visible: false,
    });

    mainSeries.current = {
      candles: candleSeries,
      area: areaSeries,
      volume: volumeSeries,
      sma: smaSeries,
      ema: emaSeries,
      bandUpper: bandUpperSeries,
      bandLower: bandLowerSeries,
    };

    const hover = (param: MouseEventParams<Time>) => {
      if (param.time === undefined || !param.point) {
        hoverRef.current({ candle: null, time: null });
        return;
      }
      const target = param.time as number;
      const found =
        candlesRef.current.find(
          (candle) => Math.round(candle.t / 1000) === target,
        ) ?? null;
      hoverRef.current({ candle: found, time: target * 1000 });
    };
    chart.subscribeCrosshairMove(hover);

    let lastTap = 0;
    const onTap = () => {
      const now = Date.now();
      if (now - lastTap < 320) {
        chart.timeScale().fitContent();
        oscChartRef.current?.timeScale().fitContent();
        lastTap = 0;
        return;
      }
      lastTap = now;
    };
    container.addEventListener("dblclick", onTap);
    container.addEventListener("touchend", onTap);

    return () => {
      container.removeEventListener("dblclick", onTap);
      container.removeEventListener("touchend", onTap);
      chart.remove();
      chartRef.current = null;
      mainSeries.current = null;
      oscChartRef.current?.remove();
      oscChartRef.current = null;
      oscSeries.current = null;
      firstTime.current = null;
    };
  }, []);

  // Oscillator pane is mounted only while RSI or MACD is on, so the chart never
  // has to render inside a zero-height container.
  useEffect(() => {
    if (!showOscillator) {
      oscChartRef.current?.remove();
      oscChartRef.current = null;
      oscSeries.current = null;
      return;
    }
    const container = oscRef.current;
    if (!container) return;
    if (oscChartRef.current) return;

    const chart = baseChart(container);
    oscChartRef.current = chart;
    chart.applyOptions({
      rightPriceScale: {
        borderColor: PALETTE.border,
        scaleMargins: { top: 0.18, bottom: 0.14 },
      },
      timeScale: {
        borderColor: PALETTE.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 2,
        barSpacing: 7,
        minBarSpacing: 0.4,
        fixLeftEdge: true,
        visible: false,
      },
    });

    const rsiSeries = chart.addSeries(LineSeries, {
      color: PALETTE.gold,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: {
        type: "custom",
        formatter: (value: number) => value.toFixed(0),
        minMove: 0.1,
      },
    });
    rsiSeries.createPriceLine({
      price: 70,
      color: "rgba(242,104,95,0.4)",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: false,
      title: "",
    });
    rsiSeries.createPriceLine({
      price: 30,
      color: "rgba(95,224,140,0.4)",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: false,
      title: "",
    });

    const macdSeries = chart.addSeries(LineSeries, {
      color: PALETTE.gold,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: false,
    });
    const signalSeries = chart.addSeries(LineSeries, {
      color: PALETTE.blue,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: false,
    });
    const histogramSeries = chart.addSeries(HistogramSeries, {
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: nexFormat,
      visible: false,
    });

    oscSeries.current = {
      rsi: rsiSeries,
      macd: macdSeries,
      signal: signalSeries,
      histogram: histogramSeries,
    };

    const syncToMain = (range: { from: number; to: number } | null) => {
      if (!range || syncing.current) return;
      syncing.current = true;
      chartRef.current?.timeScale().setVisibleLogicalRange(range);
      syncing.current = false;
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(syncToMain);

    applyOscillator(oscSeries.current, candlesRef.current);
    chart.timeScale().fitContent();
    oscSeries.current.rsi.applyOptions({ visible: indicators.rsi });
    oscSeries.current.macd.applyOptions({ visible: indicators.macd });
    oscSeries.current.signal.applyOptions({ visible: indicators.macd });
    oscSeries.current.histogram.applyOptions({ visible: indicators.macd });
  }, [showOscillator, indicators.rsi, indicators.macd]);

  // Mirror the main chart's pan/zoom into the oscillator pane.
  useEffect(() => {
    const main = chartRef.current;
    if (!main || !showOscillator) return;
    const handler = (range: { from: number; to: number } | null) => {
      const osc = oscChartRef.current;
      if (!range || !osc || syncing.current) return;
      syncing.current = true;
      osc.timeScale().setVisibleLogicalRange(range);
      syncing.current = false;
    };
    main.timeScale().subscribeVisibleLogicalRangeChange(handler);
    return () => {
      main.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
    };
  }, [showOscillator]);

  // Main data + overlay indicators.
  useEffect(() => {
    const api = mainSeries.current;
    if (!api) return;

    const time = candles.map((candle) => candle.t / 1000);
    const closes = candles.map((candle) => candle.close);

    api.candles.setData(
      candles.map((candle) => ({
        time: (candle.t / 1000) as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    );
    api.area.setData(
      candles.map((candle) => ({
        time: (candle.t / 1000) as UTCTimestamp,
        value: candle.close,
      })),
    );
    api.volume.setData(
      candles.map((candle) => ({
        time: (candle.t / 1000) as UTCTimestamp,
        value: candle.volume,
        color:
          candle.volume > 0 ? "rgba(95,224,140,0.42)" : "rgba(255,255,255,0.05)",
      })),
    );

    api.sma.setData(stamp(toLine(time, sma(closes, 20))));
    api.ema.setData(stamp(toLine(time, ema(closes, 20))));
    const bands = bollinger(closes, 20, 2);
    api.bandUpper.setData(stamp(toLine(time, bands.upper)));
    api.bandLower.setData(stamp(toLine(time, bands.lower)));

    const osc = oscSeries.current;
    if (osc) {
      applyOscillator(osc, candles);
      if (oscChartRef.current && firstTime.current !== candles[0]?.t) {
        oscChartRef.current.timeScale().fitContent();
      }
    }

    // Refit only when the visible window itself changed (new timeframe, or the
    // window slid forward). A live update inside the same window keeps zoom.
    const first = candles.length ? candles[0].t : null;
    if (first !== null && first !== firstTime.current) {
      firstTime.current = first;
      chartRef.current?.timeScale().fitContent();
    }
  }, [candles]);

  // Visibility: chart mode + indicator toggles.
  useEffect(() => {
    const api = mainSeries.current;
    if (!api) return;
    const candleMode = mode === "candles";
    api.candles.applyOptions({ visible: candleMode });
    api.area.applyOptions({ visible: mode === "balance" });
    api.volume.applyOptions({
      visible: indicators.volume || mode === "earnings",
    });
    api.sma.applyOptions({ visible: indicators.sma && candleMode });
    api.ema.applyOptions({ visible: indicators.ema && candleMode });
    api.bandUpper.applyOptions({ visible: indicators.bands && candleMode });
    api.bandLower.applyOptions({ visible: indicators.bands && candleMode });
    chartRef.current?.priceScale("right").applyOptions({
      scaleMargins: {
        top: 0.12,
        bottom: indicators.volume || mode === "earnings" ? 0.26 : 0.08,
      },
    });

    const osc = oscSeries.current;
    if (osc) {
      osc.rsi.applyOptions({ visible: indicators.rsi });
      osc.macd.applyOptions({ visible: indicators.macd });
      osc.signal.applyOptions({ visible: indicators.macd });
      osc.histogram.applyOptions({ visible: indicators.macd });
    }
  }, [mode, indicators]);

  useEffect(() => {
    if (resetKey === 0) return;
    chartRef.current?.timeScale().fitContent();
    oscChartRef.current?.timeScale().fitContent();
  }, [resetKey]);

  useEffect(() => {
    chartRef.current?.timeScale().fitContent();
    oscChartRef.current?.timeScale().fitContent();
  }, [frameKey]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        ref={mainRef}
        className="min-h-0 w-full flex-1 touch-pan-y select-none"
        role="img"
        aria-label="NEXPOOL confirmed balance chart"
      />
      {showOscillator ? (
        <div
          ref={oscRef}
          className="mt-1 h-[86px] w-full shrink-0 border-t border-border/40 pt-1"
        />
      ) : null}
    </div>
  );
}

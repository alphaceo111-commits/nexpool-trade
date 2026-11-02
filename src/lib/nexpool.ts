export const COIN_COLORS: Record<string, string> = {
  BTC: "#f5b93d",
  KAS: "#6fd8ea",
  LTC: "#93a9c0",
  ETC: "#c6f24e",
};

export const COIN_NAMES: Record<string, string> = {
  BTC: "Bitcoin",
  KAS: "Kaspa",
  LTC: "Litecoin",
  ETC: "Ethereum Classic",
};

/** Reference rates for the ticker strip (demo feed, refreshed on deploy). */
export const MARKET = [
  { symbol: "BTC", pair: "BTC/USDT", price: 94120.4, change: 2.14, color: COIN_COLORS.BTC },
  { symbol: "LTC", pair: "LTC/USDT", price: 84.2, change: -0.63, color: COIN_COLORS.LTC },
  { symbol: "KAS", pair: "KAS/USDT", price: 0.1182, change: 4.02, color: COIN_COLORS.KAS },
  { symbol: "ETC", pair: "ETC/USDT", price: 24.61, change: -1.28, color: COIN_COLORS.ETC },
  { symbol: "DOGE", pair: "DOGE/USDT", price: 0.1643, change: 1.71, color: "#e0c97a" },
  { symbol: "BTC.D", pair: "BTC DOMINANCE", price: 57.4, change: 0.32, color: "#8ea0b5" },
  { symbol: "FEES", pair: "NEXPOOL TAKE", price: 1.0, change: 0, color: "#c6f24e" },
];

export const FEE_TIERS = [
  {
    name: "Starter",
    fee: "1.50%",
    hashrate: "Up to 50 PH/s",
    payout: "Daily settlement",
    accent: false,
  },
  {
    name: "Pro",
    fee: "1.00%",
    hashrate: "50 – 500 PH/s",
    payout: "6-hour settlement",
    accent: true,
  },
  {
    name: "Desk",
    fee: "0.70%",
    hashrate: "500 PH/s +",
    payout: "2-hour settlement + bot desk",
    accent: false,
  },
];

export function formatUsd(value: number, digits = 0) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatUsdCompact(value: number) {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatNumber(value: number, digits = 0) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatPth(value: number) {
  return `${value.toFixed(1)} PH/s`;
}

export function formatCoin(value: number) {
  if (value >= 100) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  return value.toFixed(6);
}

export function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function monthShort(month: number) {
  return [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][month];
}

export function formatDay(isoDay: string) {
  const [, month, day] = isoDay.split("-").map(Number);
  return `${monthShort(month - 1)} ${day}`;
}

export function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatDateTime(ts: number) {
  const date = new Date(ts);
  return `${monthShort(date.getMonth())} ${date.getDate()} · ${formatTime(ts)}`;
}

export function shortHash(hash: string) {
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

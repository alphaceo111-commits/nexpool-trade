type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

type SafeInset = { top?: number; bottom?: number; left?: number; right?: number };

export type TelegramWebApp = {
  initData: string;
  initDataUnsafe: {
    user?: TelegramUser;
    start_param?: string;
    auth_date?: number;
  };
  colorScheme?: "light" | "dark";
  isExpanded?: boolean;
  safeAreaInset?: SafeInset;
  contentSafeAreaInset?: SafeInset;
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  onEvent?: (event: string, handler: () => void) => void;
  offEvent?: (event: string, handler: () => void) => void;
  openTelegramLink?: (url: string) => void;
  showAlert?: (message: string) => void;
};

export function getTelegram(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } })
    .Telegram?.WebApp;
  return candidate ?? null;
}

/** Telegram Mini App lifecycle: expand, theme chrome, and publish safe areas. */
export function initTelegram() {
  const app = getTelegram();
  if (!app) return;
  try {
    app.ready();
    app.expand();
    app.setHeaderColor?.("#0b0d10");
    app.setBackgroundColor?.("#0b0d10");
  } catch (error) {
    console.warn("Telegram init skipped", error);
  }
  const applyInsets = () => {
    const safe = app.safeAreaInset ?? {};
    const content = app.contentSafeAreaInset ?? {};
    const root = document.documentElement;
    root.style.setProperty(
      "--tg-safe-top",
      `${Math.max(safe.top ?? 0, content.top ?? 0)}px`,
    );
    root.style.setProperty(
      "--tg-safe-bottom",
      `${Math.max(safe.bottom ?? 0, content.bottom ?? 0)}px`,
    );
  };
  applyInsets();
  app.onEvent?.("viewportChanged", applyInsets);
}

export function telegramStartParam() {
  return getTelegram()?.initDataUnsafe?.start_param ?? null;
}

/** Opens sponsor links inside Telegram when available. */
export function openExternal(url: string) {
  const app = getTelegram();
  if (app?.openTelegramLink && /^https:\/\/t\.me\//.test(url)) {
    app.openTelegramLink(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

const REF_KEY = "nexpool.referral";

export function rememberReferral(code: string | null | undefined) {
  if (!code) return;
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z2-9]{6,12}$/.test(clean)) return;
  try {
    window.localStorage.setItem(REF_KEY, clean);
  } catch {
    /* storage can be blocked inside some webviews */
  }
}

export function takeReferral() {
  try {
    const code = window.localStorage.getItem(REF_KEY);
    if (code) window.localStorage.removeItem(REF_KEY);
    return code;
  } catch {
    return null;
  }
}

export function peekReferral() {
  try {
    return window.localStorage.getItem(REF_KEY);
  } catch {
    return null;
  }
}

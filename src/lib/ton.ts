/**
 * TON Connect manifest. The http action lives on the Convex site so the
 * manifest is served over HTTPS and can echo the real app origin.
 */
const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;

function siteUrl() {
  if (convexUrl?.includes(".convex.cloud")) {
    return convexUrl.replace(".convex.cloud", ".convex.site");
  }
  return null;
}

export const TON_MANIFEST_URL = (() => {
  const site = siteUrl();
  if (site) return `${site}/tonconnect/manifest`;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/tonconnect-manifest.json`;
  }
  return "https://nexpool.app/tonconnect-manifest.json";
})();

export const TON_EXPLORER_TX = "https://tonscan.org/tx/";
export const TON_EXPLORER_ADDRESS = "https://tonscan.org/address/";

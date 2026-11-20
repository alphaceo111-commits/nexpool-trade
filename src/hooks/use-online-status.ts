import { useEffect, useState } from "react";

/**
 * Tracks the device's connectivity so NEXPOOL can say "you are offline"
 * instead of showing a spinner that never resolves. Convex reconnects its
 * websocket on its own; this only drives the UI.
 */
export function useOnlineStatus() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return online;
}

// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { telegramAuth } from "./auth/telegram";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  // Telegram is the real identity. Anonymous is only a browser-preview
  // fallback for devices where Telegram initData is unavailable; it is
  // upgraded to the Telegram account the moment the mini app runs in Telegram.
  providers: [telegramAuth, Anonymous],
});

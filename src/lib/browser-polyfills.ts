import { Buffer } from "buffer";

// @ton/core constructs transaction payloads with Node's Buffer. Vite does not
// polyfill Node globals in the browser, so this module must be imported before
// any TON SDK code is evaluated.
if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}

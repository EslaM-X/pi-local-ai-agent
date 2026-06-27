// Client-side Pi Network SDK helper.
// Reference: https://pi-apps.github.io/pi-sdk-docs/quick-start/genai/Authentication

export type PiAuthResult = {
  accessToken: string;
  user: { uid: string; username: string };
};

type PiSdk = {
  init: (opts: { version: string; sandbox?: boolean }) => Promise<void> | void;
  authenticate: (
    scopes: string[],
    onIncompletePaymentFound?: (payment: unknown) => void,
  ) => Promise<PiAuthResult>;
};

declare global {
  interface Window {
    Pi?: PiSdk;
  }
}

let initPromise: Promise<void> | null = null;
let scriptPromise: Promise<void> | null = null;

const SDK_SRC = "https://sdk.minepi.com/pi-sdk.js";

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Pi SDK requires a browser environment"));
  if (window.Pi) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Pi SDK")), { once: true });
      if (window.Pi) resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = SDK_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Pi SDK"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/** Load the Pi SDK and call Pi.init exactly once. Treats Pi.init as a Promise and awaits it fully. */
export async function ensurePiInit(opts: { sandbox?: boolean } = {}): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await loadScript();
    if (!window.Pi) throw new Error("Pi SDK did not register window.Pi");
    // Per the Pi SDK docs, init may return void or a Promise — await both safely.
    await Promise.resolve(window.Pi.init({ version: "2.0", sandbox: opts.sandbox ?? false }));
  })().catch((err) => {
    initPromise = null; // allow retry on failure
    throw err;
  });
  return initPromise;
}

/** Run the full Pi auth flow with the `username` scope and return the access token + user. */
export async function authenticatePi(): Promise<PiAuthResult> {
  await ensurePiInit();
  if (!window.Pi) throw new Error("Pi SDK is unavailable");
  const result = await window.Pi.authenticate(["username"], (payment) => {
    // Required by SDK signature; we don't process incomplete payments here.
    if (typeof console !== "undefined") console.warn("[Pi] incomplete payment found", payment);
  });
  if (!result?.accessToken || !result.user?.username) {
    throw new Error("Pi authentication returned an invalid payload");
  }
  return result;
}

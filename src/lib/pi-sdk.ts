// Client-side Pi Network SDK helper.
// Reference: https://pi-apps.github.io/pi-sdk-docs/quick-start/genai/Authentication
//            https://pi-apps.github.io/pi-sdk-docs/quick-start/genai/Payments

import { approvePiPayment, completePiPayment } from "@/lib/pi-payments.functions";

export type PiAuthResult = {
  accessToken: string;
  user: { uid: string; username: string };
};

export type PiPaymentDTO = {
  identifier: string;
  user_uid: string;
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
  to_address: string;
  created_at: string;
  network: "Pi Network" | "Pi Testnet";
  status: {
    developer_approved: boolean;
    transaction_verified: boolean;
    developer_completed: boolean;
    cancelled: boolean;
    user_cancelled: boolean;
  };
  transaction: null | { txid: string; verified: boolean; _link: string };
};

export type PiPaymentData = {
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
};

export type PiPaymentCallbacks = {
  onReadyForServerApproval: (paymentId: string) => void;
  onReadyForServerCompletion: (paymentId: string, txid: string) => void;
  onCancel: (paymentId: string) => void;
  onError: (error: Error, payment?: PiPaymentDTO) => void;
};

type PiSdk = {
  init: (opts: { version: string; sandbox?: boolean }) => Promise<void> | void;
  authenticate: (
    scopes: string[],
    onIncompletePaymentFound: (payment: PiPaymentDTO) => void,
  ) => Promise<PiAuthResult>;
  createPayment: (data: PiPaymentData, callbacks: PiPaymentCallbacks) => Promise<PiPaymentDTO>;
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
    await Promise.resolve(window.Pi.init({ version: "2.0", sandbox: opts.sandbox ?? false }));
  })().catch((err) => {
    initPromise = null;
    throw err;
  });
  return initPromise;
}

/**
 * Required by the Pi SDK: when a previous payment is left in-flight,
 * complete it through the backend instead of silently ignoring.
 */
async function handleIncompletePayment(payment: PiPaymentDTO): Promise<void> {
  try {
    const txid = payment.transaction?.txid;
    if (!txid) {
      console.warn("[Pi] incomplete payment missing txid, skipping complete()", payment.identifier);
      return;
    }
    const res = await completePiPayment({ data: { paymentId: payment.identifier, txid } });
    if (!res.ok) {
      console.error("[Pi] failed to complete incomplete payment", payment.identifier, res.error);
    } else {
      console.info("[Pi] completed in-flight payment", payment.identifier);
    }
  } catch (err) {
    console.error("[Pi] error completing in-flight payment", err);
  }
}

/** Run the full Pi auth flow with `username` + `payments` scopes and return the access token + user. */
export async function authenticatePi(): Promise<PiAuthResult> {
  await ensurePiInit();
  if (!window.Pi) throw new Error("Pi SDK is unavailable");
  const result = await window.Pi.authenticate(
    ["username", "payments"],
    (payment) => void handleIncompletePayment(payment),
  );
  if (!result?.accessToken || !result.user?.username) {
    throw new Error("Pi authentication returned an invalid payload");
  }
  return result;
}

/**
 * Create a User-to-App (U2A) Pi payment.
 * - Awaits Pi.init before calling Pi.createPayment.
 * - onReadyForServerApproval -> backend POST /v2/payments/:id/approve
 * - onReadyForServerCompletion -> backend POST /v2/payments/:id/complete
 * - onIncompletePaymentFound is always set via the shared handler.
 */
export async function createPiPayment(
  data: PiPaymentData,
  hooks: {
    onApproved?: (paymentId: string) => void;
    onCompleted?: (paymentId: string, txid: string) => void;
    onCancel?: (paymentId: string) => void;
    onError?: (error: Error) => void;
  } = {},
): Promise<PiPaymentDTO> {
  await ensurePiInit();
  if (!window.Pi) throw new Error("Pi SDK is unavailable");

  return window.Pi.createPayment(data, {
    onReadyForServerApproval: async (paymentId) => {
      try {
        const res = await approvePiPayment({ data: { paymentId, expected: data } });
        if (!res.ok) throw new Error(res.error);
        hooks.onApproved?.(paymentId);
      } catch (err) {
        hooks.onError?.(err instanceof Error ? err : new Error("approval failed"));
      }
    },
    onReadyForServerCompletion: async (paymentId, txid) => {
      try {
        const res = await completePiPayment({ data: { paymentId, txid } });
        if (!res.ok) throw new Error(res.error);
        hooks.onCompleted?.(paymentId, txid);
      } catch (err) {
        hooks.onError?.(err instanceof Error ? err : new Error("completion failed"));
      }
    },
    onCancel: (paymentId) => {
      hooks.onCancel?.(paymentId);
    },
    onError: (error, payment) => {
      if (payment) void handleIncompletePayment(payment);
      hooks.onError?.(error);
    },
  });
}

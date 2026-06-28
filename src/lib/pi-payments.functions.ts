import { createServerFn } from "@tanstack/react-start";

/**
 * Server-side Pi Network payment endpoints.
 * Reference: https://pi-apps.github.io/pi-sdk-docs/quick-start/genai/Payments
 *
 * These S2S calls require a Pi Network API key (PI_NETWORK_API_KEY) and use
 * `Authorization: Key <PI_NETWORK_API_KEY>`. This is distinct from user
 * authentication, which uses the user's access token.
 */

// Product catalog mirrored on the server so the backend can validate the
// frontend's payment request and never trust client-supplied prices.
export const PI_PRODUCTS = {
  pro_compute_credits_1000: {
    sku: "pro_compute_credits_1000",
    name: "Pro Compute Credits — 1,000",
    amount: 1, // 1 π
    credits: 1000,
    memo: "Archon AI Core · 1,000 Pro Compute Credits",
  },
  pro_compute_credits_5000: {
    sku: "pro_compute_credits_5000",
    name: "Pro Compute Credits — 5,000",
    amount: 4.5,
    credits: 5000,
    memo: "Archon AI Core · 5,000 Pro Compute Credits",
  },
  pro_compute_credits_25000: {
    sku: "pro_compute_credits_25000",
    name: "Pro Compute Credits — 25,000",
    amount: 20,
    credits: 25000,
    memo: "Archon AI Core · 25,000 Pro Compute Credits",
  },
} as const;

export type PiProductSku = keyof typeof PI_PRODUCTS;

export const APP_TAG = "archon-ai-core";

export type PurchaseRecord = {
  paymentId: string;
  sku: PiProductSku;
  packName: string;
  amount: number;
  credits: number;
  status: "approved" | "completed";
  txid?: string;
  ts: number;
};

// In-memory store. Per-uid balance + purchase ledger + paymentId dedup set.
// NOTE: Worker memory is per-isolate and non-durable; this is the best we can
// do without a database. Clients also mirror history in localStorage.
const balances = new Map<string, number>();
const ledgers = new Map<string, PurchaseRecord[]>();
const completedPaymentIds = new Set<string>();
const approvedPaymentIds = new Set<string>();

function getApiKey(): string {
  const key = process.env.PI_NETWORK_API_KEY;
  if (!key) throw new Error("PI_NETWORK_API_KEY is not configured on the server");
  return key;
}

async function piFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`https://api.minepi.com${path}`, {
    ...init,
    headers: {
      Authorization: `Key ${getApiKey()}`,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function resolveUidFromAccessToken(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.minepi.com/v2/me", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { uid?: string };
    return body?.uid ?? null;
  } catch {
    return null;
  }
}

// Strict validation of an on-chain Pi payment vs our catalog + the client's
// declared expectation. Centralized so approve/complete share the same checks.
function validateAgainstCatalog(payment: {
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
}, expected?: { amount: number; memo: string; metadata: Record<string, unknown> }):
  | { ok: true; product: typeof PI_PRODUCTS[PiProductSku] }
  | { ok: false; code: string; error: string }
{
  const meta = payment.metadata ?? {};
  const sku = typeof meta.sku === "string" ? meta.sku : "";
  const product = (PI_PRODUCTS as Record<string, typeof PI_PRODUCTS[PiProductSku]>)[sku];
  if (!product) return { ok: false, code: "unknown_sku", error: "Unknown product SKU" };

  if (Number(payment.amount) !== Number(product.amount)) {
    return { ok: false, code: "amount_mismatch", error: "Payment amount does not match the product price" };
  }
  if (payment.memo !== product.memo) {
    return { ok: false, code: "memo_mismatch", error: "Payment memo does not match the product" };
  }
  if (Number(meta.credits) !== Number(product.credits)) {
    return { ok: false, code: "metadata_credits_mismatch", error: "Metadata credits do not match the SKU" };
  }
  if (meta.app !== APP_TAG) {
    return { ok: false, code: "metadata_app_mismatch", error: "Payment metadata is for a different application" };
  }

  if (expected) {
    if (Number(expected.amount) !== Number(product.amount)) {
      return { ok: false, code: "expected_amount_mismatch", error: "Expected amount does not match the product" };
    }
    if (expected.memo !== product.memo) {
      return { ok: false, code: "expected_memo_mismatch", error: "Expected memo does not match the product" };
    }
    const em = expected.metadata ?? {};
    if (em.sku !== sku || Number(em.credits) !== Number(product.credits) || em.app !== APP_TAG) {
      return { ok: false, code: "expected_metadata_mismatch", error: "Expected metadata does not match the SKU" };
    }
  }

  return { ok: true, product };
}

type ApproveInput = {
  paymentId: string;
  expected: { amount: number; memo: string; metadata: Record<string, unknown> };
};

/**
 * Approve a Pi payment created on the client.
 * Validates the on-chain payment matches the expected product/amount before
 * approving via POST /v2/payments/:id/approve.
 */
export const approvePiPayment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown): ApproveInput => {
    if (!data || typeof data !== "object") throw new Error("invalid payload");
    const d = data as Partial<ApproveInput>;
    if (typeof d.paymentId !== "string" || d.paymentId.length < 4 || d.paymentId.length > 256) {
      throw new Error("paymentId is required");
    }
    if (
      !d.expected ||
      typeof d.expected.amount !== "number" ||
      typeof d.expected.memo !== "string" ||
      typeof d.expected.metadata !== "object" ||
      d.expected.metadata === null
    ) {
      throw new Error("expected {amount, memo, metadata} is required");
    }
    return { paymentId: d.paymentId, expected: d.expected as ApproveInput["expected"] };
  })
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; code: string; error: string }> => {
    try {
      const lookup = await piFetch(`/v2/payments/${encodeURIComponent(data.paymentId)}`);
      if (!lookup.ok) return { ok: false, code: "lookup_failed", error: `Pi lookup returned ${lookup.status}` };
      const payment = (await lookup.json()) as {
        amount: number;
        memo: string;
        metadata: Record<string, unknown>;
      };

      const v = validateAgainstCatalog(payment, data.expected);
      if (!v.ok) return v;

      const approve = await piFetch(`/v2/payments/${encodeURIComponent(data.paymentId)}/approve`, {
        method: "POST",
      });
      if (!approve.ok) {
        return { ok: false, code: "approve_failed", error: `Pi approve returned ${approve.status}` };
      }
      approvedPaymentIds.add(data.paymentId);
      return { ok: true };
    } catch (err) {
      return { ok: false, code: "exception", error: err instanceof Error ? err.message : "approval failed" };
    }
  });

type CompleteInput = { paymentId: string; txid: string };

/**
 * Complete a Pi payment after the user has signed the Pi blockchain tx.
 * Calls POST /v2/payments/:id/complete with the txid. Dedup'd by paymentId so
 * a retry (incomplete-payment-found, network blips) never double-grants.
 */
export const completePiPayment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown): CompleteInput => {
    if (!data || typeof data !== "object") throw new Error("invalid payload");
    const d = data as Partial<CompleteInput>;
    if (typeof d.paymentId !== "string" || d.paymentId.length < 4 || d.paymentId.length > 256) {
      throw new Error("paymentId is required");
    }
    if (typeof d.txid !== "string" || d.txid.length < 4 || d.txid.length > 256) {
      throw new Error("txid is required");
    }
    return { paymentId: d.paymentId, txid: d.txid };
  })
  .handler(async ({ data }): Promise<
    | { ok: true; credits?: number; alreadyGranted?: boolean; balance?: number }
    | { ok: false; code: string; error: string }
  > => {
    try {
      // Re-validate the on-chain payment before crediting anything.
      const lookup = await piFetch(`/v2/payments/${encodeURIComponent(data.paymentId)}`);
      if (!lookup.ok) return { ok: false, code: "lookup_failed", error: `Pi lookup returned ${lookup.status}` };
      const payment = (await lookup.json()) as {
        amount: number;
        memo: string;
        metadata: Record<string, unknown>;
        user_uid?: string;
      };
      const v = validateAgainstCatalog(payment);
      if (!v.ok) return v;

      // Idempotent: if we already credited this paymentId, return the balance.
      if (completedPaymentIds.has(data.paymentId)) {
        const uid = payment.user_uid ?? "";
        return {
          ok: true,
          alreadyGranted: true,
          credits: v.product.credits,
          balance: uid ? balances.get(uid) ?? 0 : undefined,
        };
      }

      const res = await piFetch(`/v2/payments/${encodeURIComponent(data.paymentId)}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txid: data.txid }),
      });
      if (!res.ok) return { ok: false, code: "complete_failed", error: `Pi complete returned ${res.status}` };

      completedPaymentIds.add(data.paymentId);

      const uid = payment.user_uid ?? "";
      let nextBalance: number | undefined;
      if (uid) {
        nextBalance = (balances.get(uid) ?? 0) + v.product.credits;
        balances.set(uid, nextBalance);
        const list = ledgers.get(uid) ?? [];
        list.push({
          paymentId: data.paymentId,
          sku: v.product.sku as PiProductSku,
          packName: v.product.name,
          amount: v.product.amount,
          credits: v.product.credits,
          status: "completed",
          txid: data.txid,
          ts: Date.now(),
        });
        ledgers.set(uid, list);
      }
      return { ok: true, credits: v.product.credits, balance: nextBalance };
    } catch (err) {
      return { ok: false, code: "exception", error: err instanceof Error ? err.message : "completion failed" };
    }
  });

/**
 * Authoritative balance + server-side purchase ledger for the signed-in user.
 * Validates the access token via /v2/me before returning anything.
 */
export const getCreditsState = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    if (!data || typeof data !== "object") throw new Error("invalid payload");
    const t = (data as { accessToken?: unknown }).accessToken;
    if (typeof t !== "string" || t.length < 8 || t.length > 4096) {
      throw new Error("accessToken is required");
    }
    return { accessToken: t };
  })
  .handler(async ({ data }): Promise<
    | { ok: true; balance: number; purchases: PurchaseRecord[] }
    | { ok: false; error: string }
  > => {
    const uid = await resolveUidFromAccessToken(data.accessToken);
    if (!uid) return { ok: false, error: "Unable to verify Pi access token" };
    return {
      ok: true,
      balance: balances.get(uid) ?? 0,
      purchases: ledgers.get(uid) ?? [],
    };
  });

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
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      // 1) Fetch the payment from Pi and verify it matches what we expect.
      const lookup = await piFetch(`/v2/payments/${encodeURIComponent(data.paymentId)}`);
      if (!lookup.ok) return { ok: false, error: `Pi lookup returned ${lookup.status}` };
      const payment = (await lookup.json()) as {
        amount: number;
        memo: string;
        metadata: Record<string, unknown>;
      };

      // Validate the SKU + amount declared in metadata against our catalog.
      const sku = (payment.metadata?.sku as string | undefined) ?? "";
      const product = (PI_PRODUCTS as Record<string, { amount: number; memo: string }>)[sku];
      if (!product) return { ok: false, error: "Unknown product SKU" };
      if (Number(payment.amount) !== Number(product.amount)) {
        return { ok: false, error: "Payment amount does not match the product price" };
      }
      if (payment.memo !== product.memo) {
        return { ok: false, error: "Payment memo does not match the product" };
      }
      // Sanity check vs the frontend's declared expectation.
      if (Number(data.expected.amount) !== Number(product.amount)) {
        return { ok: false, error: "Expected amount mismatch" };
      }

      // 2) Approve the payment.
      const approve = await piFetch(`/v2/payments/${encodeURIComponent(data.paymentId)}/approve`, {
        method: "POST",
      });
      if (!approve.ok) {
        return { ok: false, error: `Pi approve returned ${approve.status}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "approval failed" };
    }
  });

type CompleteInput = { paymentId: string; txid: string };

/**
 * Complete a Pi payment after the user has signed the Pi blockchain tx.
 * Calls POST /v2/payments/:id/complete with the txid.
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
  .handler(async ({ data }): Promise<{ ok: true; credits?: number } | { ok: false; error: string }> => {
    try {
      const res = await piFetch(`/v2/payments/${encodeURIComponent(data.paymentId)}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txid: data.txid }),
      });
      if (!res.ok) return { ok: false, error: `Pi complete returned ${res.status}` };

      // Look up the SKU again so we can return the entitlement amount.
      const lookup = await piFetch(`/v2/payments/${encodeURIComponent(data.paymentId)}`);
      if (lookup.ok) {
        const payment = (await lookup.json()) as { metadata?: { sku?: string } };
        const sku = payment.metadata?.sku ?? "";
        const product = (PI_PRODUCTS as Record<string, { credits: number }>)[sku];
        if (product) return { ok: true, credits: product.credits };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "completion failed" };
    }
  });

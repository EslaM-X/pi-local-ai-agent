import { createServerFn } from "@tanstack/react-start";

export type PiSessionUser = {
  uid: string;
  username: string;
};

/**
 * Server-side validation of a Pi Network access token.
 * Per https://pi-apps.github.io/pi-sdk-docs/quick-start/genai/Authentication
 * we MUST validate the access token by calling GET https://api.minepi.com/v2/me
 * with `Authorization: Bearer <accessToken>` before establishing a session.
 * No Pi Network API key is required for this flow.
 */
export const validatePiToken = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    if (
      !data ||
      typeof data !== "object" ||
      typeof (data as { accessToken?: unknown }).accessToken !== "string"
    ) {
      throw new Error("accessToken (string) is required");
    }
    const accessToken = (data as { accessToken: string }).accessToken.trim();
    if (accessToken.length < 8 || accessToken.length > 4096) {
      throw new Error("accessToken has an invalid length");
    }
    return { accessToken };
  })
  .handler(async ({ data }): Promise<{ ok: true; user: PiSessionUser } | { ok: false; error: string }> => {
    try {
      const res = await fetch("https://api.minepi.com/v2/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${data.accessToken}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        return { ok: false, error: `Pi /v2/me returned ${res.status}` };
      }
      const body = (await res.json()) as { uid?: string; username?: string };
      if (!body?.uid || !body?.username) {
        return { ok: false, error: "Pi /v2/me returned an invalid payload" };
      }
      // Session is established here. For now we return the verified identity;
      // persistent sessions can be layered on later (cookie/JWT) without changing the contract.
      return { ok: true, user: { uid: body.uid, username: body.username } };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Network error validating Pi token" };
    }
  });

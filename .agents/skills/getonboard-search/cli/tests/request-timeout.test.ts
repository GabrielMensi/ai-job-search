import { afterEach, describe, expect, test } from "bun:test";
import { apiFetch } from "../src/helpers";

// A stalled upstream connection (accepted socket, no response) would otherwise
// hang the CLI forever - fetch has no default timeout. Assert the request
// wrapper carries an AbortSignal timeout. Fails on the pre-fix code (no signal).
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("apiFetch", () => {
  test("passes an AbortSignal timeout to fetch", async () => {
    let init: RequestInit | undefined;
    globalThis.fetch = (async (_url: string | URL | Request, i?: RequestInit) => {
      init = i;
      return jsonResponse({ data: [], meta: { page: 1, per_page: 50, total_pages: 0 } });
    }) as unknown as typeof fetch;

    await apiFetch("https://www.getonbrd.com/api/v0/search/jobs?query=react");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  test("returns null on 404 instead of throwing", async () => {
    globalThis.fetch = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    expect(await apiFetch("https://www.getonbrd.com/api/v0/search/jobs?query=doesnotexist")).toBeNull();
  });

  test("retries on 429 then succeeds", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) return new Response("", { status: 429 });
      return jsonResponse({ data: [], meta: { page: 1, per_page: 50, total_pages: 0 } });
    }) as unknown as typeof fetch;

    const data = await apiFetch<{ meta: { total_pages: number } }>("https://www.getonbrd.com/api/v0/search/jobs?query=react");
    expect(data?.meta.total_pages).toBe(0);
    expect(calls).toBe(2);
  });

  test("surfaces the API's own clean error message on a non-2xx, non-retryable response", async () => {
    globalThis.fetch = (async () =>
      jsonResponse({ message: "Country code should be an ISO 3166-1 alpha-2 code", code: "unprocessable_content" }, 422)) as unknown as typeof fetch;
    await expect(apiFetch("https://www.getonbrd.com/api/v0/search/jobs?country_code=ARG")).rejects.toThrow(
      "Country code should be an ISO 3166-1 alpha-2 code",
    );
  });
});

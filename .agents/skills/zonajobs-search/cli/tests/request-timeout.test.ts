import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { apiFetch, __resetSessionCacheForTests } from "../src/helpers";

// A stalled upstream connection (accepted socket, no response) would otherwise
// hang the CLI forever - fetch has no default timeout. Assert the request
// wrapper carries an AbortSignal timeout on both the warm-up page fetch and
// the actual API call. Also covers the 404 -> null and 429-retry behavior
// that's easy to get wrong when wiring a new portal's backoff.
const originalFetch = globalThis.fetch;
beforeEach(() => {
  __resetSessionCacheForTests();
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("apiFetch request timeout and resilience", () => {
  test("passes an AbortSignal timeout to every request (warm-up GET + API call)", async () => {
    const inits: (RequestInit | undefined)[] = [];
    globalThis.fetch = (async (_url: string | URL | Request, i?: RequestInit) => {
      inits.push(i);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    await apiFetch("/api/avisos/searchV2?pageSize=1&page=0", {
      method: "POST",
      body: { filtros: [], query: "", internacional: false },
    });

    // One warm-up GET (Cloudflare cookie handshake) plus the real API call.
    expect(inits.length).toBeGreaterThanOrEqual(2);
    for (const init of inits) {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  test("returns null on 404 instead of throwing", async () => {
    globalThis.fetch = (async (url: string | URL | Request) => {
      if (String(url).includes("empleos.html")) return new Response("<html></html>", { status: 200 });
      return new Response("", { status: 404 });
    }) as unknown as typeof fetch;

    expect(await apiFetch("/api/candidates/fichaAvisoNormalizada/999999999")).toBeNull();
  });

  test("retries on 429 then succeeds", async () => {
    let calls = 0;
    globalThis.fetch = (async (url: string | URL | Request) => {
      if (String(url).includes("empleos.html")) return new Response("<html></html>", { status: 200 });
      calls++;
      if (calls === 1) return new Response("", { status: 429 });
      return new Response(JSON.stringify({ hello: "world" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const result = await apiFetch<{ hello: string }>("/api/avisos/searchV2?pageSize=1&page=0", {
      method: "POST",
      body: { filtros: [], query: "", internacional: false },
    });
    expect(result).toEqual({ hello: "world" });
    expect(calls).toBe(2);
  });

  test("the warm-up cookie is fetched once and cached across multiple apiFetch calls", async () => {
    let warmUpCalls = 0;
    globalThis.fetch = (async (url: string | URL | Request) => {
      if (String(url).includes("empleos.html")) {
        warmUpCalls++;
        return new Response("<html></html>", { status: 200 });
      }
      return new Response(JSON.stringify({ n: warmUpCalls }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    await apiFetch("/api/avisos/total");
    await apiFetch("/api/avisos/total");
    expect(warmUpCalls).toBe(1);
  });
});

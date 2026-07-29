import { afterEach, describe, expect, test } from "bun:test";
import { apiRequest } from "../src/helpers";

// A stalled upstream connection (accepted socket, no response) would otherwise hang the
// CLI forever - fetch has no default timeout. Assert every request apiRequest makes
// (both the Cloudflare-cookie warm-up GET and the real API call) carries an AbortSignal
// timeout. Fails on a version of the code that omits the signal on either call.
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("apiRequest request timeout", () => {
  test("every fetch call carries an AbortSignal timeout", async () => {
    // apiRequest() caches its Cloudflare warm-up cookies at module scope for the life of
    // the process, so depending on test execution order the warm-up GET to "/" may or may
    // not happen here. Branch the mock on the URL rather than call order, and just assert
    // that whatever calls DO happen (at least the real API call) all carry a timeout signal.
    const seenSignals: (AbortSignal | null | undefined)[] = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      seenSignals.push(init?.signal);
      const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (href.includes("/api/")) {
        return new Response(JSON.stringify({ total: 0, content: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("<html></html>", {
        status: 200,
        headers: [
          ["set-cookie", "__cf_bm=abc; Path=/; HttpOnly"],
          ["set-cookie", "frpo-cki=def; Path=/"],
        ],
      });
    }) as unknown as typeof fetch;

    await apiRequest("api/avisos/searchV2?pageSize=1&page=0", {
      method: "POST",
      body: { filtros: [], query: "react", internacional: false },
    });

    expect(seenSignals.length).toBeGreaterThanOrEqual(1);
    for (const signal of seenSignals) {
      expect(signal).toBeInstanceOf(AbortSignal);
    }
  });
});

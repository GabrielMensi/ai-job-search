import { afterEach, describe, expect, test } from "bun:test";
import { apiFetch } from "../src/helpers";

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
      return jsonResponse([{ legal: "..." }]);
    }) as unknown as typeof fetch;

    await apiFetch("https://remoteok.com/api");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  test("strips the leading legal-notice element, keeps only real jobs", async () => {
    globalThis.fetch = (async () =>
      jsonResponse([{ legal: "attribution notice" }, { id: "1", position: "Engineer" }])) as unknown as typeof fetch;
    const jobs = await apiFetch("https://remoteok.com/api");
    expect(jobs.length).toBe(1);
    expect(jobs[0].id).toBe("1");
  });

  test("returns [] on 404 instead of throwing", async () => {
    globalThis.fetch = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    expect(await apiFetch("https://remoteok.com/api")).toEqual([]);
  });

  test("retries on 429 then succeeds", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) return new Response("", { status: 429 });
      return jsonResponse([{ legal: "..." }, { id: "1", position: "Engineer" }]);
    }) as unknown as typeof fetch;

    const jobs = await apiFetch("https://remoteok.com/api");
    expect(jobs.length).toBe(1);
    expect(calls).toBe(2);
  });

  test("non-array body -> empty result, not a crash", async () => {
    globalThis.fetch = (async () => jsonResponse({ not: "an array" })) as unknown as typeof fetch;
    expect(await apiFetch("https://remoteok.com/api")).toEqual([]);
  });
});

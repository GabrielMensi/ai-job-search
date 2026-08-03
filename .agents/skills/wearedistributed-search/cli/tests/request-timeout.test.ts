import { afterEach, describe, expect, test } from "bun:test";
import { htmlFetch } from "../src/helpers";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("htmlFetch", () => {
  test("passes an AbortSignal timeout to fetch", async () => {
    let init: RequestInit | undefined;
    globalThis.fetch = (async (_url: string | URL | Request, i?: RequestInit) => {
      init = i;
      return new Response("<html></html>", { status: 200 });
    }) as unknown as typeof fetch;

    await htmlFetch("https://wearedistributed.org/remote-jobs/latam");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  test("returns null on 404 instead of throwing", async () => {
    globalThis.fetch = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    expect(await htmlFetch("https://wearedistributed.org/job/nope")).toBeNull();
  });

  test("retries on 429 then succeeds", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) return new Response("", { status: 429 });
      return new Response("<html>ok</html>", { status: 200 });
    }) as unknown as typeof fetch;

    const html = await htmlFetch("https://wearedistributed.org/remote-jobs/latam");
    expect(html).toBe("<html>ok</html>");
    expect(calls).toBe(2);
  });
});

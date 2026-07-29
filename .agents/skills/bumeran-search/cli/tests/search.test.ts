import { afterEach, describe, expect, test } from "bun:test";
import { runSearch } from "../src/commands/search";

const originalFetch = globalThis.fetch;
const originalStdoutWrite = process.stdout.write;

interface RawItem {
  id: number;
  titulo: string;
  empresa: string | null;
  localizacion: string | null;
  fechaPublicacion: string | null;
}

// apiRequest() caches its Cloudflare warm-up cookies at module scope for the life of the
// process, so a later test in this file may skip the warm-up GET entirely. Branch on the
// URL (an "/api/" path is the real call; anything else is the warm-up) rather than on call
// order, so this mock is correct regardless of whether warm-up already happened.
function mockApi(items: RawItem[]) {
  globalThis.fetch = (async (url: string | URL | Request) => {
    const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    if (href.includes("/api/")) {
      return new Response(JSON.stringify({ total: items.length, content: items }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("<html></html>", { status: 200 });
  }) as unknown as typeof fetch;
}

function captureStdout(): { get: () => string } {
  let out = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  return { get: () => out };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalStdoutWrite;
});

describe("runSearch", () => {
  test("--limit 0 emits zero results", async () => {
    mockApi([
      { id: 1, titulo: "Engineer", empresa: "Acme", localizacion: "Buenos Aires", fechaPublicacion: "23-07-2026" },
    ]);
    const stdout = captureStdout();

    const code = await runSearch({ jobage: 9999, page: 1, limit: 0, format: "json" });

    expect(code).toBe(0);
    expect(JSON.parse(stdout.get()).results).toHaveLength(0);
  });

  test("--location filters client-side on the location substring", async () => {
    mockApi([
      { id: 1, titulo: "Dev A", empresa: "Acme", localizacion: "Capital Federal, Buenos Aires", fechaPublicacion: "23-07-2026" },
      { id: 2, titulo: "Dev B", empresa: "Acme", localizacion: "Rosario, Santa Fe", fechaPublicacion: "23-07-2026" },
    ]);
    const stdout = captureStdout();

    const code = await runSearch({ location: "Rosario", jobage: 9999, page: 1, format: "json" });

    expect(code).toBe(0);
    const results = JSON.parse(stdout.get()).results;
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("2");
  });

  test("--jobage filters out postings older than N days", async () => {
    const now = new Date();
    const oldDate = new Date(now.getTime() - 40 * 86400000);
    const dd = (d: Date) => String(d.getUTCDate()).padStart(2, "0");
    const mm = (d: Date) => String(d.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = (d: Date) => d.getUTCFullYear();

    mockApi([
      { id: 1, titulo: "Fresh", empresa: null, localizacion: null, fechaPublicacion: `${dd(now)}-${mm(now)}-${yyyy(now)}` },
      { id: 2, titulo: "Stale", empresa: null, localizacion: null, fechaPublicacion: `${dd(oldDate)}-${mm(oldDate)}-${yyyy(oldDate)}` },
    ]);
    const stdout = captureStdout();

    const code = await runSearch({ jobage: 7, page: 1, format: "json" });

    expect(code).toBe(0);
    const results = JSON.parse(stdout.get()).results;
    expect(results.map((r: { id: string }) => r.id)).toEqual(["1"]);
  });

  test("missing fields on a result item become null, not omitted", async () => {
    mockApi([{ id: 5, titulo: "Role", empresa: null, localizacion: null, fechaPublicacion: null }]);
    const stdout = captureStdout();

    await runSearch({ jobage: 9999, page: 1, format: "json" });

    const [result] = JSON.parse(stdout.get()).results;
    expect(result.company).toBeNull();
    expect(result.location).toBeNull();
    expect(result.date).toBeNull();
    expect(result.url).toContain("5.html");
  });
});

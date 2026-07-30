import { describe, test, expect } from "bun:test";
import { runCLI, parseJSON } from "./helpers";

interface JobCard {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  date: string | null;
  url: string;
}

interface SearchResponse {
  meta: { count: number; page: number; totalCount: number };
  results: JobCard[];
}

// Live smoke test against the real Himalayas API (low volume: a couple of requests).
describe("live search smoke test", () => {
  test("search for a common keyword filtered to Argentina returns real results", async () => {
    const result = await runCLI(["search", "-q", "react", "-l", "Argentina", "--limit", "5"]);
    const data = parseJSON<SearchResponse>(result);

    expect(data.results.length).toBeGreaterThan(0);
    const first = data.results[0];
    expect(first.id).toBeTruthy();
    expect(first.title).toBeTruthy();
    expect(first.url).toMatch(/^https:\/\/himalayas\.app\/companies\/.+\/jobs\/.+/);
    // Every result must carry the contract-required fields, even if some are null.
    for (const job of data.results) {
      expect(job).toHaveProperty("id");
      expect(job).toHaveProperty("title");
      expect(job).toHaveProperty("company");
      expect(job).toHaveProperty("location");
      expect(job).toHaveProperty("date");
      expect(job).toHaveProperty("url");
    }
  });

  test("an invalid country filter is surfaced as a clean SEARCH_FAILED error, not a crash", async () => {
    const result = await runCLI(["search", "-l", "not-a-real-country-xyz"]);
    expect(result.exitCode).toBe(1);
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("SEARCH_FAILED");
    expect(err.error).toMatch(/country/i);
  });
});

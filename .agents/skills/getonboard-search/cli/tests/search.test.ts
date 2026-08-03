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
  meta: { count: number; page: number; totalPages: number | null };
  results: JobCard[];
}

// Live smoke test against the real GetOnBoard API (low volume: a couple of requests).
describe("live search smoke test", () => {
  test("search for a common keyword filtered to Argentina returns real results", async () => {
    const result = await runCLI(["search", "-q", "react", "-l", "Argentina", "--limit", "5"]);
    const data = parseJSON<SearchResponse>(result);

    expect(data.results.length).toBeGreaterThan(0);
    const first = data.results[0];
    expect(first.id).toBeTruthy();
    expect(first.title).toBeTruthy();
    expect(first.url).toMatch(/^https:\/\/www\.getonbrd\.com\/jobs\/.+/);
    for (const job of data.results) {
      expect(job).toHaveProperty("id");
      expect(job).toHaveProperty("title");
      expect(job).toHaveProperty("company");
      expect(job).toHaveProperty("location");
      expect(job).toHaveProperty("date");
      expect(job).toHaveProperty("url");
    }
  });

  test("page 2 returns a different slice than page 1 - real pagination, not a no-op", async () => {
    const page1 = parseJSON<SearchResponse>(await runCLI(["search", "-l", "Chile", "--page", "1", "--limit", "3"]));
    const page2 = parseJSON<SearchResponse>(await runCLI(["search", "-l", "Chile", "--page", "2", "--limit", "3"]));
    expect(page1.results.length).toBeGreaterThan(0);
    expect(page2.results.length).toBeGreaterThan(0);
    expect(page1.results[0].id).not.toBe(page2.results[0].id);
  });

  test("detail on a real id from a live search returns full description", async () => {
    const searchResult = await runCLI(["search", "-q", "developer", "-l", "Argentina", "--limit", "1"]);
    const data = parseJSON<SearchResponse>(searchResult);
    expect(data.results.length).toBeGreaterThan(0);
    const id = data.results[0].id;
    expect(id).toContain("/"); // composite "<companySlug>/<jobSlug>" id

    const detailResult = await runCLI(["detail", id, "--format", "plain"]);
    expect(detailResult.exitCode).toBe(0);
    expect(detailResult.stdout.length).toBeGreaterThan(0);
    expect(detailResult.stdout).not.toContain("&amp;");
    expect(detailResult.stdout).not.toMatch(/<[a-z]+>/i);
  });
});

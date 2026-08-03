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

// Live smoke test against the real SimplyHired Argentina site (low volume: a
// couple of requests).
describe("live search smoke test", () => {
  test("search for a common role, filtered by location, returns real results", async () => {
    const result = await runCLI(["search", "-q", "developer", "-l", "Buenos Aires", "--limit", "5"]);
    const data = parseJSON<SearchResponse>(result);

    expect(data.results.length).toBeGreaterThan(0);
    const first = data.results[0];
    expect(first.id).toBeTruthy();
    expect(first.title).toBeTruthy();
    expect(first.date).toBeTruthy(); // real per-job date, unlike latojobs/wearedistributed
    expect(first.url).toMatch(/^https:\/\/www\.simplyhired\.com\.ar\/job\/.+/);
    for (const job of data.results) {
      expect(job).toHaveProperty("id");
      expect(job).toHaveProperty("title");
      expect(job).toHaveProperty("company");
      expect(job).toHaveProperty("location");
      expect(job).toHaveProperty("date");
      expect(job).toHaveProperty("url");
    }
  });

  test("detail on a real id from a live search returns full description", async () => {
    const searchResult = await runCLI(["search", "-q", "developer", "--limit", "1"]);
    const data = parseJSON<SearchResponse>(searchResult);
    expect(data.results.length).toBeGreaterThan(0);
    const id = data.results[0].id;

    const detailResult = await runCLI(["detail", id, "--format", "plain"]);
    expect(detailResult.exitCode).toBe(0);
    expect(detailResult.stdout.length).toBeGreaterThan(0);
    expect(detailResult.stdout).not.toContain("&amp;");
    expect(detailResult.stdout).not.toMatch(/<[a-z]+>/i);
  });
});

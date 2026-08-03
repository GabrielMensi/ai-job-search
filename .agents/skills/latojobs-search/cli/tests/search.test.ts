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

// Live smoke test against the real LatoJobs site (low volume: a couple of requests).
describe("live search smoke test", () => {
  test("search for a common role, filtered to a real country, returns real results", async () => {
    const result = await runCLI(["search", "-q", "developer", "-l", "argentina", "--limit", "5"]);
    const data = parseJSON<SearchResponse>(result);

    expect(data.results.length).toBeGreaterThan(0);
    const first = data.results[0];
    expect(first.id).toBeTruthy();
    expect(first.title).toBeTruthy();
    expect(first.url).toMatch(/^https:\/\/www\.latojobs\.com\/jobs\/.+/);
    for (const job of data.results) {
      expect(job).toHaveProperty("id");
      expect(job).toHaveProperty("title");
      expect(job.title.length).toBeGreaterThan(0); // referenced/blank cards must be dropped, never emitted
      expect(job).toHaveProperty("company");
      expect(job).toHaveProperty("location");
      expect(job).toHaveProperty("date");
      expect(job).toHaveProperty("url");
    }
  });

  test("an unrecognized location slug is a clean NOT_FOUND, not a crash", async () => {
    const result = await runCLI(["search", "-l", "not-a-real-country-xyz"]);
    expect(result.exitCode).toBe(1);
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("NOT_FOUND");
  });

  test("detail on a real id from a live search returns full description", async () => {
    const searchResult = await runCLI(["search", "-l", "argentina", "--limit", "1"]);
    const data = parseJSON<SearchResponse>(searchResult);
    expect(data.results.length).toBeGreaterThan(0);
    const id = data.results[0].id;

    const detailResult = await runCLI(["detail", id, "--format", "plain"]);
    expect(detailResult.exitCode).toBe(0);
    expect(detailResult.stdout.length).toBeGreaterThan(0);
    expect(detailResult.stdout).not.toContain("&lt;");
    expect(detailResult.stdout).not.toMatch(/<[a-z]+>/i);
  });
});

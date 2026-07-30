import { describe, test, expect } from "bun:test";
import {
  cleanDescription,
  isoFromUnixSeconds,
  daysSinceUnixSeconds,
  formatLocation,
  formatSalary,
  idFromGuid,
  parseDetailId,
  toJobCard,
  toJobDetail,
  type RawJob,
} from "../src/helpers";

// Minimal but structurally faithful RawJob fixture, modeled on real responses
// captured from /jobs/api/search during Step 2 investigation.
function rawJob(overrides: Partial<RawJob> = {}): RawJob {
  return {
    title: "Senior React Native Developer",
    excerpt: "We are looking for a Senior React Native Developer to join our team.",
    companyName: "lemon.io",
    companySlug: "lemon-io",
    companyLogo: "https://cdn-images.himalayas.app/x.png",
    employmentType: "Full Time",
    minSalary: null,
    maxSalary: null,
    salaryPeriod: "annual",
    seniority: ["Senior"],
    currency: null,
    locationRestrictions: [],
    timezoneRestrictions: [],
    categories: ["React", "React Native"],
    parentCategories: ["Engineering"],
    description: "<p>We build things.</p><ul><li>Ship &amp; iterate</li></ul>",
    pubDate: 1785435800, // unix SECONDS - see helpers.ts quirk note
    expiryDate: 1790619800,
    applicationLink: "https://himalayas.app/companies/lemon-io/jobs/senior-react-native-developer-531156378",
    guid: "https://himalayas.app/companies/lemon-io/jobs/senior-react-native-developer-531156378",
    ...overrides,
  };
}

describe("idFromGuid / parseDetailId", () => {
  test("extracts company/job slug pair from a real guid", () => {
    const id = idFromGuid(
      "https://himalayas.app/companies/lemon-io/jobs/senior-react-native-developer-531156378",
      "lemon-io",
    );
    expect(id).toBe("lemon-io/senior-react-native-developer-531156378");
  });

  test("falls back to bare companySlug if guid doesn't match the expected shape", () => {
    expect(idFromGuid("https://example.com/weird", "acme")).toBe("acme");
  });

  test("parseDetailId accepts the CLI's own id form", () => {
    expect(parseDetailId("lemon-io/senior-react-native-developer-531156378")).toEqual({
      companySlug: "lemon-io",
      jobSlug: "senior-react-native-developer-531156378",
    });
  });

  test("parseDetailId accepts a hyphenated company slug — regression", () => {
    // Live bug caught during Step 4: the first version's regex allowed hyphens only
    // in the job-slug segment, so "mutt-data/full-stack-python-react" (a real search
    // result) was rejected as BAD_ID even though it's exactly the CLI's own id shape.
    expect(parseDetailId("mutt-data/full-stack-python-react")).toEqual({
      companySlug: "mutt-data",
      jobSlug: "full-stack-python-react",
    });
  });

  test("parseDetailId accepts a full himalayas.app job URL", () => {
    expect(
      parseDetailId("https://himalayas.app/companies/nvidia/jobs/senior-systems-software-engineer-414314069"),
    ).toEqual({ companySlug: "nvidia", jobSlug: "senior-systems-software-engineer-414314069" });
  });

  test("parseDetailId returns null for unparseable input", () => {
    expect(parseDetailId("not a valid id")).toBeNull();
    expect(parseDetailId("")).toBeNull();
  });
});

describe("date handling (pubDate/expiryDate are unix SECONDS, not ms)", () => {
  test("isoFromUnixSeconds decodes a real captured pubDate to the correct calendar date", () => {
    // Captured live 2026-07-30; as milliseconds this would decode to Jan 1970.
    expect(isoFromUnixSeconds(1785435800)).toBe("2026-07-30T18:23:20.000Z");
  });

  test("isoFromUnixSeconds returns null for null/undefined", () => {
    expect(isoFromUnixSeconds(null)).toBeNull();
    expect(isoFromUnixSeconds(undefined)).toBeNull();
  });

  test("daysSinceUnixSeconds computes whole days relative to a fixed 'now'", () => {
    const now = Date.UTC(2026, 6, 30); // 2026-07-30 UTC
    const tenDaysAgoSec = now / 1000 - 10 * 86400;
    expect(daysSinceUnixSeconds(tenDaysAgoSec, now)).toBe(10);
  });
});

describe("formatLocation", () => {
  test("empty restrictions -> Worldwide (not null/unknown)", () => {
    expect(formatLocation([])).toBe("Worldwide");
    expect(formatLocation(undefined)).toBe("Worldwide");
  });

  test("few restrictions -> joined names", () => {
    expect(formatLocation(["Argentina"])).toBe("Argentina");
  });

  test("many restrictions -> truncated with a +N more suffix", () => {
    const names = ["Argentina", "Brazil", "Chile", "Colombia", "Peru"];
    expect(formatLocation(names)).toBe("Argentina, Brazil, Chile +2 more");
  });
});

describe("formatSalary", () => {
  test("both min and max disclosed", () => {
    expect(formatSalary({ minSalary: 120000, maxSalary: 180000, currency: "USD", salaryPeriod: "annual" })).toBe(
      "USD 120,000–180,000/year",
    );
  });

  test("neither disclosed -> null, not a fabricated range", () => {
    expect(formatSalary({ minSalary: null, maxSalary: null, currency: null, salaryPeriod: "annual" })).toBeNull();
  });

  test("non-annual salaryPeriod is reflected in the suffix", () => {
    expect(formatSalary({ minSalary: 50, maxSalary: 70, currency: "USD", salaryPeriod: "hourly" })).toBe(
      "USD 50–70/hourly",
    );
  });

  test("only one bound disclosed", () => {
    expect(formatSalary({ minSalary: 100000, maxSalary: null, currency: "USD", salaryPeriod: "annual" })).toBe(
      "USD 100,000/year",
    );
  });
});

describe("cleanDescription", () => {
  test("strips tags, decodes entities, and keeps block breaks as newlines", () => {
    const html = "<p>Ship &amp; iterate</p><ul><li>Own the roadmap</li><li>Pair with design</li></ul>";
    const text = cleanDescription(html);
    expect(text).toContain("Ship & iterate");
    expect(text).toContain("Own the roadmap");
    expect(text).not.toContain("<");
  });

  test("null/empty input -> null", () => {
    expect(cleanDescription(null)).toBeNull();
    expect(cleanDescription("")).toBeNull();
  });
});

describe("toJobCard / toJobDetail", () => {
  test("toJobCard never omits the contract-required fields", () => {
    const card = toJobCard(rawJob());
    expect(card.id).toBe("lemon-io/senior-react-native-developer-531156378");
    expect(card.title).toBe("Senior React Native Developer");
    expect(card.company).toBe("lemon.io");
    expect(card.location).toBe("Worldwide");
    expect(card.date).toBe("2026-07-30T18:23:20.000Z");
    expect(card.url).toBe("https://himalayas.app/companies/lemon-io/jobs/senior-react-native-developer-531156378");
  });

  test("toJobDetail extends the card with full description and derived fields", () => {
    const detail = toJobDetail(rawJob());
    expect(detail.description).toContain("We build things.");
    expect(detail.seniority).toBe("Senior");
    expect(detail.employmentType).toBe("Full Time");
    expect(detail.salary).toBeNull();
    expect(detail.companyUrl).toBe("https://himalayas.app/companies/lemon-io");
    expect(detail.applyUrl).toBe(rawJob().applicationLink);
  });

  test("multiple seniority levels are joined, not truncated to the first", () => {
    const detail = toJobDetail(rawJob({ seniority: ["Mid-level", "Senior"] }));
    expect(detail.seniority).toBe("Mid-level, Senior");
  });
});

import { describe, test, expect } from "bun:test";
import {
  decodeHtmlEntities,
  cleanDescription,
  isoFromEpochSeconds,
  daysSinceEpochSeconds,
  resolveCountryCode,
  toJobCard,
  toJobDetail,
  parseDetailId,
  wordsFromSlug,
  buildExpandParam,
  type RawJob,
} from "../src/helpers";

// Minimal but structurally faithful fixture, modeled on a real expanded search
// response captured during Step 2/4 investigation.
function rawJob(overrides: Partial<RawJob["attributes"]> = {}): RawJob {
  return {
    id: "senior-full-stack-ruby-react-developer-ncube-remote",
    attributes: {
      title: "Senior Full-Stack (Ruby, React) Developer",
      description: "<ul><li>5+ years experience &amp; strong Ruby skills</li></ul>",
      remote: true,
      remote_modality: "remote_global",
      countries: ["Remote"],
      category_name: "Programming",
      min_salary: 5000,
      max_salary: 6000,
      published_at: 1785238000,
      applications_count: 12,
      seniority: { data: { id: "4", type: "seniority", attributes: { name: "Senior", locale_key: "senior" } } },
      modality: { data: { id: "1", type: "modality", attributes: { name: "Full time", locale_key: "full_time" } } },
      company: { data: { id: "ncube", type: "company", attributes: { name: "nCube" } } },
      ...overrides,
    },
  };
}

describe("decodeHtmlEntities", () => {
  test("decodes structural and Spanish-accent named entities", () => {
    expect(decodeHtmlEntities("consultor&iacute;a &amp; dise&ntilde;o")).toBe("consultoría & diseño");
  });

  test("an unrecognized named entity is left as-is, not silently dropped", () => {
    expect(decodeHtmlEntities("&notarealentity;")).toBe("&notarealentity;");
  });
});

describe("cleanDescription", () => {
  test("strips tags and decodes entities from the API's HTML description field", () => {
    const text = cleanDescription("<ul><li>5+ years experience &amp; strong Ruby skills</li></ul>");
    expect(text).toContain("5+ years experience & strong Ruby skills");
    expect(text).not.toContain("<");
  });

  test("null/empty -> null", () => {
    expect(cleanDescription(null)).toBeNull();
    expect(cleanDescription("")).toBeNull();
  });
});

describe("date handling (published_at is unix SECONDS)", () => {
  test("isoFromEpochSeconds decodes a real captured timestamp to the correct calendar date", () => {
    expect(isoFromEpochSeconds(1785458760)).toBe("2026-07-31T00:46:00.000Z");
  });

  test("isoFromEpochSeconds returns null for null/undefined", () => {
    expect(isoFromEpochSeconds(null)).toBeNull();
    expect(isoFromEpochSeconds(undefined)).toBeNull();
  });

  test("daysSinceEpochSeconds computes whole days relative to a fixed 'now'", () => {
    const now = Date.UTC(2026, 7, 1);
    const tenDaysAgoSec = now / 1000 - 10 * 86400;
    expect(daysSinceEpochSeconds(tenDaysAgoSec, now)).toBe(10);
  });
});

describe("resolveCountryCode", () => {
  test("resolves a covered market name, case-insensitively", () => {
    expect(resolveCountryCode("Argentina")).toBe("AR");
    expect(resolveCountryCode("chile")).toBe("CL");
    expect(resolveCountryCode("MEXICO")).toBe("MX");
  });

  test("passes through an already-alpha-2 code, uppercased", () => {
    expect(resolveCountryCode("ar")).toBe("AR");
    expect(resolveCountryCode("Co")).toBe("CO");
  });

  test("resolves accented market names", () => {
    expect(resolveCountryCode("México")).toBe("MX");
    expect(resolveCountryCode("Perú")).toBe("PE");
  });

  test("an uncovered market returns null, not a guess", () => {
    expect(resolveCountryCode("Brazil")).toBeNull();
    expect(resolveCountryCode("Uruguay")).toBeNull();
  });
});

describe("buildExpandParam", () => {
  test("returns the raw (unescaped) JSON array string, not pre-encoded", () => {
    // Regression: an earlier version pre-encoded this, which URLSearchParams
    // then double-encoded (%5B%22... became %255B%2522...), causing the live
    // API to reject the request with a 500 - see helpers.ts.
    const raw = buildExpandParam();
    expect(raw).toBe('["company","seniority","modality"]');
    expect(raw).not.toContain("%");
  });
});

describe("toJobCard / toJobDetail", () => {
  test("toJobCard's id is a '<companySlug>/<jobSlug>' composite, not the bare job slug", () => {
    const card = toJobCard(rawJob());
    expect(card.id).toBe("ncube/senior-full-stack-ruby-react-developer-ncube-remote");
    expect(card.title).toBe("Senior Full-Stack (Ruby, React) Developer");
    expect(card.company).toBe("nCube");
    expect(card.location).toBe("Remote");
    expect(card.date).toBe("2026-07-28T11:26:40.000Z");
    expect(card.url).toBe("https://www.getonbrd.com/jobs/senior-full-stack-ruby-react-developer-ncube-remote");
  });

  test("falls back to the bare job slug as id when company isn't expanded/present", () => {
    const card = toJobCard(rawJob({ company: undefined }));
    expect(card.id).toBe("senior-full-stack-ruby-react-developer-ncube-remote");
    expect(card.company).toBeNull();
  });

  test("toJobDetail extends the card with salary, seniority, employmentType, category, links", () => {
    const detail = toJobDetail(rawJob());
    expect(detail.seniority).toBe("Senior");
    expect(detail.employmentType).toBe("Full time");
    expect(detail.category).toBe("Programming");
    expect(detail.salary).toBe("$5,000–6,000");
    expect(detail.companyUrl).toBe("https://www.getonbrd.com/companies/ncube");
    expect(detail.applyUrl).toBe(
      "https://www.getonbrd.com/jobs/senior-full-stack-ruby-react-developer-ncube-remote/applications/new",
    );
    expect(detail.description).toContain("5+ years experience & strong Ruby skills");
  });

  test("salary: only one bound disclosed", () => {
    const detail = toJobDetail(rawJob({ min_salary: 4000, max_salary: null }));
    expect(detail.salary).toBe("$4,000");
  });

  test("salary: neither disclosed -> null, not a fabricated range", () => {
    const detail = toJobDetail(rawJob({ min_salary: null, max_salary: null }));
    expect(detail.salary).toBeNull();
  });
});

describe("parseDetailId", () => {
  test("accepts the CLI's own composite id", () => {
    expect(parseDetailId("ncube/senior-full-stack-ruby-react-developer-ncube-remote")).toEqual({
      companySlug: "ncube",
      jobSlug: "senior-full-stack-ruby-react-developer-ncube-remote",
    });
  });

  test("accepts a full job URL, with no company slug (query-fallback needed)", () => {
    expect(parseDetailId("https://www.getonbrd.com/jobs/senior-full-stack-ruby-react-developer-ncube-remote")).toEqual({
      companySlug: null,
      jobSlug: "senior-full-stack-ruby-react-developer-ncube-remote",
    });
  });

  test("accepts a bare job slug, with no company slug", () => {
    expect(parseDetailId("senior-full-stack-ruby-react-developer-ncube-remote")).toEqual({
      companySlug: null,
      jobSlug: "senior-full-stack-ruby-react-developer-ncube-remote",
    });
  });

  test("rejects empty input", () => {
    expect(parseDetailId("")).toBeNull();
    expect(parseDetailId("   ")).toBeNull();
  });
});

describe("wordsFromSlug", () => {
  test("keeps significant words, drops short ones and pure numbers", () => {
    expect(wordsFromSlug("senior-full-stack-ruby-react-developer-ncube-remote")).toBe(
      "senior full stack ruby",
    );
  });

  test("drops numeric-only segments (e.g. a disambiguating id suffix)", () => {
    expect(wordsFromSlug("backend-developer-acme-1234")).toBe("backend developer acme");
  });
});

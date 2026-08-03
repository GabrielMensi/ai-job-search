import { describe, test, expect } from "bun:test";
import {
  cleanDescription,
  isoFromEpoch,
  daysSinceEpoch,
  formatSalary,
  matchesLocation,
  toJobCard,
  toJobDetail,
  type RawJob,
} from "../src/helpers";

// Minimal but structurally faithful RawJob fixture, modeled on a real response
// captured from /api during Step 2 investigation.
function rawJob(overrides: Partial<RawJob> = {}): RawJob {
  return {
    id: "1135789",
    slug: "remote-patient-outreach-specialist-grapefruit-health-1135789",
    epoch: 1785600013,
    date: "2026-08-01T16:00:13+00:00",
    company: "Grapefruit Health",
    company_logo: "",
    position: "Patient Outreach Specialist",
    tags: ["hr", "customer support", "dev"],
    description: "&lt;p&gt;&lt;strong&gt;Patient Outreach Specialist&lt;/strong&gt;&lt;/p&gt;&lt;p&gt;Ship &amp;amp; iterate&lt;/p&gt;",
    location: "",
    apply_url: "https://remoteOK.com/remote-jobs/remote-patient-outreach-specialist-grapefruit-health-1135789",
    url: "https://remoteOK.com/remote-jobs/remote-patient-outreach-specialist-grapefruit-health-1135789",
    verified: true,
    salary_min: 0,
    salary_max: 0,
    logo: "",
    ...overrides,
  };
}

describe("cleanDescription — entity-decode BEFORE tag-strip", () => {
  test("reveals real HTML from RemoteOK's entity-escaped description and strips it", () => {
    const text = cleanDescription(rawJob().description);
    expect(text).toContain("Patient Outreach Specialist");
    expect(text).toContain("Ship & iterate");
    expect(text).not.toContain("<");
    expect(text).not.toContain("&lt;");
  });

  test("null/empty input -> null", () => {
    expect(cleanDescription(null)).toBeNull();
    expect(cleanDescription("")).toBeNull();
  });
});

describe("date handling (epoch is unix SECONDS)", () => {
  test("isoFromEpoch decodes a real captured epoch to the correct calendar date", () => {
    expect(isoFromEpoch(1785600013)).toBe("2026-08-01T16:00:13.000Z");
  });

  test("isoFromEpoch returns null for null/undefined", () => {
    expect(isoFromEpoch(null)).toBeNull();
    expect(isoFromEpoch(undefined)).toBeNull();
  });

  test("daysSinceEpoch computes whole days relative to a fixed 'now'", () => {
    const now = Date.UTC(2026, 7, 1);
    const tenDaysAgoSec = now / 1000 - 10 * 86400;
    expect(daysSinceEpoch(tenDaysAgoSec, now)).toBe(10);
  });
});

describe("formatSalary — 0/0 means undisclosed, not a real $0 salary", () => {
  test("both zero -> null", () => {
    expect(formatSalary(0, 0)).toBeNull();
  });

  test("both disclosed -> range", () => {
    expect(formatSalary(80000, 120000)).toBe("$80,000–120,000/year");
  });

  test("only one bound disclosed (other is 0/undisclosed)", () => {
    expect(formatSalary(90000, 0)).toBe("$90,000/year");
  });

  test("undefined bounds -> null", () => {
    expect(formatSalary(undefined, undefined)).toBeNull();
  });
});

describe("matchesLocation — best-effort text match, not a real filter", () => {
  test("matches on the location field", () => {
    const job = rawJob({ location: "Buenos Aires, Argentina" });
    expect(matchesLocation(job, "argentina")).toBe(true);
  });

  test("matches on description text when location field is empty", () => {
    const job = rawJob({ location: "", description: "Open to candidates in Latin America" });
    expect(matchesLocation(job, "latin america")).toBe(true);
  });

  test("no match", () => {
    const job = rawJob({ location: "Berlin, Germany", description: "Fully remote, EU only" });
    expect(matchesLocation(job, "argentina")).toBe(false);
  });
});

describe("toJobCard / toJobDetail", () => {
  test("toJobCard never omits the contract-required fields", () => {
    const card = toJobCard(rawJob());
    expect(card.id).toBe("1135789");
    expect(card.title).toBe("Patient Outreach Specialist");
    expect(card.company).toBe("Grapefruit Health");
    expect(card.location).toBeNull(); // empty string -> null, not ""
    expect(card.date).toBe("2026-08-01T16:00:13.000Z");
    expect(card.url).toBe(rawJob().url);
  });

  test("title/company entities are decoded — regression: live data returned raw '&amp;' in titles like 'Supply Chain &amp; Operations Specialist'", () => {
    const card = toJobCard(rawJob({ position: "Supply Chain &amp; Operations Specialist", company: "Miss &amp; Amara" }));
    expect(card.title).toBe("Supply Chain & Operations Specialist");
    expect(card.company).toBe("Miss & Amara");
  });

  test("toJobDetail extends the card with description, tags, salary, verified", () => {
    const detail = toJobDetail(rawJob());
    expect(detail.description).toContain("Patient Outreach Specialist");
    expect(detail.tags).toEqual(["hr", "customer support", "dev"]);
    expect(detail.salary).toBeNull();
    expect(detail.verified).toBe(true);
    expect(detail.applyUrl).toBe(rawJob().apply_url);
  });
});

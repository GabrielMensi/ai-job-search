import { describe, test, expect } from "bun:test";
import {
  decodeHtmlEntities,
  cleanDescription,
  isoFromEpochMs,
  daysSinceEpochMs,
  parseNextData,
  parseSearchPageData,
  parseDetailPageData,
  toJobCard,
  toJobDetail,
  type RawSearchJob,
} from "../src/helpers";

function rawSearchJob(overrides: Partial<RawSearchJob> = {}): RawSearchJob {
  return {
    jobKey: "h7-I4vl4sxphAdr0KJxkbL55M5TNRZ8UNPmO7lpIT12zyfpoZhVnEQ",
    title: "Full Stack Developer (.NET + Angular)",
    company: "Andersen Inc.",
    location: "Desde casa",
    snippet: "Certification compensation...",
    botUrl: "/job/h7-I4vl4sxphAdr0KJxkbL55M5TNRZ8UNPmO7lpIT12zyfpoZhVnEQ",
    dateOnIndeed: 1781182417379,
    jobTypes: ["Tiempo completo"],
    sponsored: true,
    ...overrides,
  };
}

describe("decodeHtmlEntities", () => {
  test("decodes structural and typographic named entities", () => {
    expect(decodeHtmlEntities("Sales &amp; Marketing &mdash; remote")).toBe("Sales & Marketing — remote");
  });

  test("decodes numeric entities", () => {
    expect(decodeHtmlEntities("&#39;quoted&#39;")).toBe("'quoted'");
  });
});

describe("date handling (dateOnIndeed/datePublished are unix MILLISECONDS)", () => {
  test("isoFromEpochMs decodes a real captured timestamp to the correct calendar date", () => {
    expect(isoFromEpochMs(1781182417379)).toBe("2026-06-11T12:53:37.379Z");
  });

  test("isoFromEpochMs returns null for null/undefined", () => {
    expect(isoFromEpochMs(null)).toBeNull();
    expect(isoFromEpochMs(undefined)).toBeNull();
  });

  test("daysSinceEpochMs computes whole days relative to a fixed 'now'", () => {
    const now = Date.UTC(2026, 7, 1);
    const tenDaysAgoMs = now - 10 * 86400000;
    expect(daysSinceEpochMs(tenDaysAgoMs, now)).toBe(10);
  });
});

describe("cleanDescription", () => {
  test("strips tags and decodes entities", () => {
    const html = "<p>Andersen is hiring a <b>Developer</b> &amp; more.</p>";
    const text = cleanDescription(html);
    expect(text).toBe("Andersen is hiring a Developer & more.");
  });

  test("null/empty -> null", () => {
    expect(cleanDescription(null)).toBeNull();
    expect(cleanDescription("")).toBeNull();
  });
});

describe("parseNextData / parseSearchPageData", () => {
  test("extracts jobs and meta from a faithful __NEXT_DATA__ fixture", () => {
    const nextData = {
      props: {
        pageProps: {
          jobs: [rawSearchJob()],
          resultCount: 626,
          currentPageNumber: 1,
        },
      },
    };
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>`;
    const parsed = parseNextData(html);
    expect(parsed).not.toBeNull();
    const { jobs, resultCount, currentPageNumber } = parseSearchPageData(parsed!);
    expect(jobs.length).toBe(1);
    expect(resultCount).toBe(626);
    expect(currentPageNumber).toBe(1);
  });

  test("returns null when no __NEXT_DATA__ script is present", () => {
    expect(parseNextData("<html><body>no data here</body></html>")).toBeNull();
  });

  test("returns null on malformed JSON rather than throwing", () => {
    expect(parseNextData('<script id="__NEXT_DATA__" type="application/json">{not json</script>')).toBeNull();
  });
});

describe("toJobCard", () => {
  test("never omits the contract-required fields", () => {
    const card = toJobCard(rawSearchJob());
    expect(card.id).toBe("h7-I4vl4sxphAdr0KJxkbL55M5TNRZ8UNPmO7lpIT12zyfpoZhVnEQ");
    expect(card.title).toBe("Full Stack Developer (.NET + Angular)");
    expect(card.company).toBe("Andersen Inc.");
    expect(card.location).toBe("Desde casa");
    expect(card.date).toBe("2026-06-11T12:53:37.379Z");
    expect(card.url).toBe("https://www.simplyhired.com.ar/job/h7-I4vl4sxphAdr0KJxkbL55M5TNRZ8UNPmO7lpIT12zyfpoZhVnEQ");
  });

  test("falls back to /job/<jobKey> when botUrl is missing", () => {
    const card = toJobCard(rawSearchJob({ botUrl: undefined as unknown as string }));
    expect(card.url).toBe("https://www.simplyhired.com.ar/job/h7-I4vl4sxphAdr0KJxkbL55M5TNRZ8UNPmO7lpIT12zyfpoZhVnEQ");
  });
});

describe("parseDetailPageData / toJobDetail", () => {
  test("maps a faithful detail-page fixture, decoding the apply URL", () => {
    const nextData = {
      props: {
        pageProps: {
          jobTitle: "Full Stack Developer (.NET + Angular)",
          employerName: "Andersen Inc.",
          employerCompanyPageUrl: "/browse-jobs/companies/Andersen",
          formattedLocation: "Desde casa",
          jobDescriptionHtml: "<p>Real description &amp; details.</p>",
          datePublished: 1781182417379,
          jobTypes: ["Indefinido", "Tiempo completo"],
          compensation: "",
          expired: false,
          expirationDate: null,
          encodedApplyUrl: "https%3A%2F%2Fapply.example.com%2Fjob%3Fid%3D123",
          sponsored: true,
        },
      },
    };
    const pp = parseDetailPageData(nextData)!;
    const detail = toJobDetail(pp, "h7-I4vl4sxphAdr0KJxkbL55M5TNRZ8UNPmO7lpIT12zyfpoZhVnEQ");
    expect(detail.description).toBe("Real description & details.");
    expect(detail.companyUrl).toBe("https://www.simplyhired.com.ar/browse-jobs/companies/Andersen");
    expect(detail.applyUrl).toBe("https://apply.example.com/job?id=123");
    expect(detail.compensation).toBeNull(); // empty string -> null, not ""
    expect(detail.sponsored).toBe(true);
    expect(detail.jobTypes).toEqual(["Indefinido", "Tiempo completo"]);
  });
});

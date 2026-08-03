import { describe, test, expect } from "bun:test";
import {
  unescapeRsc,
  cleanDescription,
  approxDaysFromRelative,
  parseSearchResults,
  parseCard,
  parseJobPostingLd,
  toJobDetail,
} from "../src/helpers";

// Minimal but structurally faithful fixture, modeled on a real RSC-streamed search
// page captured during Step 2/4 investigation - including the literal backslash-
// escaped quotes the raw response actually carries (see url-reference.md).
function fixtureSearchHtml(): string {
  return (
    '<script>self.__next_f.push([1,"13:[\\"$\\",\\"div\\",null,{\\"children\\":[[\\"$\\",\\"div\\",null,' +
    '{\\"children\\":[\\"$\\",\\"p\\",null,{\\"children\\":[\\"Showing \\",1,\\" of \\",23,\\" jobs\\"]}]}],' +
    '[\\"$\\",\\"div\\",null,{\\"children\\":[[\\"$\\",\\"div\\",\\"524ac18f-1148-4474-b326-6c6c329dc2ca\\",' +
    '{\\"className\\":\\"group rounded-lg border border-gray-200 bg-white p-2.5 hover:border-gray-300\\",' +
    '\\"children\\":[[\\"$\\",\\"div\\",null,{\\"children\\":[[\\"$\\",\\"$L14\\",null,{\\"href\\":\\"/companies/lumimeds\\",' +
    '\\"children\\":[\\"$\\",\\"div\\",null,{}]}],[\\"$\\",\\"$L14\\",null,{\\"href\\":\\"/jobs/524ac18f-1148-4474-b326-6c6c329dc2ca\\",' +
    '\\"children\\":[\\"$\\",\\"h3\\",null,{\\"className\\":\\"font-semibold\\",\\"children\\":\\"Content Creator (Growth) - LATAM\\"}]}],' +
    '[\\"$\\",\\"$L14\\",null,{\\"href\\":\\"/companies/lumimeds\\",\\"children\\":[\\"$\\",\\"p\\",null,{\\"className\\":\\"text-[13px]\\",' +
    '\\"children\\":\\"Lumimeds\\"}]}],[\\"$\\",\\"div\\",null,{\\"children\\":[[\\"$\\",\\"span\\",null,{\\"children\\":' +
    '[[\\"$\\",\\"svg\\",null,{\\"children\\":[[\\"$\\",\\"path\\",null,{\\"d\\":\\"M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0z\\"}],' +
    '[\\"$\\",\\"path\\",null,{\\"d\\":\\"M15 11a3 3 0 11-6 0z\\"}]]}],\\"Anywhere in LATAM\\"]}],null]}],' +
    '[\\"$\\",\\"div\\",null,{\\"className\\":\\"flex items-center justify-between text-[11px] text-gray-500\\",' +
    '\\"children\\":[[\\"$\\",\\"span\\",null,{\\"children\\":\\"5 days ago\\"}],[\\"$\\",\\"span\\",null,{\\"className\\":\\"font-medium\\",' +
    '\\"children\\":\\"Lead\\"}]]}]]}]]}]]}]]}]\\n"])</script>'
  );
}

// A card whose title/company are RSC-referenced ("$L<hex>") rather than inlined -
// verified live on a real page (see url-reference.md "some cards reference their
// data instead of inlining it").
function fixtureReferencedCardChunk(): string {
  return (
    '"className":"group rounded-lg border border-gray-200 bg-white p-2.5 hover:border-gray-300",' +
    '"children":[["$","div",null,{"children":[["$","$L14",null,{"href":"/jobs/1e791127-b730-4198-b6ff-f0159ac2ff99",' +
    '"children":"$L3b"}],"$L3c","$L3d"]}]]}]'
  );
}

describe("unescapeRsc", () => {
  test("un-escapes backslash-quoted RSC payload text into plain JSON-ish text", () => {
    const raw = '\\"className\\":\\"group rounded-lg';
    expect(unescapeRsc(raw)).toBe('"className":"group rounded-lg');
  });

  test("decodes \\uXXXX escapes (e.g. the raw JS escape for &)", () => {
    expect(unescapeRsc("Marketing Planning \\u0026 Finance")).toBe("Marketing Planning & Finance");
  });
});

describe("parseSearchResults — real card extraction from a faithful RSC fixture", () => {
  test("extracts id, title, company, location, and relative date", () => {
    const { cards, totalCount } = parseSearchResults(fixtureSearchHtml());
    expect(totalCount).toBe(23);
    expect(cards.length).toBe(1);
    const card = cards[0];
    expect(card.id).toBe("524ac18f-1148-4474-b326-6c6c329dc2ca");
    expect(card.title).toBe("Content Creator (Growth) - LATAM");
    expect(card.company).toBe("Lumimeds");
    expect(card.location).toBe("Anywhere in LATAM");
    expect(card.date).toBe("5 days ago");
    expect(card.url).toBe("https://www.latojobs.com/jobs/524ac18f-1148-4474-b326-6c6c329dc2ca");
  });
});

describe("parseCard — referenced (non-inlined) cards are dropped, not emitted blank", () => {
  test("a card whose title is an RSC $L reference returns null", () => {
    expect(parseCard(fixtureReferencedCardChunk())).toBeNull();
  });
});

describe("approxDaysFromRelative", () => {
  test("Today -> 0, Yesterday -> 1", () => {
    expect(approxDaysFromRelative("Today")).toBe(0);
    expect(approxDaysFromRelative("Yesterday")).toBe(1);
  });

  test("N days ago -> exact N", () => {
    expect(approxDaysFromRelative("5 days ago")).toBe(5);
  });

  test("weeks/months are approximate (7x/30x)", () => {
    expect(approxDaysFromRelative("2 weeks ago")).toBe(14);
    expect(approxDaysFromRelative("1 month ago")).toBe(30);
  });

  test("unparseable text -> null, not a guess", () => {
    expect(approxDaysFromRelative("a while back")).toBeNull();
    expect(approxDaysFromRelative(null)).toBeNull();
  });
});

describe("cleanDescription — real double-layer entity/tag structure", () => {
  test("a single decode-then-strip pass reveals both the real outer tag and the entity-escaped inner HTML", () => {
    const raw = '<p>&lt;div class=&quot;content-intro&quot;&gt;About Us&lt;/div&gt;</p>';
    const text = cleanDescription(raw);
    expect(text).toContain("About Us");
    expect(text).not.toContain("<");
    expect(text).not.toContain("&lt;");
  });

  test("null/empty -> null", () => {
    expect(cleanDescription(null)).toBeNull();
    expect(cleanDescription("")).toBeNull();
  });
});

describe("parseJobPostingLd / toJobDetail", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: "Content Creator (Growth) - LATAM",
    description: "<p>Real description text.</p>",
    datePosted: "2026-07-28T15:37:36.000Z",
    validThrough: "2026-08-27T15:37:36.000Z",
    identifier: { "@type": "PropertyValue", name: "Lumimeds", value: "524ac18f-1148-4474-b326-6c6c329dc2ca" },
    hiringOrganization: { "@type": "Organization", name: "Lumimeds", sameAs: "https://lumimeds.com" },
    employmentType: ["OTHER"],
    jobLocationType: "TELECOMMUTE",
    applicantLocationRequirements: [
      { "@type": "Country", name: "Argentina" },
      { "@type": "Country", name: "Brazil" },
    ],
    directApply: false,
    url: "https://www.latojobs.com/jobs/524ac18f-1148-4474-b326-6c6c329dc2ca",
  })}</script>`;

  test("parseJobPostingLd extracts the JobPosting block", () => {
    const ld = parseJobPostingLd(html);
    expect(ld).not.toBeNull();
    expect(ld?.title).toBe("Content Creator (Growth) - LATAM");
  });

  test("parseJobPostingLd returns null when no JobPosting block is present", () => {
    expect(parseJobPostingLd("<html><body>no ld+json here</body></html>")).toBeNull();
  });

  test("toJobDetail maps applicantLocationRequirements into a real country list, not freeform text", () => {
    const ld = parseJobPostingLd(html)!;
    const detail = toJobDetail(ld, "524ac18f-1148-4474-b326-6c6c329dc2ca", "https://www.latojobs.com/jobs/524ac18f-1148-4474-b326-6c6c329dc2ca");
    expect(detail.applicantCountries).toEqual(["Argentina", "Brazil"]);
    expect(detail.location).toBe("Argentina, Brazil");
    expect(detail.description).toBe("Real description text.");
    expect(detail.companyUrl).toBe("https://lumimeds.com");
    expect(detail.employmentType).toBe("OTHER");
  });
});

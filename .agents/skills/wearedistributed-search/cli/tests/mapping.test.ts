import { describe, test, expect } from "bun:test";
import {
  decodeHtmlEntities,
  cleanDescription,
  parseCard,
  parseCardFull,
  parseSearchPage,
  parseJobPostingLd,
  extractDescriptionHtml,
  toJobDetail,
} from "../src/helpers";

// Minimal but structurally faithful fixture, modeled on a real job card captured
// during Step 2/4 investigation.
function fixtureCardChunk(): string {
  return (
    'class="job-collection-item opp w-dyn-item"><a href="/job/senior-data-scientist-rc-capital" class="link-block-17">' +
    '<div class="div-block-129"><div class="job-listing-name">Senior Data Scientist, RC Capital</div>' +
    '<div class="job-company-name">RevenueCat</div><div class="job-elements location">' +
    '<div class="text-block-8 panel-location">USA, NAMER, AMER, Mexico City, LATAM, Brazil, Colombia</div></div>' +
    '<div class="job-elements"><div class="text-block-8 panel-rec-salary tooltip">$112,112</div></div>' +
    '<div class="job-elements"><div class="text-block-8 panel-expiry tooltip">4/8/2026</div></div></div></a>'
  );
}

describe("decodeHtmlEntities", () => {
  test("decodes named typographic entities (rsquo, mdash, etc.) from rich-text descriptions", () => {
    expect(decodeHtmlEntities("we&rsquo;ve grown &mdash; a lot")).toBe("we’ve grown — a lot");
  });

  test("decodes standard structural entities", () => {
    expect(decodeHtmlEntities("Sales &amp; Marketing &lt;div&gt;")).toBe("Sales & Marketing <div>");
  });

  test("decodes numeric entities, including the non-breaking hyphen quirk", () => {
    expect(decodeHtmlEntities("in&#x2011;app")).toBe("in-app");
    expect(decodeHtmlEntities("&#39;quoted&#39;")).toBe("'quoted'");
  });

  test("an unrecognized named entity is left as-is, not silently dropped", () => {
    expect(decodeHtmlEntities("&notarealentity;")).toBe("&notarealentity;");
  });
});

describe("parseCard / parseCardFull — real card extraction from a faithful fixture", () => {
  test("extracts id, title, company, location", () => {
    const card = parseCard(fixtureCardChunk());
    expect(card).not.toBeNull();
    expect(card?.id).toBe("senior-data-scientist-rc-capital");
    expect(card?.title).toBe("Senior Data Scientist, RC Capital");
    expect(card?.company).toBe("RevenueCat");
    expect(card?.location).toContain("LATAM");
    expect(card?.date).toBeNull(); // search page never has a posting date
    expect(card?.url).toBe("https://wearedistributed.org/job/senior-data-scientist-rc-capital");
  });

  test("parseCardFull additionally captures salary and expiry bonus fields", () => {
    const card = parseCardFull(fixtureCardChunk());
    expect(card?.salary).toBe("$112,112");
    expect(card?.expiry).toBe("4/8/2026");
  });

  test("a chunk with no title is dropped, not emitted blank", () => {
    const noTitle = fixtureCardChunk().replace('<div class="job-listing-name">Senior Data Scientist, RC Capital</div>', "");
    expect(parseCard(noTitle)).toBeNull();
  });

  test("a chunk with no /job/ href returns null", () => {
    expect(parseCard('class="job-collection-item opp w-dyn-item">no href here')).toBeNull();
  });
});

describe("parseSearchPage", () => {
  test("splits multiple cards and parses each independently", () => {
    const html = fixtureCardChunk() + fixtureCardChunk().replace("rc-capital", "another-co");
    const cards = parseSearchPage(html);
    expect(cards.length).toBe(2);
  });
});

describe("cleanDescription", () => {
  test("strips tags and decodes both structural and typographic entities", () => {
    const html = "<p>We&rsquo;re remote&#x2011;first &amp; growing.</p>";
    const text = cleanDescription(html);
    expect(text).toBe("We’re remote-first & growing.");
  });

  test("null/empty -> null", () => {
    expect(cleanDescription(null)).toBeNull();
    expect(cleanDescription("")).toBeNull();
  });
});

describe("extractDescriptionHtml", () => {
  test("extracts content between the ja-intro wrapper and the sidebar boundary", () => {
    const html =
      '<div class="ja-intro w-richtext"><p>Real description here.</p></div><div class="flex-item-20 _40-percent">sidebar</div>';
    expect(extractDescriptionHtml(html)).toBe("<p>Real description here.</p></div>");
  });

  test("returns null when the wrapper is missing", () => {
    expect(extractDescriptionHtml("<html><body>nothing here</body></html>")).toBeNull();
  });
});

describe("parseJobPostingLd / toJobDetail", () => {
  const ldJson = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: "Senior Data Scientist, RC Capital",
    description: "Senior Data Scientist, RC Capital", // known-useless field, see url-reference.md
    datePosted: "2026-07-21T21:02:28.230Z",
    validThrough: "2026-08-04",
    employmentType: "Full-time",
    jobLocationType: "On-site",
    hiringOrganization: { "@type": "Organization", name: "RevenueCat", sameAs: "https://www.revenuecat.com" },
    jobLocation: { address: { addressRegion: "USA, NAMER, AMER, Mexico City, LATAM, Brazil" } },
    applicationContact: { url: "https://jobs.ashbyhq.com/revenuecat/abc123" },
  });
  const html = `<script type="application/ld+json">${ldJson}</script><div class="ja-intro w-richtext"><p>Real body text.</p></div><div class="flex-item-20 _40-percent">sidebar</div>`;

  test("parseJobPostingLd extracts the JobPosting block", () => {
    const ld = parseJobPostingLd(html);
    expect(ld?.title).toBe("Senior Data Scientist, RC Capital");
  });

  test("toJobDetail ignores the useless JSON-LD description and uses the real body HTML instead", () => {
    const ld = parseJobPostingLd(html)!;
    const detail = toJobDetail(ld, "senior-data-scientist-rc-capital", html);
    expect(detail.description).toBe("Real body text.");
    expect(detail.company).toBe("RevenueCat");
    expect(detail.location).toContain("LATAM");
    expect(detail.applyUrl).toBe("https://jobs.ashbyhq.com/revenuecat/abc123");
    expect(detail.companyUrl).toBe("https://www.revenuecat.com");
  });
});

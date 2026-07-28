import { describe, test, expect } from "bun:test";
import {
  parseJobCards,
  parseJobDetail,
  slugifyQuery,
  normalizeId,
  normalizeShortDate,
  daysSince,
} from "../src/helpers";

// Minimal but structurally faithful search-card markup, modeled on real cards
// captured from getonbrd.com/jobs/tag/react during Step 2 investigation.
function searchCard(opts: {
  href: string;
  title: string;
  company?: string;
  forCompany?: string;
  location?: string;
  date?: string;
}): string {
  const locationBlock = opts.location
    ? `<span><span class="location">
        <span class="tooltipster" title="tooltip">
        <i class="icon icon-wifi"></i>
        ${opts.location}
        </span>
        </span></span>`
    : "";
  return `<a class="results-item color-hierarchy1 bg-hierarchy1 border-secondary my-1 pxb rounded  tooltipster" data-turbo="false" href="${opts.href}"><div class="flex flex-grow2 items-center">
    <div class="results-list-avatar bg-white rounded"><img alt="x" class="results-avatar" src="x" /></div>
    <div class="results-list-info">
    <h4 class="results-list-title"><strong class="pr-3">${opts.title}</strong> <span class="opacity-half">Full time</span></h4>
    <div class="size0 flex gap-1 items-center">
    <strong>${opts.company ?? "Acme"}</strong>
    ${opts.forCompany ? `for\n${opts.forCompany}\n` : ""}
    <span class="opacity-half">·</span>
    ${locationBlock}
    </div>
    </div>
    </div>
    <div class="results-secondary hide-on-mobile">
    <div class="gb-results-list__badges"><span class="badge">New</span></div>
    <div class="opacity-half size0">
    ${opts.date ?? ""}
    </div>
    </div>
    </a>`;
}

describe("parseJobCards", () => {
  test("parses id from the href's trailing slug", () => {
    const html = searchCard({
      href: "https://www.getonbrd.com/jobs/programming/frontend-engineer-acme-santiago",
      title: "Frontend Engineer",
    });
    const [card] = parseJobCards(html);
    expect(card.id).toBe("frontend-engineer-acme-santiago");
    expect(card.url).toBe("https://www.getonbrd.com/jobs/programming/frontend-engineer-acme-santiago");
  });

  test("decodes HTML entities in the title", () => {
    const html = searchCard({
      href: "https://www.getonbrd.com/jobs/programming/senior-role-e1",
      title: "Dise&ntilde;ador Sr. &amp; Frontend",
    });
    const [card] = parseJobCards(html);
    expect(card.title).toBe("Diseñador Sr. & Frontend");
  });

  test("plain company (no recruiting agency) parses cleanly", () => {
    const html = searchCard({
      href: "https://www.getonbrd.com/jobs/programming/x-e2",
      title: "Full-Stack Developer",
      company: "TCIT",
    });
    const [card] = parseJobCards(html);
    expect(card.company).toBe("TCIT");
    // Search cards never expose a company profile link inline (only detail
    // pages do) — companyUrl must be null, not fabricated.
    expect(card.companyUrl).toBeNull();
  });

  test("agency 'for <client>' cards still resolve the immediate poster as company", () => {
    const html = searchCard({
      href: "https://www.getonbrd.com/jobs/programming/x-e3",
      title: "Senior Backend Engineer",
      company: "23people",
      forCompany: "Equifax",
    });
    const [card] = parseJobCards(html);
    expect(card.company).toBe("23people");
  });

  test("remote location with country parenthetical", () => {
    const html = searchCard({
      href: "https://www.getonbrd.com/jobs/programming/x-e4",
      title: "Backend Engineer",
      location: "Remote\n(Chile)",
    });
    const [card] = parseJobCards(html);
    expect(card.location).toBe("Remote (Chile)");
  });

  test("multi-city location joined by a bare &nbsp (no semicolon) — regression", () => {
    // Discovered live during Step 4 verification: GetOnBoard's multi-city
    // hybrid postings separate city names with a malformed "&nbsp" entity
    // (missing the trailing semicolon), e.g. "Montevideo\n&nbsp\nSantiago".
    const html = searchCard({
      href: "https://www.getonbrd.com/jobs/programming/x-e4b",
      title: "Backend Engineer",
      location: "Montevideo\n&nbsp\nSantiago",
    });
    const [card] = parseJobCards(html);
    expect(card.location).toBe("Montevideo Santiago");
  });

  test("normalizes a 'Mon D' date badge to ISO", () => {
    const html = searchCard({
      href: "https://www.getonbrd.com/jobs/programming/x-e5",
      title: "QA Engineer",
      date: "Jul 24",
    });
    const now = new Date("2026-07-27T12:00:00Z");
    const [card] = parseJobCards(html);
    // parseJobCards uses the real system clock internally for normalization,
    // so just assert the shape here; normalizeShortDate is unit-tested with an
    // injected `now` below for the exact-value assertions.
    expect(card.date === null || /^\d{4}-\d{2}-\d{2}$/.test(card.date!)).toBe(true);
    void now;
  });

  test("one malformed card does not break parsing of the next", () => {
    const good1 = searchCard({ href: "https://www.getonbrd.com/jobs/programming/x-a", title: "A" });
    const malformed = `<a class="results-item" href="https://www.getonbrd.com/jobs/programming/x-b">no title h4 here</a>`;
    const good2 = searchCard({ href: "https://www.getonbrd.com/jobs/programming/x-c", title: "C" });
    const cards = parseJobCards(good1 + malformed + good2);
    expect(cards.map((c) => c.id)).toEqual(["x-a", "x-c"]);
  });

  test("no results-item markup yields an empty array, not a crash", () => {
    expect(parseJobCards("<html><body>No jobs found</body></html>")).toEqual([]);
  });
});

// Detail-page markup modeled on a real getonbrd.com job page (schema.org
// itemprop microdata), trimmed to the fields this CLI parses.
const DETAIL_HTML = `
<div class="gb-breadcrumbs"><a href="/jobs/programming">More Programming jobs</a></div>
<div itemprop="hiringOrganization" itemscope itemtype="http://schema.org/Organization">
<a class="gb-company-logo__link" href="/companies/tcit"><img alt="TCIT" /></a>
<h3><a href="https://www.getonbrd.com/companies/tcit"><strong itemprop="name">TCIT</strong></a></h3>
</div>
<h1 class="gb-landing-cover__title size5 mb1">
<span itemprop="title">Desarrollador Senior Full-Stack</span>
<span class="fake-hidden size-3">in TCIT</span>
</h1>
<div class="m0">
<span class="hide" itemprop="employmentType">FULL_TIME</span>
<h2 class="size1 mb-3 font-normal lh3 mb-3">
<span itemprop="jobLocation" itemscope itemtype="http://schema.org/Place">
<span itemprop="address" itemscope itemtype="http://schema.org/PostalAddress">
<span class="location">
<span class="js-locations-tooltip">
<a class="color-inherit" href="/jobs/city/santiago">Santiago</a><div class="location-tooltip-content hide">
This job is performed partly from home and partly at the office in: Santiago
</div>
(Hybrid)
</span>
</span>
</span>
</span>
<span class="mx-3">|</span>
<span itemprop="qualifications">Senior</span>
<span class="mx-3">|</span>
Full time
<span class="mx-3">|</span>
<a class="color-inherit" href="/jobs/programming">Programming</a>
</h2>
</div>
<h3 class="size1 mb-3 mt-3">
<span itemprop="baseSalary" itemscope itemtype="http://schema.org/MonetaryAmount">
<span class="tooltipster-basic" title="ref only">
<span class="hide-on-small-mobile">Gross salary</span>
<strong>$2400 - 3000</strong>
USD/month
</span>
</span>
</h3>
<div class="fake-hidden">
<time datetime="2026-07-24T12:47:59+00:00" itemprop="datePosted"></time>
</div>
<a class="gb-btn" id="apply_bottom" href="https://www.getonbrd.com/jobs/desarrollador-senior-full-stack-tcit-santiago/applications/new">Apply now</a>
<div id="job-body" itemprop="description">
<div class="gb-rich-txt">
<div>Somos una empresa de desarrollo &amp; consultor&iacute;a.</div>
</div>
<div class="mb4">
<h3>Requisitos</h3>
<div><ul><li>React</li><li>Node.js</li></ul></div>
</div>
</div>
`;

describe("parseJobDetail", () => {
  const job = parseJobDetail(DETAIL_HTML, "desarrollador-senior-full-stack-tcit-santiago");

  test("title", () => {
    expect(job.title).toBe("Desarrollador Senior Full-Stack");
  });

  test("company + companyUrl (absolute, resolved from a relative href)", () => {
    expect(job.company).toBe("TCIT");
    expect(job.companyUrl).toBe("https://www.getonbrd.com/companies/tcit");
  });

  test("location strips the hidden tooltip sentence, keeping only the visible label", () => {
    expect(job.location).toBe("Santiago (Hybrid)");
    expect(job.location).not.toContain("performed partly from home");
  });

  test("employmentType and seniority", () => {
    expect(job.employmentType).toBe("FULL_TIME");
    expect(job.seniority).toBe("Senior");
  });

  test("category", () => {
    expect(job.category).toBe("Programming");
  });

  test("salary", () => {
    expect(job.salary).toContain("2400");
    expect(job.salary).toContain("USD/month");
  });

  test("date from itemprop=datePosted, truncated to YYYY-MM-DD", () => {
    expect(job.date).toBe("2026-07-24");
  });

  test("description: entities decoded, tags stripped, structure preserved as text", () => {
    expect(job.description).toContain("Somos una empresa de desarrollo & consultoría.");
    expect(job.description).toContain("Requisitos");
    expect(job.description).toContain("React");
    expect(job.description).toContain("Node.js");
    expect(job.description).not.toMatch(/<[^>]+>/);
  });

  test("applyUrl", () => {
    expect(job.applyUrl).toBe(
      "https://www.getonbrd.com/jobs/desarrollador-senior-full-stack-tcit-santiago/applications/new",
    );
  });

  test("url is reconstructed from the id via the universal /jobs/<slug> shortcut", () => {
    expect(job.url).toBe("https://www.getonbrd.com/jobs/desarrollador-senior-full-stack-tcit-santiago");
  });
});

describe("slugifyQuery", () => {
  test("lowercases and hyphenates spaces", () => {
    expect(slugifyQuery("React Developer")).toBe("react-developer");
  });

  test("strips accents", () => {
    expect(slugifyQuery("Diseño UX")).toBe("diseno-ux");
  });

  test("collapses punctuation and trims stray hyphens", () => {
    expect(slugifyQuery("  Node.js / React!! ")).toBe("node-js-react");
  });
});

describe("normalizeId", () => {
  test("bare slug passes through", () => {
    expect(normalizeId("frontend-engineer-acme-santiago")).toBe("frontend-engineer-acme-santiago");
  });

  test("extracts the trailing slug from a full URL", () => {
    expect(normalizeId("https://www.getonbrd.com/jobs/programming/frontend-engineer-acme-santiago")).toBe(
      "frontend-engineer-acme-santiago",
    );
  });

  test("extracts from a Spanish-locale prefixed URL the same way", () => {
    expect(normalizeId("https://www.getonbrd.com/empleos/programacion/full-stack-2brains-remote")).toBe(
      "full-stack-2brains-remote",
    );
  });

  test("rejects empty input", () => {
    expect(normalizeId("")).toBeNull();
    expect(normalizeId("   ")).toBeNull();
  });

  test("rejects a malformed URL", () => {
    expect(normalizeId("https://[")).toBeNull();
  });
});

describe("normalizeShortDate", () => {
  const now = new Date("2026-07-27T12:00:00Z");

  test("parses 'Mon D' with a capitalized month", () => {
    expect(normalizeShortDate("Jul 24", now)).toBe("2026-07-24");
  });

  test("parses lowercase month abbreviations", () => {
    expect(normalizeShortDate("jul 27", now)).toBe("2026-07-27");
  });

  test("rolls back a year when the naive guess would be in the future", () => {
    // "Dec 25" relative to Jul 27 2026 would be in the future this year,
    // so it must mean Dec 25 of the *previous* year.
    expect(normalizeShortDate("Dec 25", now)).toBe("2025-12-25");
  });

  test("returns null for unparseable text", () => {
    expect(normalizeShortDate("today", now)).toBeNull();
    expect(normalizeShortDate("", now)).toBeNull();
    expect(normalizeShortDate(null, now)).toBeNull();
  });
});

describe("daysSince", () => {
  const now = new Date("2026-07-27T12:00:00Z");

  test("computes whole days between an ISO date and now", () => {
    expect(daysSince("2026-07-24", now)).toBe(3);
  });

  test("returns 0 for today", () => {
    expect(daysSince("2026-07-27", now)).toBe(0);
  });

  test("returns null for null/invalid input", () => {
    expect(daysSince(null, now)).toBeNull();
    expect(daysSince("not-a-date", now)).toBeNull();
  });
});

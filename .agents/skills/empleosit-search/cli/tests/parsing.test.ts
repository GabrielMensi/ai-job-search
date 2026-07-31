import { describe, test, expect } from "bun:test";
import {
  parseJobCards,
  parseJobDetail,
  normalizeId,
  parseArgDate,
  daysSince,
  parseTotalResults,
  buildSearchUrl,
} from "../src/helpers";

// Search-card markup modeled on the real markup structure documented in
// ../url-reference.md (each result inside a
// <div class="listing-section listingsection">). `companyBlock` lets tests
// exercise both markup shapes: a plain text company name (anonymous
// employer), or an <a href="...">NAME</a> link.
function searchCard(opts: {
  id: string;
  slug: string;
  title: string;
  companyBlock?: string;
  location?: string;
  date?: string;
}): string {
  return `<div class="listing-section listingsection">
    <div class="listing-title" >
        <a href="https://www.empleosit.com.ar/display-job/${opts.id}/${opts.slug}.html?searchId=9f8e7d6c5b">${opts.title}</a>
    </div>
    <span class="captions-field location-ico">${opts.location ?? ""}</span>
    <span class="captions-field company-ico">${opts.companyBlock ?? ""}</span>
    <span class="captions-field posted-ico">${opts.date ?? ""}</span>
</div>`;
}

describe("parseJobCards", () => {
  test("parses id, title (decoded), and url (searchId stripped)", () => {
    const html = searchCard({
      id: "12345",
      slug: "desarrollador-react-sr",
      title: "Desarrollador React Sr.",
    });
    const [card] = parseJobCards(html);
    expect(card.id).toBe("12345");
    expect(card.title).toBe("Desarrollador React Sr.");
    expect(card.url).toBe("https://www.empleosit.com.ar/display-job/12345/desarrollador-react-sr.html");
    expect(card.url).not.toContain("searchId");
  });

  test("decodes numeric entities in the title", () => {
    const html = searchCard({
      id: "99999",
      slug: "x",
      title: "Desarrollador C&#x2B;&#x2B; Senior (Ingl&#xE9;s avanzado)",
    });
    const [card] = parseJobCards(html);
    expect(card.title).toBe("Desarrollador C++ Senior (Inglés avanzado)");
  });

  test("plain-text company (no link) parses cleanly, companyUrl null", () => {
    const html = searchCard({
      id: "10001",
      slug: "x",
      title: "Backend Dev",
      companyBlock: "Empresa confidencial",
    });
    const [card] = parseJobCards(html);
    expect(card.company).toBe("Empresa confidencial");
    expect(card.companyUrl).toBeNull();
  });

  test("linked company extracts name and companyUrl", () => {
    const html = searchCard({
      id: "10002",
      slug: "x",
      title: "Full-Stack Dev",
      companyBlock: `<a href="https://www.empleosit.com.ar/company/42/acme-software/">Acme Software</a>`,
    });
    const [card] = parseJobCards(html);
    expect(card.company).toBe("Acme Software");
    expect(card.companyUrl).toBe("https://www.empleosit.com.ar/company/42/acme-software/");
  });

  test("location with named entity decoded", () => {
    const html = searchCard({
      id: "10003",
      slug: "x",
      title: "QA",
      location: "C&oacute;rdoba",
    });
    const [card] = parseJobCards(html);
    expect(card.location).toBe("Córdoba");
  });

  test("absolute DD/MM/YYYY date is parsed to ISO (day first, not month first)", () => {
    const html = searchCard({
      id: "10004",
      slug: "x",
      title: "Dev",
      date: "05/03/2026",
    });
    const [card] = parseJobCards(html);
    // 5 de marzo, NOT May 3rd - the classic DD/MM vs MM/DD bug.
    expect(card.date).toBe("2026-03-05");
  });

  test("one malformed card does not break parsing of the next", () => {
    const good1 = searchCard({ id: "20001", slug: "a", title: "A" });
    const malformed = `<div class="listing-section listingsection">no title markup here</div>`;
    const good2 = searchCard({ id: "20002", slug: "c", title: "C" });
    const cards = parseJobCards(good1 + malformed + good2);
    expect(cards.map((c) => c.id)).toEqual(["20001", "20002"]);
  });

  test("no listing-section markup yields an empty array, not a crash", () => {
    expect(parseJobCards("<html><body>Sin resultados</body></html>")).toEqual([]);
  });
});

// Detail-page markup modeled on the real field markup documented in
// ../url-reference.md, trimmed to the fields this CLI parses.
const DETAIL_HTML = `
<h1 class="heading" style="margin-top: 15px;">Desarrollador React Sr.</h1>
<h3>ID Oferta:</h3>
<div class="displayField">55501</div>
<h3>Ubicación:</h3>
<h3 class="displayField" style="margin-top: 5px;"><a href="https://www.empleosit.com.ar/location/cordoba/">Córdoba</a></h3>
<h3>Categoría:</h3>
<div class="displayField"><a href="https://www.empleosit.com.ar/category/desarrollo/">Desarrollo</a></div>
<h3>Modalidad de trabajo:</h3>
<div class="displayField">Full-time</div>
<h3>Tipo de Trabajo:</h3>
<div class="displayField">Remoto</div>
<h3>Publicado:</h3>
<div class="displayField">12/03/2026</div>
<div class="col-wide">
  <h2 class="some-heading">Descripción del empleo:</h2>
  <div class="displayField" style="margin-top: 10px;">
    <p style="margin: 0;">Buscamos un desarrollador con experiencia en React.</p>
    <p>Requisitos:</p>
    <ul>
      <li>3 a&ntilde;os de experiencia</li>
      <li>Conocimiento de TypeScript</li>
    </ul>
    <p>&iquest;Te interesa? &Aacute;nimo, postulate!</p>
  </div>
</div>
<div id="refineResults" class="company-info-right">
  <div class="comp-profile-content">
    <h2 class="company-name">Acme Software</h2>
  </div>
  <span class="list"><a href="https://www.empleosit.com.ar/company/42/acme-software/">Más ofertas</a></span>
</div>
`;

describe("parseJobDetail", () => {
  const job = parseJobDetail(DETAIL_HTML, "55501");

  test("title", () => {
    expect(job.title).toBe("Desarrollador React Sr.");
  });

  test("location (from the <h3 class=displayField> shape, not a <div>)", () => {
    expect(job.location).toBe("Córdoba");
  });

  test("category", () => {
    expect(job.category).toBe("Desarrollo");
  });

  test("schedule", () => {
    expect(job.schedule).toBe("Full-time");
  });

  test("workplaceType", () => {
    expect(job.workplaceType).toBe("Remoto");
  });

  test("date: absolute DD/MM/YYYY parsed to ISO (day first)", () => {
    // 12 de marzo, not December 3rd.
    expect(job.date).toBe("2026-03-12");
  });

  test("description: entities decoded, paragraph/list breaks preserved, tags stripped", () => {
    expect(job.description).toContain("Buscamos un desarrollador con experiencia en React.");
    expect(job.description).toContain("3 años de experiencia");
    expect(job.description).toContain("Conocimiento de TypeScript");
    expect(job.description).toContain("¿Te interesa? Ánimo, postulate!");
    expect(job.description).not.toMatch(/<[^>]+>/);
  });

  test("description: <li> items land on separate lines (nested list regression)", () => {
    const lines = (job.description ?? "").split("\n").map((l) => l.trim());
    expect(lines).toContain("3 años de experiencia");
    expect(lines).toContain("Conocimiento de TypeScript");
  });

  test("company + companyUrl from the sidebar block", () => {
    expect(job.company).toBe("Acme Software");
    expect(job.companyUrl).toBe("https://www.empleosit.com.ar/company/42/acme-software/");
  });

  test("applyUrl is built directly from the id (JS-popup apply flow)", () => {
    expect(job.applyUrl).toBe("https://www.empleosit.com.ar/apply-now/?listing_id=55501");
  });

  test("url is reconstructed from the id (slug is ignored server-side)", () => {
    expect(job.url).toBe("https://www.empleosit.com.ar/display-job/55501/x.html");
  });

  test("no requirements/skills fields exist on this site's JobDetail shape", () => {
    expect((job as unknown as Record<string, unknown>).requirements).toBeUndefined();
    expect((job as unknown as Record<string, unknown>).skills).toBeUndefined();
  });
});

describe("normalizeId", () => {
  test("bare numeric id passes through", () => {
    expect(normalizeId("55501")).toBe("55501");
  });

  test("extracts the id from a full detail URL, ignoring the slug and query string", () => {
    expect(
      normalizeId("https://www.empleosit.com.ar/display-job/55501/desarrollador-react-sr.html?searchId=abc"),
    ).toBe("55501");
  });

  test("rejects empty input", () => {
    expect(normalizeId("")).toBeNull();
    expect(normalizeId("   ")).toBeNull();
  });

  test("rejects a string with no id-shaped segment", () => {
    expect(normalizeId("not-a-url-or-id")).toBeNull();
  });
});

describe("parseArgDate", () => {
  test("parses DD/MM/YYYY with day before month (Argentina, not US MM/DD)", () => {
    // 5 de marzo (day=5, month=3), NOT May 3rd.
    expect(parseArgDate("05/03/2026")).toBe("2026-03-05");
  });

  test("parses a single-digit day/month", () => {
    expect(parseArgDate("1/2/2026")).toBe("2026-02-01");
  });

  test("returns null for a calendar-invalid date", () => {
    expect(parseArgDate("31/02/2026")).toBeNull();
  });

  test("returns null for unparseable text", () => {
    expect(parseArgDate("hace 3 días")).toBeNull();
    expect(parseArgDate("")).toBeNull();
    expect(parseArgDate(null)).toBeNull();
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

describe("parseTotalResults", () => {
  test("parses the total from the <h1> badge (query-present phrasing)", () => {
    const html = `<h1>Encontramos <span> 42 </span> trabajos disponibles para vos</h1>`;
    expect(parseTotalResults(html)).toBe(42);
  });

  test("parses the total on the browse-all phrasing (no 'para vos')", () => {
    const html = `<h1>Encontramos <span>270</span> trabajos disponibles</h1>`;
    expect(parseTotalResults(html)).toBe(270);
  });

  test("handles thousands separators", () => {
    const html = `<h1>Encontramos <span>1.234</span> trabajos disponibles</h1>`;
    expect(parseTotalResults(html)).toBe(1234);
  });

  test("returns null when no badge is present", () => {
    expect(parseTotalResults("<html><body>no h1 here</body></html>")).toBeNull();
  });
});

describe("buildSearchUrl", () => {
  test("always sends the hidden action + listing_type fields", () => {
    const url = new URL(buildSearchUrl({ page: 1 }));
    expect(url.searchParams.get("action")).toBe("search");
    expect(url.searchParams.get("listing_type[equal]")).toBe("Job");
    expect(url.searchParams.get("page")).toBe("1");
  });

  test("omitting query and location is valid (browse-all) - no keywords/location params sent", () => {
    const url = new URL(buildSearchUrl({ page: 1 }));
    expect(url.searchParams.has("keywords[all_words]")).toBe(false);
    expect(url.searchParams.has("Location[location][value]")).toBe(false);
  });

  test("query is sent as keywords[all_words]", () => {
    const url = new URL(buildSearchUrl({ query: "react", page: 1 }));
    expect(url.searchParams.get("keywords[all_words]")).toBe("react");
  });

  test("location is sent as Location[location][value]", () => {
    const url = new URL(buildSearchUrl({ location: "Rosario", page: 1 }));
    expect(url.searchParams.get("Location[location][value]")).toBe("Rosario");
  });

  test("perPage is sent as listings_per_page2 when provided", () => {
    const url = new URL(buildSearchUrl({ page: 2, perPage: 50 }));
    expect(url.searchParams.get("listings_per_page2")).toBe("50");
    expect(url.searchParams.get("page")).toBe("2");
  });
});

import { describe, test, expect } from "bun:test";
import {
  mapSearchItem,
  parseSearchResponse,
  parseFichaResponse,
  cleanDescription,
  toISODate,
  daysSince,
  normalizeForMatch,
  buildSearchResultUrl,
  normalizeId,
  type RawSearchItem,
  type RawSearchResponse,
  type RawFichaResponse,
} from "../src/helpers";

// Field shapes below are modeled on real responses captured live from
// POST /api/avisos/searchV2 and GET /api/candidates/fichaAvisoNormalizada/<id>
// during Step 2/4 investigation (July 2026) — see ../url-reference.md.

function rawSearchItem(overrides: Partial<RawSearchItem> = {}): RawSearchItem {
  return {
    id: 2186592,
    titulo: "Desarrollador Full Stack (JAVA / React) Senior - Mix (Onsite - Remoto) - 1778",
    empresa: "Aliantec",
    confidencial: false,
    fechaPublicacion: "23-07-2026",
    localizacion: "Capital Federal, Buenos Aires",
    portal: "zonajobs",
    ...overrides,
  };
}

describe("buildSearchResultUrl", () => {
  test("reproduces the real seoFriendlyUrl for a live-verified example", () => {
    const url = buildSearchResultUrl({
      id: 2186592,
      titulo: "Desarrollador Full Stack (JAVA / React) Senior - Mix (Onsite - Remoto) - 1778",
      empresa: "Aliantec",
      confidencial: false,
    });
    expect(url).toBe(
      "https://www.zonajobs.com.ar/empleos/desarrollador-full-stack-java-react-senior-mix-onsite-remoto-1778-aliantec-2186592.html",
    );
  });

  test("omits the company slug when confidencial is true", () => {
    const url = buildSearchResultUrl({
      id: 999,
      titulo: "Backend Engineer",
      empresa: "Hidden Corp",
      confidencial: true,
    });
    expect(url).toBe("https://www.zonajobs.com.ar/empleos/backend-engineer-999.html");
  });

  test("omits the company slug when empresa is null", () => {
    const url = buildSearchResultUrl({ id: 1000, titulo: "QA Analyst", empresa: null, confidencial: false });
    expect(url).toBe("https://www.zonajobs.com.ar/empleos/qa-analyst-1000.html");
  });
});

describe("mapSearchItem", () => {
  test("maps a normal (non-confidential) item", () => {
    const card = mapSearchItem(rawSearchItem());
    expect(card).toEqual({
      id: "2186592",
      title: "Desarrollador Full Stack (JAVA / React) Senior - Mix (Onsite - Remoto) - 1778",
      company: "Aliantec",
      location: "Capital Federal, Buenos Aires",
      date: "2026-07-23",
      url: "https://www.zonajobs.com.ar/empleos/desarrollador-full-stack-java-react-senior-mix-onsite-remoto-1778-aliantec-2186592.html",
    });
  });

  test("company is null (not the raw string) when confidencial is true", () => {
    const card = mapSearchItem(rawSearchItem({ confidencial: true, empresa: "Should Not Leak" }));
    expect(card.company).toBeNull();
  });

  test("missing fields become null, never omitted", () => {
    const card = mapSearchItem(rawSearchItem({ empresa: null, localizacion: null, fechaPublicacion: null }));
    expect(card.company).toBeNull();
    expect(card.location).toBeNull();
    expect(card.date).toBeNull();
  });
});

describe("parseSearchResponse", () => {
  test("keeps only portal:zonajobs results, dropping bumeran cross-posts", () => {
    const raw: RawSearchResponse = {
      number: 0,
      size: 10,
      total: 4,
      content: [
        rawSearchItem({ id: 1, portal: "zonajobs" }),
        rawSearchItem({ id: 2, portal: "bumeran" }),
        rawSearchItem({ id: 3, portal: "zonajobs" }),
      ],
    };
    const { cards, total } = parseSearchResponse(raw);
    expect(cards.map((c) => c.id)).toEqual(["1", "3"]);
    // `total` is passed through as the API's grand total across both
    // portals — it is not recomputed from the filtered card count.
    expect(total).toBe(4);
  });

  test("empty content yields an empty array, not a crash", () => {
    const { cards } = parseSearchResponse({ number: 0, size: 10, total: 0, content: [] });
    expect(cards).toEqual([]);
  });
});

const FICHA_RESPONSE: RawFichaResponse = {
  aviso: {
    id: 2186592,
    titulo: "Desarrollador Full Stack (JAVA / React) Senior - Mix (Onsite - Remoto) - 1778",
    // Real API responses carry raw UTF-8 (verified live) — no named HTML
    // entities. A stray numeric entity (e.g. an emoji) does show up
    // occasionally in real postings, so that's exercised separately below.
    descripcion:
      "<p><strong>¿Qué hace la compañía?</strong></p><ul> <li>Experiencia con React</li> <li>TypeScript</li> </ul>",
    empresa: { denominacion: "Aliantec", confidencial: false },
    localizacion: { detalle: "Capital Federal, Buenos Aires, Argentina" },
    modalidadTrabajo: { nombre: "Híbrido" },
    nivelLaboral: { nombre: "Senior" },
    tipoContratacion: { nombre: "Indeterminado" },
    area: { nombre: "Tecnología, Sistemas y Telecomunicaciones" },
    fechaPublicacion: "23-07-2026",
    seoFriendlyUrl: "/empleos/desarrollador-full-stack-java-react-senior-mix-onsite-remoto-1778-aliantec-2186592.html",
    redireccionURL: null,
  },
};

describe("parseFichaResponse", () => {
  const job = parseFichaResponse(FICHA_RESPONSE);

  test("title, id, date", () => {
    expect(job.id).toBe("2186592");
    expect(job.title).toBe("Desarrollador Full Stack (JAVA / React) Senior - Mix (Onsite - Remoto) - 1778");
    expect(job.date).toBe("2026-07-23");
  });

  test("url is built from seoFriendlyUrl, not reconstructed", () => {
    expect(job.url).toBe(
      "https://www.zonajobs.com.ar/empleos/desarrollador-full-stack-java-react-senior-mix-onsite-remoto-1778-aliantec-2186592.html",
    );
  });

  test("falls back to a bare id URL when seoFriendlyUrl is missing", () => {
    const noSlug = parseFichaResponse({
      aviso: { ...FICHA_RESPONSE.aviso, seoFriendlyUrl: null },
    });
    expect(noSlug.url).toBe("https://www.zonajobs.com.ar/empleos/2186592.html");
  });

  test("company, location, seniority, employment, work mode, area", () => {
    expect(job.company).toBe("Aliantec");
    expect(job.location).toBe("Capital Federal, Buenos Aires, Argentina");
    expect(job.seniority).toBe("Senior");
    expect(job.employmentType).toBe("Indeterminado");
    expect(job.workMode).toBe("Híbrido");
    expect(job.area).toBe("Tecnología, Sistemas y Telecomunicaciones");
  });

  test("company is null when the employer is confidential", () => {
    const confidential = parseFichaResponse({
      aviso: { ...FICHA_RESPONSE.aviso, empresa: { denominacion: "Should Not Leak", confidencial: true } },
    });
    expect(confidential.company).toBeNull();
  });

  test("description: entities decoded, tags stripped, structure preserved as text", () => {
    expect(job.description).toContain("¿Qué hace la compañía?");
    expect(job.description).toContain("Experiencia con React");
    expect(job.description).toContain("TypeScript");
    expect(job.description).not.toMatch(/<[^>]+>/);
  });

  test("applyUrl is null when redireccionURL is null (in-portal apply flow)", () => {
    expect(job.applyUrl).toBeNull();
  });

  test("applyUrl passes through an external redireccionURL when present", () => {
    const external = parseFichaResponse({
      aviso: { ...FICHA_RESPONSE.aviso, redireccionURL: "https://example.com/apply/123" },
    });
    expect(external.applyUrl).toBe("https://example.com/apply/123");
  });
});

describe("cleanDescription", () => {
  test("returns null for null/empty input", () => {
    expect(cleanDescription(null)).toBeNull();
    expect(cleanDescription("")).toBeNull();
  });

  test("keeps list items on separate lines", () => {
    const html = "<ul><li>React</li><li>Node.js</li></ul>";
    const text = cleanDescription(html);
    expect(text).toContain("React");
    expect(text).toContain("Node.js");
    expect(text).not.toMatch(/<[^>]+>/);
  });

  test("passes through raw UTF-8 accented text unchanged (verified live: Zonajobs uses no named HTML entities)", () => {
    expect(cleanDescription("<p>consultoría</p>")).toBe("consultoría");
  });

  test("decodes a numeric hex entity (verified live in a real posting's description, e.g. an emoji)", () => {
    expect(cleanDescription("100% remoto &#x1f30e; Latinoam&#xe9;rica")).toBe("100% remoto 🌎 Latinoamérica");
  });
});

describe("toISODate", () => {
  test("converts DD-MM-YYYY to ISO", () => {
    expect(toISODate("23-07-2026")).toBe("2026-07-23");
  });

  test("returns null for unparseable input", () => {
    expect(toISODate(null)).toBeNull();
    expect(toISODate("")).toBeNull();
    expect(toISODate("not-a-date")).toBeNull();
    expect(toISODate("2026-07-23")).toBeNull(); // already-ISO input is not this format
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

describe("normalizeForMatch", () => {
  test("lowercases and strips accents for location matching", () => {
    expect(normalizeForMatch("Córdoba")).toBe("cordoba");
    expect(normalizeForMatch("ROSARIO")).toBe("rosario");
  });
});

describe("normalizeId", () => {
  test("bare numeric id passes through", () => {
    expect(normalizeId("2186592")).toBe("2186592");
  });

  test("extracts the trailing id from a full job URL", () => {
    expect(
      normalizeId(
        "https://www.zonajobs.com.ar/empleos/desarrollador-full-stack-java-react-senior-mix-onsite-remoto-1778-aliantec-2186592.html",
      ),
    ).toBe("2186592");
  });

  test("rejects non-numeric, non-URL input", () => {
    expect(normalizeId("not-an-id")).toBeNull();
    expect(normalizeId("")).toBeNull();
  });
});

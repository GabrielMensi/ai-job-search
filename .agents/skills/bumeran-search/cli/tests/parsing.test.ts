import { describe, test, expect } from "bun:test";
import {
  slugify,
  buildResultUrl,
  normalizeDate,
  daysSince,
  normalizeId,
  cleanDescriptionHtml,
  mapSearchItem,
  mapAvisoDetail,
  type RawSearchItem,
  type RawAvisoDetail,
} from "../src/helpers";

describe("slugify", () => {
  test("lowercases and hyphenates spaces", () => {
    expect(slugify("React Developer")).toBe("react-developer");
  });

  test("strips accents", () => {
    expect(slugify("Programación")).toBe("programacion");
  });

  test("collapses punctuation/slashes and trims stray hyphens", () => {
    // Modeled on the real live title used to verify buildResultUrl below.
    expect(slugify("Desarrollador Full Stack (JAVA / React) Senior - Mix (Onsite - Remoto) - 1778")).toBe(
      "desarrollador-full-stack-java-react-senior-mix-onsite-remoto-1778",
    );
  });
});

describe("buildResultUrl", () => {
  test("reproduces Bumeran's real seoFriendlyUrl for a live-captured example", () => {
    // Captured live during Step 2/4 investigation: id 1118379127, title/company below.
    // The real seoFriendlyUrl (from GET fichaAvisoNormalizada) is:
    // /empleos/desarrollador-full-stack-java-react-senior-mix-onsite-remoto-1778-aliantec-1118379127.html
    const url = buildResultUrl(
      "1118379127",
      "Desarrollador Full Stack (JAVA / React) Senior - Mix (Onsite - Remoto) - 1778",
      "Aliantec",
    );
    expect(url).toBe(
      "https://www.bumeran.com.ar/empleos/desarrollador-full-stack-java-react-senior-mix-onsite-remoto-1778-aliantec-1118379127.html",
    );
  });

  test("omits the company segment when company is null", () => {
    const url = buildResultUrl("123456", "QA Engineer", null);
    expect(url).toBe("https://www.bumeran.com.ar/empleos/qa-engineer-123456.html");
  });
});

describe("normalizeDate", () => {
  test("converts Bumeran's DD-MM-YYYY to ISO", () => {
    expect(normalizeDate("23-07-2026")).toBe("2026-07-23");
  });

  test("returns null for missing/unparseable input", () => {
    expect(normalizeDate(null)).toBeNull();
    expect(normalizeDate(undefined)).toBeNull();
    expect(normalizeDate("not-a-date")).toBeNull();
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

describe("normalizeId", () => {
  test("bare numeric id passes through", () => {
    expect(normalizeId("1118379127")).toBe("1118379127");
  });

  test("extracts the trailing id from a full job URL", () => {
    expect(
      normalizeId(
        "https://www.bumeran.com.ar/empleos/desarrollador-full-stack-java-react-senior-1118379127.html",
      ),
    ).toBe("1118379127");
  });

  test("extracts from a bare 'aviso-<id>' style input", () => {
    expect(normalizeId("aviso-1118379127")).toBe("1118379127");
  });

  test("rejects empty/short input", () => {
    expect(normalizeId("")).toBeNull();
    expect(normalizeId("42")).toBeNull();
  });
});

describe("cleanDescriptionHtml", () => {
  test("strips tags, decodes entities, keeps block breaks as newlines", () => {
    const html = "<p><strong>¿Qu&eacute; hace la compa&ntilde;&iacute;a?</strong></p><p>Somos una empresa &amp; consultor&iacute;a.</p>";
    const cleaned = cleanDescriptionHtml(html);
    expect(cleaned).toContain("¿Qué hace la compañía?");
    expect(cleaned).toContain("Somos una empresa & consultoría.");
    expect(cleaned).not.toMatch(/<[^>]+>/);
  });

  test("returns null for empty/missing input", () => {
    expect(cleanDescriptionHtml(null)).toBeNull();
    expect(cleanDescriptionHtml("")).toBeNull();
  });
});

describe("mapSearchItem", () => {
  test("maps a real-shaped searchV2 content item", () => {
    const raw: RawSearchItem = {
      id: 1118379127,
      titulo: "Desarrollador Full Stack (JAVA / React) Senior",
      empresa: "Aliantec",
      localizacion: "Capital Federal, Buenos Aires",
      fechaPublicacion: "23-07-2026",
    };
    const card = mapSearchItem(raw);
    expect(card.id).toBe("1118379127");
    expect(card.title).toBe(raw.titulo);
    expect(card.company).toBe("Aliantec");
    expect(card.location).toBe("Capital Federal, Buenos Aires");
    expect(card.date).toBe("2026-07-23");
    expect(card.companyUrl).toBeNull();
    expect(card.url).toContain("1118379127.html");
  });

  test("missing fields become null, never omitted", () => {
    const raw: RawSearchItem = {
      id: 42424242,
      titulo: "Some Role",
      empresa: null,
      localizacion: null,
      fechaPublicacion: null,
    };
    const card = mapSearchItem(raw);
    expect(card.company).toBeNull();
    expect(card.location).toBeNull();
    expect(card.date).toBeNull();
  });
});

describe("mapAvisoDetail", () => {
  test("maps a real-shaped fichaAvisoNormalizada aviso object", () => {
    const raw: RawAvisoDetail = {
      id: 1118379127,
      titulo: "Desarrollador Full Stack (JAVA / React) Senior",
      descripcion: "<p><strong>Hola</strong></p>",
      empresa: { denominacion: "Aliantec" },
      localizacion: { detalle: "Capital Federal, Buenos Aires, Argentina" },
      fechaPublicacion: "23-07-2026",
      tipoTrabajo: { nombre: "Full-time" },
      modalidadTrabajo: { nombre: "Híbrido" },
      nivelLaboral: { nombre: "Senior" },
      area: { nombre: "Tecnología, Sistemas y Telecomunicaciones" },
      subArea: { nombre: "Programación" },
      redireccionURL: null,
      seoFriendlyUrl: "/empleos/desarrollador-full-stack-java-react-senior-aliantec-1118379127.html",
    };
    const job = mapAvisoDetail(raw);
    expect(job.id).toBe("1118379127");
    expect(job.company).toBe("Aliantec");
    expect(job.location).toBe("Capital Federal, Buenos Aires, Argentina");
    expect(job.date).toBe("2026-07-23");
    expect(job.employmentType).toBe("Full-time");
    expect(job.workMode).toBe("Híbrido");
    expect(job.seniority).toBe("Senior");
    expect(job.category).toBe("Programación");
    expect(job.description).toContain("Hola");
    expect(job.url).toBe(
      "https://www.bumeran.com.ar/empleos/desarrollador-full-stack-java-react-senior-aliantec-1118379127.html",
    );
  });

  test("falls back to a constructed url when seoFriendlyUrl is missing", () => {
    const raw: RawAvisoDetail = {
      id: 999,
      titulo: "QA Engineer",
      descripcion: null,
      empresa: { denominacion: "Acme" },
    };
    const job = mapAvisoDetail(raw);
    expect(job.url).toBe("https://www.bumeran.com.ar/empleos/qa-engineer-acme-999.html");
    expect(job.applyUrl).toBeNull();
  });
});

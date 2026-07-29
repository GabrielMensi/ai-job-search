import { describe, test, expect } from "bun:test";
import {
  parseJobCards,
  parseJobDetail,
  slugifyQuery,
  normalizeId,
  normalizeRelativeDate,
  daysSince,
  parseTotalResults,
} from "../src/helpers";

// Search-card markup modeled on real cards captured live from
// ar.computrabajo.com/trabajo-de-desarrollador-frontend during Step 2/4
// investigation. `companyBlock` lets tests exercise both markup shapes: a plain
// text company name, or an <a ... offer-grid-article-company-url> link.
function searchCard(opts: {
  id: string;
  slug: string;
  title: string;
  companyBlock?: string;
  location?: string;
  date?: string;
  remote?: boolean;
}): string {
  return `<article class="box_offer  " data-id='${opts.id}' data-blind="false" id="${opts.id}" data-lc="ListOffers-Score3-0">
    <h2 class="fs18 fwB prB">
        <a class="js-o-link fc_base" href="/ofertas-de-trabajo/oferta-de-trabajo-de-${opts.slug}-${opts.id}#lc=ListOffers-Score3-0">
            ${opts.title}
        </a>
    </h2>
    <p class="dFlex vm_fx fs16 fc_base mt5">
${opts.companyBlock ?? ""}    </p>
    <p class="fs16 fc_base mt5">
        <span class="mr10">
            ${opts.location ?? ""}
        </span>
    </p>
        ${
          opts.remote
            ? `<div class="fs13 mt15">
                <span class="dIB mr10">
                    <span class="icon i_home"></span>
                    Remoto
                </span>
        </div>`
            : ""
        }
    <p class="fs13 fc_aux mt15">
        ${opts.date ?? ""}
    </p>
</article>`;
}

describe("parseJobCards", () => {
  test("parses id, title (decoded), and url (fragment stripped)", () => {
    const html = searchCard({
      id: "768b534b979680a861373e686dcf3405",
      slug: "desarrollador-full-stack-sr",
      title: "Desarrollador Full Stack Sr. con IA",
    });
    const [card] = parseJobCards(html);
    // id is normalized to uppercase (matching real Computrabajo IDs); url is
    // taken verbatim from the href, so it reflects whatever case was there.
    expect(card.id).toBe("768B534B979680A861373E686DCF3405");
    expect(card.title).toBe("Desarrollador Full Stack Sr. con IA");
    expect(card.url).toBe(
      "https://ar.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-desarrollador-full-stack-sr-768b534b979680a861373e686dcf3405",
    );
  });

  test("decodes hex numeric entities in the title", () => {
    const html = searchCard({
      id: "CF9797D35B76EAE561373E686DCF3405",
      slug: "x",
      title: "Desarrollador Java &#x2B; python Fullstack Senior (Ingl&#xE9;s avanzado)",
    });
    const [card] = parseJobCards(html);
    expect(card.title).toBe("Desarrollador Java + python Fullstack Senior (Inglés avanzado)");
  });

  test("plain-text company (no link) parses cleanly, companyUrl null", () => {
    const html = searchCard({
      id: "AAAA0000000000000000000000000001",
      slug: "x",
      title: "Backend Dev",
      companyBlock: "SOLUTIX S.A. [Soluciones en Talento IT]    ",
    });
    const [card] = parseJobCards(html);
    expect(card.company).toBe("SOLUTIX S.A. [Soluciones en Talento IT]");
    expect(card.companyUrl).toBeNull();
  });

  test("linked company (with rating + verified badge) extracts name and companyUrl", () => {
    const html = searchCard({
      id: "AAAA0000000000000000000000000002",
      slug: "x",
      title: "Full-Stack Dev",
      companyBlock: `
            <span class="fx_none mr10">
                <span class="fwB">
                    4,2
                </span>
                <span class="star"></span>
            </span>
            <span class="icon i_verificada mr5"></span>
            <a class="fc_base t_ellipsis" href="https://ar.computrabajo.com/cys" target='_blank' offer-grid-article-company-url>
                C&amp;S inform&#xE1;tica s.a.
            </a>
    `,
    });
    const [card] = parseJobCards(html);
    expect(card.company).toBe("C&S informática s.a.");
    expect(card.companyUrl).toBe("https://ar.computrabajo.com/cys");
  });

  test("linked company: rating number does not leak into the company name (regression)", () => {
    // Discovered live during Step 4 verification: naively cleaning the whole
    // <p> (rating span + verified badge + link) produced "4,2 Solventa"
    // instead of "Solventa". Assert the rating text is excluded.
    const html = searchCard({
      id: "AAAA0000000000000000000000000009",
      slug: "x",
      title: "Dev",
      companyBlock: `
            <span class="fx_none mr10">
                <span class="fwB">4,2</span>
                <span class="star"></span>
            </span>
            <span class="icon i_verificada mr5"></span>
            <a class="fc_base t_ellipsis" href="https://ar.computrabajo.com/solventa" target='_blank' offer-grid-article-company-url>
                Solventa
            </a>
    `,
    });
    const [card] = parseJobCards(html);
    expect(card.company).toBe("Solventa");
    expect(card.company).not.toContain("4,2");
  });

  test("location with hex entity decoded", () => {
    const html = searchCard({
      id: "AAAA0000000000000000000000000003",
      slug: "x",
      title: "QA",
      location: "San Nicol&#xE1;s, Capital Federal",
    });
    const [card] = parseJobCards(html);
    expect(card.location).toBe("San Nicolás, Capital Federal");
  });

  test("Remoto workplace tag present -> does not affect location/company parsing", () => {
    const html = searchCard({
      id: "AAAA0000000000000000000000000004",
      slug: "x",
      title: "Remote Dev",
      location: "Monserrat, Capital Federal",
      remote: true,
      date: "Ayer",
    });
    const [card] = parseJobCards(html);
    expect(card.location).toBe("Monserrat, Capital Federal");
    expect(card.date).not.toBeNull();
  });

  test("date phrase normalized to an ISO date", () => {
    const html = searchCard({
      id: "AAAA0000000000000000000000000005",
      slug: "x",
      title: "Dev",
      date: "Hace  4  d&#xED;as",
    });
    const [card] = parseJobCards(html);
    expect(card.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("one malformed card does not break parsing of the next", () => {
    const good1 = searchCard({ id: "AAAA0000000000000000000000000006", slug: "a", title: "A" });
    const malformed = `<article class="box_offer  " data-id='AAAA0000000000000000000000000007' id="x">no title h2 here</article>`;
    const good2 = searchCard({ id: "AAAA0000000000000000000000000008", slug: "c", title: "C" });
    const cards = parseJobCards(good1 + malformed + good2);
    expect(cards.map((c) => c.id)).toEqual([
      "AAAA0000000000000000000000000006",
      "AAAA0000000000000000000000000008",
    ]);
  });

  test("no box_offer markup yields an empty array, not a crash", () => {
    expect(parseJobCards("<html><body>Sin resultados</body></html>")).toEqual([]);
  });
});

// Detail-page markup modeled on a real ar.computrabajo.com job detail page,
// trimmed to the fields this CLI parses.
const DETAIL_HTML = `
<h1 class="fwB fs24 mb5 box_detail w100_m">Desarrollador/a Full Stack PHP Sr</h1>
    <p class="fs16">Solventa - Retiro, Capital Federal</p>
    <div class="box_detail mtB mbB w100_m hide" already-applied-box-info></div>
<div class="box_border">
    <div class="info_company dFlex vm_fx mb10">
        <div class="logo_company">
            <a class="js-o-link" href="https://ar.computrabajo.com/solventa" target="_blank">
                <img src="x" alt="Solventa logo">
            </a>
        </div>
        <div class="w100">
            <a class="dIB fs16 js-o-link" href="https://ar.computrabajo.com/solventa" target="_blank">Solventa</a>
        </div>
    </div>
</div>
<div class="mb40 pb40 bb1" div-link="oferta">
	<h3 class="fwB fs18 mb20">Descripción de la oferta</h3>
	<div class="mbB">
			<span class="tag base mb10">A convenir</span>
			<span class="tag base mb10">Contrato por tiempo indeterminado</span>
			<span class="tag base mb10">Jornada completa</span>
			<span class="tag base mb10">Remoto</span>
	</div>
	<p class="mbB">Somos una Fintech l&iacute;der.<br /><br />Requisitos excluyentes:<br />- PHP.</p>

		<p class="fwB fs18 mtB mb10">Requerimientos</p>
		<ul class="disc mbB">
			<li class='mb10'>Educaci&#xF3;n m&#xED;nima: Terciario</li><li class='mb10'>5 a&#xF1;os de experiencia</li><li class='mb10'>Conocimientos: Php</li>
		</ul>

		<p class="fwB fs18 mtB mb10">Aptitudes asociadas a esta oferta<span class="new tag">Nuevo</span></p>
			<span class="tag bg_brand_light fc_base mr5 mt10 big" data-skill-id="2C8EFCE31B501533">Php</span>

		<p class="fc_aux fs13 mbB mtB">Palabras clave: developer, programador, senior, sr</p>


	<p class="fc_aux fs13">Hace  2  d&#xED;as (actualizada)</p>
	<div class="posSticky_m bottom0 bg_white pAllB_m mtB">
		<div class="w40 dFlex tc_fx mAuto w100_m">
			<a data-href-access="https://candidato.ar.computrabajo.com/match/?oi=8EC172F1E58E4B0261373E686DCF3405&amp;p=57&amp;idb=1" data-href-offer-apply="https://candidato.ar.computrabajo.com/match/?oi=8EC172F1E58E4B0261373E686DCF3405&amp;p=57&amp;idb=1" class="b_primary big w100 t_no_wrap" data-js-t-d>
				Postularme
			</a>
		</div>
	</div>
</div>
`;

describe("parseJobDetail", () => {
  const job = parseJobDetail(DETAIL_HTML, "8EC172F1E58E4B0261373E686DCF3405", new Date("2026-07-27T12:00:00Z"));

  test("title", () => {
    expect(job.title).toBe("Desarrollador/a Full Stack PHP Sr");
  });

  test("company + location split on the LAST ' - '", () => {
    expect(job.company).toBe("Solventa");
    expect(job.location).toBe("Retiro, Capital Federal");
  });

  test("companyUrl from the info_company sidebar link", () => {
    expect(job.companyUrl).toBe("https://ar.computrabajo.com/solventa");
  });

  test("tags classified by keyword: salary, contractType, schedule, workplaceType", () => {
    expect(job.salary).toBe("A convenir");
    expect(job.contractType).toBe("Contrato por tiempo indeterminado");
    expect(job.schedule).toBe("Jornada completa");
    expect(job.workplaceType).toBe("Remoto");
  });

  test("description: entities decoded, <br/> preserved as newlines, tags stripped", () => {
    expect(job.description).toContain("Somos una Fintech líder.");
    expect(job.description).toContain("Requisitos excluyentes:");
    expect(job.description).not.toMatch(/<[^>]+>/);
  });

  test("description: paragraph breaks from <br/><br/> survive tag-stripping (regression)", () => {
    // Discovered live during Step 4 verification: a naive stripTags collapses
    // \s+ (including \n) into a single space, silently flattening every <br/>
    // this code just inserted. Assert the break is still there as a real \n.
    expect(job.description).toMatch(/Somos una Fintech líder\.\n\nRequisitos excluyentes:/);
  });

  test("requirements list", () => {
    expect(job.requirements).toEqual([
      "Educación mínima: Terciario",
      "5 años de experiencia",
      "Conocimientos: Php",
    ]);
  });

  test("skills", () => {
    expect(job.skills).toEqual(["Php"]);
  });

  test("date normalized from 'Hace N días (actualizada)'", () => {
    expect(job.date).toBe("2026-07-25");
  });

  test("applyUrl", () => {
    expect(job.applyUrl).toBe(
      "https://candidato.ar.computrabajo.com/match/?oi=8EC172F1E58E4B0261373E686DCF3405&p=57&idb=1",
    );
  });

  test("url is reconstructed from the id via the placeholder-slug shortcut", () => {
    expect(job.url).toBe(
      "https://ar.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-x-8EC172F1E58E4B0261373E686DCF3405",
    );
  });
});

describe("parseJobDetail: anonymized employer", () => {
  const anonHtml = `
<h1 class="fwB fs24 mb5 box_detail w100_m">Desarrollador Full Stack Sr.</h1>
    <p class="fs16">Importante empresa del sector - Monserrat, Capital Federal</p>
<div class="mb40 pb40 bb1" div-link="oferta">
	<h3 class="fwB fs18 mb20">Descripción de la oferta</h3>
	<div class="mbB">
			<span class="tag base mb10">A convenir</span>
	</div>
	<p class="mbB">Texto.</p>
	<p class="fc_aux fs13">Ayer</p>
</div>
`;
  const job = parseJobDetail(anonHtml, "X", new Date("2026-07-27T12:00:00Z"));

  test("anonymized company text passed through as-is, not nulled", () => {
    expect(job.company).toBe("Importante empresa del sector");
  });

  test("location still parsed correctly", () => {
    expect(job.location).toBe("Monserrat, Capital Federal");
  });

  test("companyUrl null when no info_company block is present", () => {
    expect(job.companyUrl).toBeNull();
  });
});

describe("slugifyQuery", () => {
  test("lowercases and hyphenates spaces", () => {
    expect(slugifyQuery("Desarrollador Frontend")).toBe("desarrollador-frontend");
  });

  test("strips accents", () => {
    expect(slugifyQuery("Programación")).toBe("programacion");
  });

  test("collapses punctuation and trims stray hyphens", () => {
    expect(slugifyQuery("  Node.js / React!! ")).toBe("node-js-react");
  });
});

describe("normalizeId", () => {
  test("bare id passes through, uppercased", () => {
    expect(normalizeId("768b534b979680a861373e686dcf3405")).toBe("768B534B979680A861373E686DCF3405");
  });

  test("extracts the trailing id from a full URL", () => {
    expect(
      normalizeId(
        "https://ar.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-desarrollador-full-stack-sr-768B534B979680A861373E686DCF3405",
      ),
    ).toBe("768B534B979680A861373E686DCF3405");
  });

  test("extracts the id from a URL with a #lc= fragment", () => {
    expect(
      normalizeId(
        "https://ar.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-x-8EC172F1E58E4B0261373E686DCF3405#lc=ListOffers-Score3-1",
      ),
    ).toBe("8EC172F1E58E4B0261373E686DCF3405");
  });

  test("rejects empty input", () => {
    expect(normalizeId("")).toBeNull();
    expect(normalizeId("   ")).toBeNull();
  });

  test("rejects a string with no id-shaped segment", () => {
    expect(normalizeId("not-a-url-or-id")).toBeNull();
  });
});

describe("normalizeRelativeDate", () => {
  const now = new Date("2026-07-27T12:00:00Z");

  test("Hoy -> today", () => {
    expect(normalizeRelativeDate("Hoy", now)).toBe("2026-07-27");
  });

  test("Ayer -> yesterday", () => {
    expect(normalizeRelativeDate("Ayer", now)).toBe("2026-07-26");
  });

  test("'Hace N horas' -> today", () => {
    expect(normalizeRelativeDate("Hace  15  horas", now)).toBe("2026-07-27");
  });

  test("'Hace N días' -> N days back, tolerating doubled whitespace", () => {
    expect(normalizeRelativeDate("Hace  4  días", now)).toBe("2026-07-23");
  });

  test("'D de mes' rolls back a year when the naive guess would be in the future", () => {
    // "25 de diciembre" relative to Jul 27 2026 would be in the future this
    // year, so it must mean Dec 25 of the *previous* year.
    expect(normalizeRelativeDate("25 de diciembre", now)).toBe("2025-12-25");
  });

  test("'D de mes' within the past this year", () => {
    expect(normalizeRelativeDate("16 de julio", now)).toBe("2026-07-16");
  });

  test("strips a trailing '(actualizada)' suffix before parsing", () => {
    expect(normalizeRelativeDate("Ayer (actualizada)", now)).toBe("2026-07-26");
  });

  test("returns null for unparseable text", () => {
    expect(normalizeRelativeDate("mañana", now)).toBeNull();
    expect(normalizeRelativeDate("", now)).toBeNull();
    expect(normalizeRelativeDate(null, now)).toBeNull();
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
  test("parses the total from the <h1> badge", () => {
    const html = `<h1 class="fwB fs24"><span class="fwB">23</span> Ofertas de trabajo de desarrollador frontend</h1>`;
    expect(parseTotalResults(html)).toBe(23);
  });

  test("handles thousands separators", () => {
    const html = `<h1><span class="fwB">1.234</span> Ofertas de empleo</h1>`;
    expect(parseTotalResults(html)).toBe(1234);
  });

  test("returns null when no badge is present", () => {
    expect(parseTotalResults("<html><body>no h1 here</body></html>")).toBeNull();
  });
});

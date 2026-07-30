# Future portal candidates (Argentina / LatAm)

Not built yet — research notes for later `/add-portal` work, alongside the 6 already installed
(GetOnBoard, Computrabajo, Bumeran, Zonajobs, Himalayas, plus the pre-existing LinkedIn/freehire).

## Construidos desde que se armó esta lista

- **Himalayas.app** — ✅ construido (`himalayas-search`). Mejor de lo esperado: tiene API JSON
  pública y documentada (`/jobs/api`, OpenAPI spec, licencia "free to use with attribution"), sin
  necesidad de scrapear HTML. País Argentina confirmado con 2.642 avisos activos.
- **Indeed Argentina** — ❌ intentado, **bloqueado técnicamente**. Cloudflare exige un challenge
  interactivo (JS real) hasta en la página de inicio, no solo en la búsqueda — un CLI liviano
  (`bun`+`fetch`, sin dependencias, como usan todos los portales de este framework) no lo puede
  resolver. Requeriría un navegador headless (arquitectura completamente distinta, y encima poco
  confiable porque el challenge es adaptativo) — no se descarta para siempre, pero es una decisión
  de arquitectura aparte, no un simple `/add-portal` más.

## Prioridad media (mencionados, sin verificar en profundidad)

- **WeRemoto** (weremoto.com) — agregador de remoto para toda LatAm, con categoría IT específica.
  Confirmado bien server-rendered (nada de SPA), con empresas reconocibles (Cloudbeds, Twilio,
  HubSpot) — buena señal para scrapear, sin investigar API/robots.txt todavía.
- **Portal Empleo** (portal de empleo del gobierno argentino) — volumen grande (~53.000 empresas
  registradas según lo relevado), pero probablemente mucho ruido para roles senior de tech.
- **Torre.co** — marketplace de talento remoto LatAm, aparece mencionado seguido como alternativa
  a LinkedIn en la región.

## Descartados, con motivo

- **Tecnoempleo** — centrado en España, sumaría al problema de "muchos resultados de Europa".
- **Workana** — freelance/por proyecto, no roles full-time.

## Cómo proceder

Cuando se quiera avanzar con alguno: mismo proceso que GetOnBoard/Computrabajo/Bumeran/Zonajobs —
investigar el portal (URL de búsqueda, HTML vs API, robots.txt), scaffoldear el CLI siguiendo el
contrato de `.claude/commands/add-portal.md`, y verificar con una búsqueda real antes de registrar.

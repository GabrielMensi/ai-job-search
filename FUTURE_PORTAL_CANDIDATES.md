# Future portal candidates (Argentina / LatAm)

Not built yet — research notes for later `/add-portal` work, alongside the 4 already installed
(GetOnBoard, Computrabajo, Bumeran, Zonajobs).

## Priority alta (verificados, buena señal)

- **Indeed Argentina** (ar.indeed.com) — agregador global grande, interfaz en español, filtro de
  remoto ("remoto"/"desde casa") y filtro de sueldo en dólares. El más sólido de los tres.
- **Himalayas.app** (filtrado a Argentina: `himalayas.app/jobs/countries/argentina`) — portal de
  trabajo remoto internacional, ~2.500 ofertas activas para Argentina al momento de chequear
  (julio 2026), filtros por skill/seniority/salario. Renderizado híbrido (contenido real en el
  HTML inicial) — más fácil de scrapear que una SPA pura.
- **WeRemoto** (weremoto.com) — agregador de remoto para toda LatAm, con categoría IT específica.
  Confirmado bien server-rendered (nada de SPA), con empresas reconocibles (Cloudbeds, Twilio,
  HubSpot) — probablemente el más simple de scrapear de los tres.

## Prioridad media (mencionados, sin verificar en profundidad)

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

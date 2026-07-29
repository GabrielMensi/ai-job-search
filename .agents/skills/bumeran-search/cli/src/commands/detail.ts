import { apiRequest, mapAvisoDetail, normalizeId, writeError, type RawAvisoDetail } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

interface RawFichaResponse {
  aviso: RawAvisoDetail
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a job id from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const data = await apiRequest<RawFichaResponse>(`api/candidates/fichaAvisoNormalizada/${id}`, {
      method: "GET",
      referer: `https://www.bumeran.com.ar/empleos/aviso-${id}.html`,
    })
    if (!data || !data.aviso) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = mapAvisoDetail(data.aviso)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.seniority ? `Seniority: ${job.seniority}` : "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.workMode ? `Work mode: ${job.workMode}` : "",
        job.category ? `Category: ${job.category}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
        job.applyUrl ? `Apply: ${job.applyUrl}` : "",
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}

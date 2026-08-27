/**
 * Data-lake archive helpers. Kept pure so the URL shape, paging order and
 * delete strategy can be tested without Cloudflare or PostgREST.
 *
 * `observed_arrivals` has no `id` column (PK is trip_id+stop_id). A
 * `DELETE ?timeColumn=lt.cutoff` after the first 5000-row page would wipe
 * rows we have not uploaded. Always delete exactly the rows just archived.
 */

export type ArchiveRow = Record<string, unknown>;

export const ARCHIVE_PAGE = 5000;
export const DELETE_ID_CHUNK = 200;
export const DELETE_COMPOSITE_CHUNK = 40;

export function archiveSelectUrl(
  baseUrl: string,
  table: string,
  timeColumn: string,
  cutoffIso: string,
  limit = ARCHIVE_PAGE,
): string {
  const base = baseUrl.replace(/\/+$/, "");
  const params = new URLSearchParams();
  params.set(timeColumn, `lt.${cutoffIso}`);
  params.set("order", `${timeColumn}.asc,trip_id.asc,stop_id.asc`);
  params.set("limit", String(limit));
  return `${base}/rest/v1/${table}?${params.toString()}`;
}

function quote(value: unknown): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function deleteUrls(baseUrl: string, table: string, rows: ArchiveRow[]): string[] {
  const base = baseUrl.replace(/\/+$/, "");
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id).filter((id) => id != null && id !== "");
  if (ids.length === rows.length) {
    const urls: string[] = [];
    for (let i = 0; i < ids.length; i += DELETE_ID_CHUNK) {
      const chunk = ids.slice(i, i + DELETE_ID_CHUNK);
      urls.push(`${base}/rest/v1/${table}?id=in.(${chunk.join(",")})`);
    }
    return urls;
  }

  const urls: string[] = [];
  for (let i = 0; i < rows.length; i += DELETE_COMPOSITE_CHUNK) {
    const chunk = rows.slice(i, i + DELETE_COMPOSITE_CHUNK);
    const or = chunk
      .map((r) => `and(trip_id.eq.${quote(r.trip_id)},stop_id.eq.${quote(r.stop_id)})`)
      .join(",");
    urls.push(`${base}/rest/v1/${table}?or=(${or})`);
  }
  return urls;
}

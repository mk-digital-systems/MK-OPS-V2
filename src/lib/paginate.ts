/**
 * Supabase/PostgREST tek istekte en fazla `max_rows` (varsayılan 1000) satır döndürür; daha fazlası istense
 * bile sessizce kesilir. Bu yardımcı sayfa sayfa okur, sunucunun gerçekte kaç satır döndürdüğüne göre
 * ilerler (istenen sayıya güvenmez), tekrar eden satırları ayıklar ve eksik kalırsa `truncated` bildirir.
 */
export async function fetchAllPages<T extends { id: string }>(
  fetchPage: (from: number, to: number) => Promise<{ rows: T[]; total: number }>,
  options: { batchSize?: number; maxRows?: number } = {}
): Promise<{ rows: T[]; total: number; truncated: boolean }> {
  const batchSize = Math.max(1, options.batchSize ?? 1000);
  const maxRows = Math.max(1, options.maxRows ?? 20000);
  const seen = new Map<string, T>();
  let total = 0;
  let from = 0;

  while (true) {
    const page = await fetchPage(from, from + batchSize - 1);
    total = page.total;
    if (page.rows.length === 0) break;
    for (const row of page.rows) if (!seen.has(row.id)) seen.set(row.id, row);
    from += page.rows.length;
    if (from >= total || seen.size >= maxRows) break;
  }

  const rows = [...seen.values()].slice(0, maxRows);
  return { rows, total, truncated: rows.length < total };
}

/**
 * 외부 라이브러리 없이 Supabase PostgREST API를 직접 호출하는 경량 서버 헬퍼
 */
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, '') || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function headers() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

export async function getTkeyState(): Promise<Record<string, unknown> | null> {
  if (!isSupabaseConfigured()) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/tkey_state?id=eq.default&select=*`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<Record<string, unknown>>;
  return data[0] ?? null;
}

export async function upsertTkeyState(patch: Record<string, unknown>): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await fetch(`${SUPABASE_URL}/rest/v1/tkey_state?id=eq.default`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
}

export async function getPerformanceCache(
  kind: 'wireless' | 'wired'
): Promise<Array<Record<string, unknown>>> {
  if (!isSupabaseConfigured()) return [];
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/performance_cache?kind=eq.${kind}&select=rows`,
    { headers: headers(), cache: 'no-store' }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as Array<{ rows?: Array<Record<string, unknown>> }>;
  return data[0]?.rows ?? [];
}

export async function savePerformanceCache(
  kind: 'wireless' | 'wired',
  rows: Array<Record<string, unknown>>
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await fetch(`${SUPABASE_URL}/rest/v1/performance_cache?kind=eq.${kind}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({
      rows,
      row_count: rows.length,
      updated_at: new Date().toISOString(),
    }),
  });
}

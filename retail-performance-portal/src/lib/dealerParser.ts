import type { DealerRankRow, DealerSnapshot } from './types';

export function normalizeDealerName(name: string): string {
  return name.replace(/\s+/g, '').trim();
}

export function parseDealerHour(text: string): number | null {
  const m = text.match(/\[(\d{1,2})시_/);
  return m ? Number(m[1]) : null;
}

export function parseWirelessDealerText(text: string): {
  hour: number | null;
  rows: Array<{ name: string; zero: number; mnp: number; change: number }>;
} {
  const rows: Array<{ name: string; zero: number; mnp: number; change: number }> = [];
  const lines = text
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (/^■?수도권_/.test(line)) continue;
    const m = line.match(/^([^_\[\]■]+)_(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)$/);
    if (m) {
      rows.push({
        name: normalizeDealerName(m[1]),
        zero: Number(m[2]),
        mnp: Number(m[3]),
        change: Number(m[4]),
      });
    }
  }
  return { hour: parseDealerHour(text), rows };
}

export function parseWiredDealerText(text: string): {
  hour: number | null;
  rows: Array<{ name: string; internet: number; tv: number }>;
} {
  const rows: Array<{ name: string; internet: number; tv: number }> = [];
  const lines = text
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (/^■?수도권\s*초_/i.test(line)) continue;
    const m = line.match(/^(.+?)\s*초_(\d+)\s*\/\s*TV_(\d+)$/i);
    if (m) {
      rows.push({
        name: normalizeDealerName(m[1]),
        internet: Number(m[2]),
        tv: Number(m[3]),
      });
    }
  }
  return { hour: parseDealerHour(text), rows };
}

export function computeDealerRanking(
  wirelessText: string,
  wiredText: string
): {
  ranked: DealerRankRow[];
  hour: number | null;
  timeMismatch: boolean;
  leaderTotal: number;
  target: DealerRankRow | null;
} {
  const w = parseWirelessDealerText(wirelessText);
  const i = parseWiredDealerText(wiredText);
  const wiredMap = new Map(i.rows.map((r) => [r.name, r]));

  const FIXED_DEALERS = [
    'ACT', 'MD', 'UNI', 'CD', '대교', '광장', '지은', '서울ENT', '참스타', '가능',
    '삼보', '신창', '프리스비', '새서울', '한유', '정원', '강남스타', '근흥', '유원', '코넥', '알파',
  ];
  const wMap = new Map(w.rows.map((r) => [r.name, r]));
  const allNames = [...FIXED_DEALERS];
  w.rows.forEach((r) => {
    if (!allNames.includes(r.name)) allNames.push(r.name);
  });

  const merged = allNames.map((name) => {
    const wv = wMap.get(name) || { zero: 0, mnp: 0, change: 0 };
    const wi = wiredMap.get(name);
    return {
      name,
      zero: wv.zero,
      mnp: wv.mnp,
      change: wv.change,
      total: wv.zero + wv.mnp + wv.change,
      internet: wi ? wi.internet : null,
      tv: wi ? wi.tv : null,
    };
  });

  merged.sort(
    (a, b) =>
      b.total - a.total ||
      FIXED_DEALERS.indexOf(a.name) - FIXED_DEALERS.indexOf(b.name) ||
      a.name.localeCompare(b.name, 'ko')
  );

  let prevTotal: number | null = null;
  let rank = 0;
  const ranked: DealerRankRow[] = merged
    .map((r, idx) => {
      if (r.total !== prevTotal) rank = idx + 1;
      prevTotal = r.total;
      return { ...r, rank };
    })
    .slice(0, 20);

  const hour = w.hour ?? i.hour;
  const timeMismatch = w.hour !== null && i.hour !== null && w.hour !== i.hour;
  const leaderTotal = ranked[0]?.total || 0;
  const target = ranked.find((r) => r.name === '대교') || null;

  return { ranked, hour, timeMismatch, leaderTotal, target };
}

export function parseBulkMemoSnapshots(text: string, date: string): DealerSnapshot[] {
  const items: DealerSnapshot[] = [];
  const seen = new Set<number>();
  const regex =
    /(?:^|\n)\s*[-·•]?\s*(0?9|10|11|12|13|14|15|16|17|18|19|20)\s*시\s*[:：-]?\s*(\d+)\s*대\s*[,/\s]*\s*(\d+)\s*위/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const hour = Number(m[1]);
    if (seen.has(hour)) continue;
    seen.add(hour);
    items.push({
      date,
      hour,
      total: Number(m[2]),
      rank: Number(m[3]),
    });
  }
  return items.sort((a, b) => a.hour - b.hour);
}

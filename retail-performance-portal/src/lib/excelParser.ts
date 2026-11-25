import * as XLSX from 'xlsx';
import type {
  ChannelMetricRow,
  ChannelReportState,
  ModelGroup,
  RangeMode,
  SalesCategory,
  StoreConfig,
  WiredRecord,
  WirelessRecord,
} from './types';

export const DEFAULT_STORE_CONFIG: StoreConfig = {
  names: [
    '평촌학원가점',
    '수원역직영점',
    '평촌역점',
    '스마트직영점',
    '범계역직영점',
    '의왕점',
    '산본점',
    '범계점',
    '만안점',
    '본점',
    '의왕역점',
    '군포역점',
    '인덕원점',
    '독산점',
    '상동점',
    '천천점',
    '덕천직영점',
  ],
  direct: ['범계역직영점', '의왕점', '상동점', '덕천직영점'],
  aliases: {
    '(안양동)엘케이모바일안양점': '만안점',
    '엘케이모바일안양점': '만안점',
  },
};

export const DEFAULT_MODEL_GROUPS: ModelGroup[] = [
  { name: '와이드9', patterns: 'SM-M176', colorEnabled: false, color: '#fff2a8' },
  { name: '퀀텀6', patterns: 'SM-A566', colorEnabled: false, color: '#fff2a8' },
  { name: '퀀텀7', patterns: 'A576', colorEnabled: false, color: '#ffbea8' },
  { name: 'A175', patterns: 'SM-A175', colorEnabled: false, color: '#fff2a8' },
  { name: 'A185', patterns: 'SM-A185', colorEnabled: false, color: '#fff2a8' },
  { name: 'S731', patterns: 'SM-S731', colorEnabled: false, color: '#fff2a8' },
  { name: '플립7 FE', patterns: 'SM-F761', colorEnabled: true, color: '#f0d2fe' },
  { name: 'S26계열', patterns: 'S942,S947,S948', colorEnabled: true, color: '#96fdbd' },
  { name: '폴더블8계열', patterns: 'F971,F976,F776', colorEnabled: true, color: '#8ef28c' },
  { name: 'IP18계열', patterns: 'IP18P,IP18PM', colorEnabled: true, color: '#ff9e9e' },
];

export const compactStr = (v: unknown): string =>
  String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

export function normalizeSheetRef(ws: XLSX.WorkSheet): void {
  const cellRefs = Object.keys(ws).filter((k) => k[0] !== '!');
  if (!cellRefs.length) return;
  let minR = Infinity;
  let minC = Infinity;
  let maxR = 0;
  let maxC = 0;
  for (const addr of cellRefs) {
    const c = XLSX.utils.decode_cell(addr);
    if (c.r < minR) minR = c.r;
    if (c.c < minC) minC = c.c;
    if (c.r > maxR) maxR = c.r;
    if (c.c > maxC) maxC = c.c;
  }
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: minR, c: minC },
    e: { r: maxR, c: maxC },
  });
}

export function dateKey(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(
      v.getDate()
    ).padStart(2, '0')}`;
  }
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) {
      return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    }
  }
  const text = String(v ?? '').trim();
  const m = text.match(/(20\d{2})[-/.년 ]\s*(\d{1,2})[-/.월 ]\s*(\d{1,2})/);
  if (m) {
    return `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`;
  }
  if (/^\d{8}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }
  return '';
}

export function parseTimeSeconds(v: unknown): { timeStr: string; seconds: number } {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const h = v.getHours();
    const m = v.getMinutes();
    const s = v.getSeconds();
    return {
      timeStr: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
      seconds: h * 3600 + m * 60 + s,
    };
  }
  if (typeof v === 'number') {
    const frac = ((v % 1) + 1) % 1;
    const total = Math.round(frac * 86400);
    const h = Math.floor(total / 3600) % 24;
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return {
      timeStr: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
      seconds: total,
    };
  }
  const s = String(v ?? '').trim();
  const m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return { timeStr: '00:00:00', seconds: 0 };
  const hh = +m[1];
  const mm = +m[2];
  const ss = +(m[3] || 0);
  return {
    timeStr: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`,
    seconds: hh * 3600 + mm * 60 + ss,
  };
}

export function classifyModel(raw: string, groups: ModelGroup[]): string | null {
  const m = compactStr(raw);
  if (!m) return null;
  for (const g of groups) {
    const patterns = g.patterns
      .split(',')
      .map((p) => compactStr(p))
      .filter(Boolean);
    if (patterns.some((p) => m.includes(p))) {
      return g.name;
    }
  }
  return null;
}

export function normalizeStoreName(raw: string, config: StoreConfig): string {
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/^대교대리점\s*/, '')
    .replace(/\s+/g, '');
  if (!cleaned) return '미매칭 소매';

  const aliasHit = config.aliases[cleaned];
  if (aliasHit && config.names.includes(aliasHit)) return aliasHit;

  const exact = config.names.find((n) => n.replace(/\s+/g, '') === cleaned);
  if (exact) return exact;

  const contained = config.names
    .slice()
    .sort((a, b) => b.length - a.length)
    .find((n) => {
      const target = n.replace(/\s+/g, '');
      return cleaned.includes(target) || target.includes(cleaned);
    });
  if (contained) return contained;

  // 지정 17개 외 소매 매장도 소매 전체에 포함되도록 원본명(대교대리점 접두어 제거) 반환
  return String(raw ?? '').trim().replace(/^대교대리점\s*/, '') || '미매칭 소매';
}

function getWirelessCategory(detail: string, openType: string): SalesCategory | null {
  const d = compactStr(detail);
  const o = compactStr(openType);
  if (d.includes('중고')) {
    if (d.includes('기변')) return null;
    if (d.includes('MNP')) return '중고MNP';
    if (d.includes('신규') || d.includes('010')) return '중고신규';
  }
  if (d.includes('MNP')) return 'MNP';
  if (d.includes('기변') || o.includes('기변')) return '기변';
  if (d.includes('신규') || d.includes('010') || o.includes('신규')) return '010';
  return null;
}

function isWirelessExcludedFromHS(
  processType: string,
  changeHistory: string,
  detailType: string,
  planName: string
): boolean {
  const pl = compactStr(planName);
  return (
    processType.includes('처리제외') ||
    changeHistory.includes('취소') ||
    changeHistory.includes('기타변경') ||
    (detailType.includes('중고') && detailType.includes('기변')) ||
    ['함께쓰기', 'TAB', '탭', 'WATCH', '워치'].some((k) => pl.includes(k))
  );
}

export function parseWirelessExcel(
  buffer: ArrayBuffer,
  storeConfig: StoreConfig,
  modelGroups: ModelGroup[]
): WirelessRecord[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  normalizeSheetRef(ws);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  if (!rows.length) return [];

  const required = [
    '처리구분',
    '판매변경이력',
    '개통유형',
    '개통일',
    '개통시간',
    '판매채널구분',
    '개통처명',
    '세부판매유형',
    '단말기판매여부',
    '요금제',
  ];
  const sample = rows[0] || {};
  const missing = required.filter((k) => !(k in sample));
  if (missing.length) {
    throw new Error(`무선 파일 필수 열 누락: ${missing.join(', ')}`);
  }

  return rows
    .map((r, idx): WirelessRecord | null => {
      const openDate = dateKey(r['개통일']);
      if (!openDate) return null;
      const { timeStr, seconds } = parseTimeSeconds(r['개통시간']);
      const processType = String(r['처리구분'] ?? '').trim();
      const changeHistory = String(r['판매변경이력'] ?? '').trim();
      const openType = String(r['개통유형'] ?? '').trim();
      const detailType = String(r['세부판매유형'] ?? '').trim();
      const planName = String(r['요금제'] ?? '').trim();
      const channelType = String(r['판매채널구분'] ?? '').trim();
      const isWholesale = channelType.includes('도매');
      const isPickup = !isWholesale && channelType === '소매5(O2O)';
      const storeRaw = String(r['개통처명'] ?? '').trim();
      const storeName = isWholesale ? '도매' : normalizeStoreName(storeRaw, storeConfig);
      const deviceRaw = String(r['단말기'] ?? '').trim();
      const deviceSold = String(r['단말기판매여부'] ?? '').trim().toUpperCase() === 'Y';
      const category = getWirelessCategory(detailType, openType);
      const isExcludedFromHS = isWirelessExcludedFromHS(
        processType,
        changeHistory,
        detailType,
        planName
      );

      // 취소/기타변경/처리제외/중고기변은 완전 제외
      if (
        processType.includes('처리제외') ||
        changeHistory.includes('취소') ||
        changeHistory.includes('기타변경') ||
        (detailType.includes('중고') && detailType.includes('기변'))
      ) {
        return null;
      }

      const modelGroup = deviceSold ? classifyModel(deviceRaw, modelGroups) : null;

      return {
        id: `W-${idx + 1}`,
        openDate,
        openTime: timeStr,
        timeSeconds: seconds,
        channelType,
        isWholesale,
        isPickup,
        storeRaw,
        storeName,
        processType,
        changeHistory,
        openType,
        detailType,
        category,
        deviceRaw,
        deviceSold,
        planName,
        modelGroup,
        isExcludedFromHS,
      };
    })
    .filter((x): x is WirelessRecord => x !== null);
}

export function parseWiredExcel(buffer: ArrayBuffer, storeConfig: StoreConfig): WiredRecord[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  normalizeSheetRef(ws);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  if (!rows.length) return [];

  const required = ['진행상태', '서비스청약일자', '서비스상세구분명', '레벨1조직명', '판매처명'];
  const sample = rows[0] || {};
  const missing = required.filter((k) => !(k in sample));
  if (missing.length) {
    throw new Error(`유선 파일 필수 열 누락: ${missing.join(', ')}`);
  }

  return rows
    .map((r, idx): WiredRecord | null => {
      const status = String(r['진행상태'] ?? '').trim();
      if (status.includes('취소') || !(status === '접수' || status === '개통')) {
        return null;
      }
      const serviceDate = dateKey(r['서비스청약일자']);
      if (!serviceDate) return null;
      const rawTime = r['서비스청약시각'] ?? r['서비스가입시각'] ?? '';
      const { timeStr, seconds } = parseTimeSeconds(rawTime);

      const detail = String(r['서비스상세구분명'] ?? '').trim().toUpperCase();
      let productType: '초고속' | 'IPTV' | null = null;
      if (detail.includes('인터넷')) productType = '초고속';
      else if (detail.includes('BTV') || detail.includes('IP-CATV')) productType = 'IPTV';
      if (!productType) return null;

      const level1Org = String(r['레벨1조직명'] ?? '').trim();
      const isWholesale = level1Org.includes('도매');
      const storeRaw = String(r['판매처명'] ?? r['개통처명'] ?? '').trim();
      const storeName = isWholesale ? '도매' : normalizeStoreName(storeRaw, storeConfig);

      return {
        id: `D-${idx + 1}`,
        serviceDate,
        serviceTime: timeStr,
        timeSeconds: seconds,
        status,
        productRaw: detail,
        productType,
        level1Org,
        isWholesale,
        storeRaw,
        storeName,
      };
    })
    .filter((x): x is WiredRecord => x !== null);
}

export function emptyMetricRow(modelGroups: ModelGroup[]): ChannelMetricRow {
  const row: ChannelMetricRow = {
    '010': 0,
    중고신규: 0,
    중고MNP: 0,
    MNP: 0,
    기변: 0,
    바로픽업: 0,
    HS: 0,
    초고속: 0,
    IPTV: 0,
  };
  for (const g of modelGroups) {
    row[g.name] = 0;
  }
  return row;
}

export function isIncludedInDateRange(
  dateStr: string,
  timeSeconds: number,
  options: {
    date: string;
    slot: number;
    rangeMode: RangeMode;
    periodStart: string;
    periodEnd: string;
  }
): boolean {
  if (!dateStr) return false;
  if (options.rangeMode === 'month') {
    const targetMonth = (options.date || '').slice(0, 7);
    return targetMonth ? dateStr.slice(0, 7) === targetMonth : true;
  }
  const cutoffSec = options.slot >= 20 ? 86400 : Math.floor(options.slot * 3600);
  if (options.rangeMode === 'period') {
    if (!options.periodStart || !options.periodEnd) return false;
    if (dateStr < options.periodStart || dateStr > options.periodEnd) return false;
    if (dateStr === options.periodEnd && options.slot < 20) {
      return timeSeconds <= cutoffSec;
    }
    return true;
  }
  if (dateStr !== options.date) return false;
  return options.slot >= 20 ? true : timeSeconds <= cutoffSec;
}

export function aggregateChannelReport(
  wireless: WirelessRecord[],
  wired: WiredRecord[],
  storeConfig: StoreConfig,
  modelGroups: ModelGroup[],
  options: {
    date: string;
    slot: number;
    rangeMode: RangeMode;
    periodStart: string;
    periodEnd: string;
  }
): ChannelReportState {
  const stores: Record<string, ChannelMetricRow> = {};
  for (const name of storeConfig.names) {
    stores[name] = emptyMetricRow(modelGroups);
  }
  const wholesale = emptyMetricRow(modelGroups);
  const extraSet = new Set<string>();

  const ensureStore = (name: string): ChannelMetricRow => {
    if (!stores[name]) {
      stores[name] = emptyMetricRow(modelGroups);
      extraSet.add(name);
    }
    return stores[name];
  };

  for (const r of wireless) {
    if (!isIncludedInDateRange(r.openDate, r.timeSeconds, options)) continue;
    const target = r.isWholesale ? wholesale : ensureStore(r.storeName);

    if (!r.isExcludedFromHS) {
      if (r.category) target[r.category]++;
      if (r.isPickup) target['바로픽업']++;
      if (r.category !== '중고신규' && r.category !== '중고MNP' && r.deviceSold && r.modelGroup) {
        target[r.modelGroup] = (target[r.modelGroup] || 0) + 1;
      }
      target['HS'] = target['010'] + target['MNP'] + target['기변'];
    } else {
      // WATCH/워치 요금제 등 H/S 제외 건이라도 워치9 등 등록 모델군은 별도 산정
      if (
        r.category !== '중고신규' &&
        r.category !== '중고MNP' &&
        r.deviceSold &&
        r.modelGroup === '워치9'
      ) {
        target['워치9'] = (target['워치9'] || 0) + 1;
      }
    }
  }

  for (const r of wired) {
    if (!isIncludedInDateRange(r.serviceDate, r.timeSeconds, options)) continue;
    const target = r.isWholesale ? wholesale : ensureStore(r.storeName);
    target[r.productType] = (target[r.productType] || 0) + 1;
  }

  const retail = emptyMetricRow(modelGroups);
  const allStoreNames = [...storeConfig.names, ...Array.from(extraSet)];
  const metricKeys = Object.keys(retail);
  for (const name of allStoreNames) {
    for (const k of metricKeys) {
      retail[k] = (retail[k] || 0) + (stores[name]?.[k] || 0);
    }
  }

  return {
    ...options,
    wholesale,
    retail,
    stores,
    extraRetailNames: Array.from(extraSet).sort((a, b) => a.localeCompare(b, 'ko')),
  };
}

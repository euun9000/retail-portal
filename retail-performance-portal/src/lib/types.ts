export type MainTab = 'sales' | 'report' | 'users';
export type ReportSubTab = 'channel' | 'dealer';
export type UserSubTab = 'tkey' | 'accounts';
export type RangeMode = 'day' | 'period' | 'month';
export type ChannelFilter = 'all' | 'retail' | 'wholesale';
export type SalesCategory = '010' | '중고신규' | '중고MNP' | 'MNP' | '기변';

export interface WirelessRecord {
  id: string;
  openDate: string; // YYYY-MM-DD
  openTime: string; // HH:MM:SS
  timeSeconds: number;
  channelType: string; // 판매채널구분 (소매1, 소매5(O2O), 일반도매 등)
  isWholesale: boolean;
  isPickup: boolean; // 소매5(O2O)
  storeRaw: string;
  storeName: string; // 정규화된 매장명 (도매는 '도매')
  processType: string;
  changeHistory: string;
  openType: string;
  detailType: string;
  category: SalesCategory | null;
  deviceRaw: string;
  deviceSold: boolean;
  planName: string;
  modelGroup: string | null;
  isExcludedFromHS: boolean;
}

export interface WiredRecord {
  id: string;
  serviceDate: string; // YYYY-MM-DD
  serviceTime: string;
  timeSeconds: number;
  status: string; // 접수, 개통, 취소
  productRaw: string;
  productType: '초고속' | 'IPTV';
  level1Org: string;
  isWholesale: boolean;
  storeRaw: string;
  storeName: string;
}

export interface ModelGroup {
  name: string;
  patterns: string;
  colorEnabled: boolean;
  color: string;
}

export interface StoreConfig {
  names: string[]; // 기본 17개 소매 매장
  direct: string[]; // 직영점 강조 목록
  aliases: Record<string, string>;
}

export interface ChannelMetricRow {
  '010': number;
  중고신규: number;
  중고MNP: number;
  MNP: number;
  기변: number;
  바로픽업: number;
  HS: number;
  초고속: number;
  IPTV: number;
  [modelGroup: string]: number;
}

export interface ChannelReportState {
  date: string;
  slot: number; // 13 | 15 | 17 | 20 | float
  rangeMode: RangeMode;
  periodStart: string;
  periodEnd: string;
  wholesale: ChannelMetricRow;
  retail: ChannelMetricRow;
  stores: Record<string, ChannelMetricRow>;
  extraRetailNames: string[]; // 17개 지정 매장 외 소매 전체 포함을 위한 추가 매장명
}

export interface DealerRankRow {
  rank: number;
  name: string;
  zero: number;
  mnp: number;
  change: number;
  total: number;
  internet: number | null;
  tv: number | null;
}

export interface DealerSnapshot {
  date: string;
  hour: number; // 13 | 15 | 17 | 20
  total: number;
  rank: number;
}

export interface TkeyScheduleConfig {
  enabled: boolean;
  startHour: number; // 9
  endHour: number; // 21
  wirelessIntervalMin: number; // 10 | 30 | 60
  wiredIntervalMin: number; // 30 | 60
}

export interface TkeySyncLog {
  id: string;
  timestamp: string;
  type: 'auto' | 'manual' | 'upload';
  status: 'success' | 'warning' | 'error';
  message: string;
  wirelessCount?: number;
  wiredCount?: number;
}

export interface TeamPermission {
  id: string;
  name: string;
  tabs: Record<MainTab, boolean>;
}

export interface UserAccount {
  id: string;
  name: string;
  empCode: string;
  teamId: string;
  role: '상위관리자' | '팀장' | '매니저';
  status: '이용중' | '승인대기' | '로그인 잠금' | '퇴사자';
  lastLogin: string;
}

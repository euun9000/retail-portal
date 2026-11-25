'use client';

import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import type {
  ChannelFilter,
  ModelGroup,
  RangeMode,
  StoreConfig,
  WiredRecord,
  WirelessRecord,
} from '@/lib/types';
import { isIncludedInDateRange } from '@/lib/excelParser';

interface Props {
  wireless: WirelessRecord[];
  wired: WiredRecord[];
  storeConfig: StoreConfig;
  modelGroups: ModelGroup[];
  reportDate: string;
  onChangeDate: (d: string) => void;
}

export default function SalesStatusTab({
  wireless,
  wired,
  storeConfig,
  modelGroups,
  reportDate,
  onChangeDate,
}: Props) {
  const [rangeMode, setRangeMode] = useState<RangeMode>('day');
  const [periodStart, setPeriodStart] = useState(reportDate);
  const [periodEnd, setPeriodEnd] = useState(reportDate);
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [storeFilter, setStoreFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [modelFilter, setModelFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const filteredWireless = useMemo(() => {
    const q = search.trim().toLowerCase();
    return wireless.filter((r) => {
      if (
        !isIncludedInDateRange(r.openDate, r.timeSeconds, {
          date: reportDate,
          slot: 20,
          rangeMode,
          periodStart,
          periodEnd,
        })
      ) {
        return false;
      }
      if (channelFilter === 'retail' && r.isWholesale) return false;
      if (channelFilter === 'wholesale' && !r.isWholesale) return false;
      if (storeFilter !== 'ALL' && r.storeName !== storeFilter) return false;
      if (typeFilter !== 'ALL' && r.category !== typeFilter) return false;
      if (modelFilter !== 'ALL' && r.modelGroup !== modelFilter) return false;
      if (q) {
        const hay = `${r.storeName} ${r.storeRaw} ${r.deviceRaw} ${r.planName} ${r.channelType}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    wireless,
    reportDate,
    rangeMode,
    periodStart,
    periodEnd,
    channelFilter,
    storeFilter,
    typeFilter,
    modelFilter,
    search,
  ]);

  const filteredWired = useMemo(() => {
    const q = search.trim().toLowerCase();
    return wired.filter((r) => {
      if (
        !isIncludedInDateRange(r.serviceDate, r.timeSeconds, {
          date: reportDate,
          slot: 20,
          rangeMode,
          periodStart,
          periodEnd,
        })
      ) {
        return false;
      }
      if (channelFilter === 'retail' && r.isWholesale) return false;
      if (channelFilter === 'wholesale' && !r.isWholesale) return false;
      if (storeFilter !== 'ALL' && r.storeName !== storeFilter) return false;
      if (q) {
        const hay = `${r.storeName} ${r.storeRaw} ${r.productType} ${r.status}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [wired, reportDate, rangeMode, periodStart, periodEnd, channelFilter, storeFilter, search]);

  const kpi = useMemo(() => {
    let hs = 0;
    let zero = 0;
    let mnp = 0;
    let change = 0;
    let usedNew = 0;
    let usedMnp = 0;
    for (const r of filteredWireless) {
      if (r.isExcludedFromHS) continue;
      if (r.category === '010') zero++;
      if (r.category === 'MNP') mnp++;
      if (r.category === '기변') change++;
      if (r.category === '중고신규') usedNew++;
      if (r.category === '중고MNP') usedMnp++;
    }
    hs = zero + mnp + change;
    const internet = filteredWired.filter((x) => x.productType === '초고속').length;
    const iptv = filteredWired.filter((x) => x.productType === 'IPTV').length;
    return { hs, zero, mnp, change, usedNew, usedMnp, internet, iptv };
  }, [filteredWireless, filteredWired]);

  const storeOptions = useMemo(() => {
    const extra = new Set<string>();
    wireless.forEach((r) => {
      if (!r.isWholesale && !storeConfig.names.includes(r.storeName)) extra.add(r.storeName);
    });
    return [...storeConfig.names, ...Array.from(extra).sort((a, b) => a.localeCompare(b, 'ko')), '도매'];
  }, [wireless, storeConfig.names]);

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(
      filteredWireless.map((r) => ({
        개통일: r.openDate,
        개통시간: r.openTime,
        채널구분: r.channelType,
        매장명: r.storeName,
        판매유형: r.category || r.detailType,
        바로픽업: r.isPickup ? 'Y' : 'N',
        단말기: r.deviceRaw,
        모델군: r.modelGroup || '-',
        요금제: r.planName,
        HS제외여부: r.isExcludedFromHS ? '제외' : '포함',
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '판매현황');
    XLSX.writeFile(wb, `판매현황_${reportDate}.xlsx`);
  }

  return (
    <div>
      <div className="card">
        <div className="toolbar">
          <label style={{ fontSize: 13, fontWeight: 800 }}>
            기준일{' '}
            <input
              type="date"
              className="input"
              value={reportDate}
              onChange={(e) => onChangeDate(e.target.value)}
            />
          </label>

          <div className="subtabs" style={{ marginBottom: 0 }}>
            {(
              [
                ['day', '일별'],
                ['period', '기간 조회'],
                ['month', '당월 누적'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={`subtab ${rangeMode === mode ? 'active' : ''}`}
                onClick={() => setRangeMode(mode)}
              >
                {label}
              </button>
            ))}
          </div>

          {rangeMode === 'period' && (
            <>
              <input
                type="date"
                className="input"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
              <span>~</span>
              <input
                type="date"
                className="input"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </>
          )}

          <select
            className="select"
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value as ChannelFilter)}
          >
            <option value="all">채널: 도/소매 전체</option>
            <option value="retail">소매 전체만</option>
            <option value="wholesale">도매만</option>
          </select>

          <select
            className="select"
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
          >
            <option value="ALL">매장: 전체</option>
            {storeOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="ALL">유형: 전체</option>
            <option value="010">010 신규</option>
            <option value="MNP">MNP</option>
            <option value="기변">기변</option>
            <option value="중고신규">중고신규</option>
            <option value="중고MNP">중고MNP</option>
          </select>

          <select
            className="select"
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
          >
            <option value="ALL">모델군: 전체</option>
            {modelGroups.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            className="input"
            placeholder="매장명·단말·요금제 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: 180 }}
          />

          <button type="button" className="btn btn-green" onClick={exportExcel}>
            엑셀 다운로드
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card accent">
          <div className="kpi-label">무선 H/S 합계</div>
          <div className="kpi-value">{kpi.hs.toLocaleString()}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">010 신규</div>
          <div className="kpi-value">{kpi.zero.toLocaleString()}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">MNP</div>
          <div className="kpi-value">{kpi.mnp.toLocaleString()}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">기변</div>
          <div className="kpi-value">{kpi.change.toLocaleString()}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">중고신규</div>
          <div className="kpi-value">{kpi.usedNew.toLocaleString()}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">중고MNP</div>
          <div className="kpi-value">{kpi.usedMnp.toLocaleString()}</div>
        </div>
        <div className="kpi-card wired">
          <div className="kpi-label">유선 (초고속 / IPTV)</div>
          <div className="kpi-value">
            {kpi.internet} / {kpi.iptv}
          </div>
        </div>
      </div>

      <div className="card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <strong style={{ fontSize: 15 }}>
            무선 개통 상세 내역 ({filteredWireless.length.toLocaleString()}건)
          </strong>
          <span style={{ fontSize: 12, color: 'var(--sub)' }}>
            유선 청약/개통 {filteredWired.length.toLocaleString()}건 함께 조회됨
          </span>
        </div>

        <div className="table-scroll" style={{ maxHeight: 540 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>개통일</th>
                <th>시간</th>
                <th>판매채널</th>
                <th>매장명</th>
                <th>유형</th>
                <th>픽업</th>
                <th>단말기</th>
                <th>모델군</th>
                <th>요금제</th>
              </tr>
            </thead>
            <tbody>
              {filteredWireless.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 36, color: '#94a3b8' }}>
                    조회된 개통 내역이 없습니다. (사용자관리 &gt; 티키연동에서 엑셀을 업로드하거나
                    날짜를 변경하세요.)
                  </td>
                </tr>
              ) : (
                filteredWireless.slice(0, 500).map((r) => (
                  <tr key={r.id}>
                    <td>{r.openDate}</td>
                    <td>{r.openTime}</td>
                    <td>{r.channelType}</td>
                    <td style={{ fontWeight: 800 }}>{r.storeName}</td>
                    <td>
                      {r.category || r.detailType}
                      {r.isExcludedFromHS && (
                        <span style={{ color: '#b45309', fontSize: 11, marginLeft: 4 }}>
                          (HS제외)
                        </span>
                      )}
                    </td>
                    <td>{r.isPickup ? '바로픽업' : '-'}</td>
                    <td>{r.deviceRaw}</td>
                    <td>{r.modelGroup || '-'}</td>
                    <td>{r.planName}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

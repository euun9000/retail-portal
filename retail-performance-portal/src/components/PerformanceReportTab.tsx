'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import type {
  ChannelMetricRow,
  DealerSnapshot,
  ModelGroup,
  RangeMode,
  ReportSubTab,
  StoreConfig,
  WiredRecord,
  WirelessRecord,
} from '@/lib/types';
import {
  aggregateChannelReport,
  DEFAULT_MODEL_GROUPS,
  DEFAULT_STORE_CONFIG,
  emptyMetricRow,
} from '@/lib/excelParser';
import { computeDealerRanking, parseBulkMemoSnapshots } from '@/lib/dealerParser';

interface Props {
  wireless: WirelessRecord[];
  wired: WiredRecord[];
  storeConfig: StoreConfig;
  modelGroups: ModelGroup[];
  reportDate: string;
  onChangeDate: (d: string) => void;
  onUpdateStoreConfig: (cfg: StoreConfig) => void;
  onUpdateModelGroups: (groups: ModelGroup[]) => void;
}

const DEFAULT_WIRELESS_SAMPLE = `[Web발신]
[17시_수도권 주요점(도소매) 0/M/기]
■수도권_315/583/934
ACT_10/19/54
서울ENT_7/18/41
참스타_9/40/47
MD_13/34/29
CD_10/16/30
대교_6/41/39
지은_4/54/26
프리스비_9/29/26
신창_8/34/44
광장_9/26/32
가능_3/15/24
UNI_10/13/45
삼보_2/18/11
코넥_6/10/12
한유_8/17/24
새서울_6/18/12
정원_11/18/22
유원_8/15/14
강남스타_10/8/13
알파_5/15/17
근흥_3/6/8`;

const DEFAULT_WIRED_SAMPLE = `[Web발신]
[17시_주요점(도소매) 초/I 청약]
■수도권 초_105/ TV_118
ACT 초_4 /  TV_5
서울ENT 초_2 /  TV_2
참스타 초_4 /  TV_5
MD 초_6 /  TV_8
CD 초_0 /  TV_0
대교 초_7 /  TV_9
지은 초_3 /  TV_3
프리스비 초_5 /  TV_3
신창 초_7 /  TV_9
광장 초_3 /  TV_3
가능 초_1 /  TV_2
UNI 초_2 /  TV_1
삼보 초_2 /  TV_2
코넥 초_0 /  TV_0
새서울 초_2 /  TV_2
정원 초_6 /  TV_7
유원 초_2 /  TV_2
강남스타 초_4 /  TV_5
알파 초_1 /  TV_1
근흥 초_0 /  TV_0`;

export default function PerformanceReportTab({
  wireless,
  wired,
  storeConfig,
  modelGroups,
  reportDate,
  onChangeDate,
  onUpdateStoreConfig,
  onUpdateModelGroups,
}: Props) {
  const [subTab, setSubTab] = useState<ReportSubTab>('channel');

  // ===== 채널별 실적 상태 =====
  const [slot, setSlot] = useState<number>(20);
  const [rangeMode, setRangeMode] = useState<RangeMode>('day');
  const [periodStart, setPeriodStart] = useState(reportDate);
  const [periodEnd, setPeriodEnd] = useState(reportDate);
  const [manualEdits, setManualEdits] = useState<
    Record<string, Partial<Record<'바로픽업' | '초고속' | 'IPTV', number>>>
  >({});
  const [statusMsg, setStatusMsg] = useState('도매 + 소매 17개 지정 매장 통합 실적표입니다.');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const channelCaptureRef = useRef<HTMLDivElement>(null);

  // 모델군/매장명 관리 모달
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [draftModels, setDraftModels] = useState<ModelGroup[]>(modelGroups);
  const [testModelInput, setTestModelInput] = useState('');

  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [draftStores, setDraftStores] = useState<
    Array<{ original: string; name: string; direct: boolean }>
  >([]);

  // ===== 주요대리점 실적 상태 =====
  const [dealerWirelessText, setDealerWirelessText] = useState(DEFAULT_WIRELESS_SAMPLE);
  const [dealerWiredText, setDealerWiredText] = useState(DEFAULT_WIRED_SAMPLE);
  const [memoBulkInput, setMemoBulkInput] = useState('');
  const [dealerSnapshots, setDealerSnapshots] = useState<DealerSnapshot[]>([]);
  const dealerCaptureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('retail_portal_dealer_snapshots_v1');
      if (raw) setDealerSnapshots(JSON.parse(raw));
      const memo = localStorage.getItem('retail_portal_dealer_memo_v1');
      if (memo) setMemoBulkInput(memo);
    } catch {}
  }, []);

  // 채널별 집계 + 수동 인라인 수정 반영
  const channelState = useMemo(() => {
    const base = aggregateChannelReport(wireless, wired, storeConfig, modelGroups, {
      date: reportDate,
      slot,
      rangeMode,
      periodStart,
      periodEnd,
    });

    const stores: Record<string, ChannelMetricRow> = {};
    const allNames = [...storeConfig.names, ...base.extraRetailNames];
    for (const name of allNames) {
      const orig = base.stores[name] || emptyMetricRow(modelGroups);
      const edit = manualEdits[name];
      stores[name] = {
        ...orig,
        바로픽업: edit?.바로픽업 ?? orig.바로픽업,
        초고속: edit?.초고속 ?? orig.초고속,
        IPTV: edit?.IPTV ?? orig.IPTV,
      };
    }

    const retail = emptyMetricRow(modelGroups);
    const metricKeys = Object.keys(retail);
    for (const name of allNames) {
      for (const k of metricKeys) {
        retail[k] = (retail[k] || 0) + (stores[name]?.[k] || 0);
      }
    }

    const grand = emptyMetricRow(modelGroups);
    for (const k of metricKeys) {
      grand[k] = (retail[k] || 0) + (base.wholesale[k] || 0);
    }

    const sortedRetailNames = [...allNames].sort((a, b) => {
      const ha = stores[a]?.HS || 0;
      const hb = stores[b]?.HS || 0;
      if (hb !== ha) return hb - ha;
      return allNames.indexOf(a) - allNames.indexOf(b);
    });

    return {
      ...base,
      stores,
      retail,
      grand,
      sortedRetailNames,
    };
  }, [
    wireless,
    wired,
    storeConfig,
    modelGroups,
    reportDate,
    slot,
    rangeMode,
    periodStart,
    periodEnd,
    manualEdits,
  ]);

  const channelTitle = useMemo(() => {
    if (!reportDate) return '채널별 실적 현황';
    const [, m, d] = reportDate.split('-');
    if (rangeMode === 'month') return `${+m}월 누적 채널별 실적 현황 (도/소매 통합)`;
    if (rangeMode === 'period') {
      const [, sm, sd] = periodStart.split('-');
      const [, em, ed] = periodEnd.split('-');
      return `${+sm}월 ${+sd}일 ~ ${+em}월 ${+ed}일 채널별 실적 현황`;
    }
    const slotStr = Number.isInteger(slot)
      ? `${slot}시`
      : `${Math.floor(slot)}시 ${String(Math.round((slot - Math.floor(slot)) * 60)).padStart(2, '0')}분`;
    return `${+m}월 ${+d}일 ${slotStr} 채널별 실적 현황`;
  }, [reportDate, rangeMode, periodStart, periodEnd, slot]);

  const channelNoticeText = useMemo(() => {
    const sec = (label: string, row: ChannelMetricRow, includePickup: boolean) => {
      const models = modelGroups.map((g) => `- ${g.name} : ${row[g.name] || 0}대`).join('\n');
      return `[ ${label} ]
- 010 : ${row['010']}대
- 중고신규 : ${row['중고신규']}대
- 중고MNP : ${row['중고MNP']}대
- MNP : ${row['MNP']}대
- 기변 : ${row['기변']}대${includePickup ? `\n- 바로픽업 : ${row['바로픽업']}대` : ''}
- 총합 : ${row['HS']}대

* 단말기 판매 기종 *
${models}

* 지표 *
- 초고속 : ${row['초고속']}건
- IPTV : ${row['IPTV']}건`;
    };
    return `${channelTitle}\n\n${sec('소매', channelState.retail, true)}\n\n${sec(
      '도매',
      channelState.wholesale,
      false
    )}`;
  }, [channelTitle, channelState, modelGroups]);

  function applyCurrentSlot() {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;
    const h = now.getHours();
    const nextSlot = Math.max(9, Math.min(20, h));
    onChangeDate(today);
    setRangeMode('day');
    setSlot(nextSlot);
    setStatusMsg(`현시간 기준(${today} ${nextSlot}시)으로 반영했습니다.`);
  }

  async function buildCleanCanvas(el: HTMLElement) {
    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '-100000px';
    host.style.top = '0';
    host.style.background = '#ffffff';
    host.style.zIndex = '-1';
    const clone = el.cloneNode(true) as HTMLElement;
    const w = el === dealerCaptureRef.current ? 820 : 1180;
    clone.style.width = `${w}px`;
    clone.style.minWidth = `${w}px`;
    clone.style.maxWidth = `${w}px`;
    clone.style.margin = '0';
    clone.style.overflow = 'visible';
    clone.querySelectorAll('input.inline-num-input').forEach((inp) => {
      const span = document.createElement('span');
      const v = parseInt(String((inp as HTMLInputElement).value).replace(/\D/g, ''), 10) || 0;
      span.textContent = v === 0 ? '-' : String(v);
      inp.replaceWith(span);
    });
    host.appendChild(clone);
    document.body.appendChild(host);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const h = Math.ceil(clone.getBoundingClientRect().height);
      return await html2canvas(clone, {
        scale: 2,
        backgroundColor: '#ffffff',
        width: w,
        height: h,
        windowWidth: w + 40,
        windowHeight: h + 40,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        useCORS: true,
        logging: false,
      });
    } finally {
      host.remove();
    }
  }

  async function captureElement(el: HTMLElement | null, title: string, mode: 'preview' | 'save' | 'copy') {
    if (!el) return;
    try {
      setStatusMsg('이미지를 생성하는 중입니다...');
      if (mode === 'copy') {
        if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
          throw new Error('이 브라우저에서는 클립보드 이미지 복사를 지원하지 않습니다.');
        }
        try {
          const blobPromise = buildCleanCanvas(el).then(
            (canvas) =>
              new Promise<Blob>((res, rej) =>
                canvas.toBlob((b) => (b ? res(b) : rej(new Error('이미지 변환 실패'))), 'image/png')
              )
          );
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
        } catch {
          const canvas = await buildCleanCanvas(el);
          const blob = await new Promise<Blob>((res, rej) =>
            canvas.toBlob((b) => (b ? res(b) : rej(new Error('이미지 변환 실패'))), 'image/png')
          );
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        }
        setStatusMsg('이미지를 복사했습니다. 카카오톡 등에 붙여넣기 하세요.');
        return;
      }
      const canvas = await buildCleanCanvas(el);
      if (mode === 'preview') {
        setPreviewUrl(canvas.toDataURL('image/png'));
        setPreviewTitle(title);
        setStatusMsg('이미지 미리보기를 열었습니다.');
      } else {
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `${reportDate}_${title.replace(/\s+/g, '_')}.png`;
        a.click();
        setStatusMsg('이미지를 저장했습니다.');
      }
    } catch (err) {
      const reason = err instanceof Error ? `${err.name}: ${err.message}` : '알 수 없는 오류';
      setStatusMsg(`이미지 복사/생성 실패: ${reason}`);
    }
  }

  async function copyText(val: string, msg: string) {
    try {
      await navigator.clipboard.writeText(val);
      setStatusMsg(msg);
    } catch {
      setStatusMsg('클립보드 복사에 실패했습니다.');
    }
  }

  // ===== 주요대리점 계산 =====
  const dealerResult = useMemo(
    () => computeDealerRanking(dealerWirelessText, dealerWiredText),
    [dealerWirelessText, dealerWiredText]
  );

  const koreanDealerDate = useMemo(() => {
    const [y, m, d] = reportDate.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    const wd = ['일', '월', '화', '수', '목', '금', '토'][dt.getDay()];
    return `${m}월 ${d}일(${wd})`;
  }, [reportDate]);

  const dateDealerSnapshots = useMemo(() => {
    const fixed = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const dayItems = dealerSnapshots.filter((s) => s.date === reportDate);
    const map = new Map(dayItems.map((s) => [s.hour, s]));
    return fixed.map((h) => map.get(h)).filter((x): x is DealerSnapshot => Boolean(x));
  }, [dealerSnapshots, reportDate]);

  function saveDealerSnapshot() {
    let next = [...dealerSnapshots];
    if (memoBulkInput.trim()) {
      const bulk = parseBulkMemoSnapshots(memoBulkInput, reportDate);
      if (bulk.length) {
        next = next.filter((s) => s.date !== reportDate);
        next.push(...bulk);
      }
    }
    if (dealerResult.target && dealerResult.hour && [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].includes(dealerResult.hour)) {
      next = next.filter(
        (s) => !(s.date === reportDate && s.hour === dealerResult.hour)
      );
      next.push({
        date: reportDate,
        hour: dealerResult.hour,
        total: dealerResult.target.total,
        rank: dealerResult.target.rank,
      });
    }
    next.sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour);
    setDealerSnapshots(next);
    localStorage.setItem('retail_portal_dealer_snapshots_v1', JSON.stringify(next));
    localStorage.setItem('retail_portal_dealer_memo_v1', memoBulkInput);
    setStatusMsg(`${koreanDealerDate} 주요대리점 시간별 누적 실적을 저장했습니다.`);
  }

  const dealerSummaryText = useMemo(() => {
    const lines = dateDealerSnapshots.length
      ? dateDealerSnapshots.map((s) => `- ${s.hour}시 : ${s.total}대, ${s.rank}위`)
      : dealerResult.target
      ? [
          `- ${dealerResult.hour ?? '현재'}시 : ${dealerResult.target.total}대, ${
            dealerResult.target.rank
          }위`,
        ]
      : ['- 누적 실적 없음'];
    return `[ ${koreanDealerDate} 주요대리점 실적현황 ]\n\n${lines.join('\n')}`;
  }, [koreanDealerDate, dateDealerSnapshots, dealerResult]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <div className="subtabs" style={{ marginBottom: 0 }}>
          <button
            type="button"
            className={`subtab ${subTab === 'channel' ? 'active' : ''}`}
            onClick={() => setSubTab('channel')}
          >
            채널별 실적 (도/소매 통합)
          </button>
          <button
            type="button"
            className={`subtab ${subTab === 'dealer' ? 'active' : ''}`}
            onClick={() => setSubTab('dealer')}
          >
            주요대리점 실적
          </button>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)' }}>{statusMsg}</span>
      </div>

      {subTab === 'channel' ? (
        <>
          <div className="card">
            <div className="toolbar">
              <label style={{ fontSize: 13, fontWeight: 800 }}>
                실적 날짜{' '}
                <input
                  type="date"
                  className="input"
                  value={reportDate}
                  onChange={(e) => onChangeDate(e.target.value)}
                />
              </label>

              <label style={{ fontSize: 13, fontWeight: 800 }}>
                기준 시간{' '}
                <select
                  className="select"
                  value={slot}
                  onChange={(e) => setSlot(Number(e.target.value))}
                >
                  <option value={9}>09시</option>
                  <option value={10}>10시</option>
                  <option value={11}>11시</option>
                  <option value={12}>12시</option>
                  <option value={13}>13시 (기본)</option>
                  <option value={14}>14시</option>
                  <option value={15}>15시 (기본)</option>
                  <option value={16}>16시</option>
                  <option value={17}>17시 (기본)</option>
                  <option value={18}>18시</option>
                  <option value={19}>19시</option>
                  <option value={20}>20시(오후 8시) · 당일 전체</option>
                </select>
              </label>

              <button type="button" className="btn btn-yellow" onClick={applyCurrentSlot}>
                현시간 적용
              </button>

              <select
                className="select"
                value={rangeMode}
                onChange={(e) => setRangeMode(e.target.value as RangeMode)}
              >
                <option value="day">선택일 실적</option>
                <option value="period">기간 조회</option>
                <option value="month">월 누적 전체</option>
              </select>

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

              <button
                type="button"
                className="btn"
                onClick={() => captureElement(channelCaptureRef.current, '채널별실적', 'preview')}
              >
                이미지 미리보기
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => captureElement(channelCaptureRef.current, '채널별실적', 'save')}
              >
                이미지 저장
              </button>
              <button
                type="button"
                className="btn btn-blue"
                onClick={() => captureElement(channelCaptureRef.current, '채널별실적', 'copy')}
              >
                이미지 복사
              </button>
              <button
                type="button"
                className="btn btn-green"
                onClick={() => copyText(channelNoticeText, '채널별 공지 텍스트를 복사했습니다.')}
              >
                텍스트 복사
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setDraftModels(modelGroups);
                  setModelModalOpen(true);
                }}
              >
                ⚙ 모델군 관리
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setDraftStores(
                    storeConfig.names.map((n) => ({
                      original: n,
                      name: n,
                      direct: storeConfig.direct.includes(n),
                    }))
                  );
                  setStoreModalOpen(true);
                }}
              >
                ⚙ 매장명 관리
              </button>
            </div>
          </div>

          <div className="table-scroll" style={{ marginBottom: 14 }}>
            <div ref={channelCaptureRef} className="report-sheet">
              <div className="report-title">{channelTitle}</div>
              <table className="channel-table">
                <thead>
                  <tr>
                    <th style={{ width: "10%" }}>판매처</th>
                    <th style={{ width: "4.2%" }}>010</th>
                    <th style={{ width: "4.5%" }}>중고신규</th>
                    <th style={{ width: "4.5%" }}>중고MNP</th>
                    <th style={{ width: "4.2%" }}>MNP</th>
                    <th style={{ width: "4.2%" }}>기변</th>
                    <th className="col-pickup" style={{ width: "4.5%" }}>
                      바로
                      <br />
                      픽업
                    </th>
                    <th style={{ width: "10.8%" }}>
                      H/S 합계
                      <br />
                      (SD/태블릿제외)
                    </th>
                    {modelGroups.map((g) => (
                      <th
                        key={g.name}
                        style={{
                          width: `${(46 / Math.max(1, modelGroups.length)).toFixed(2)}%`,
                          background: g.colorEnabled ? g.color : '#fffdf2',
                        }}
                      >
                        {g.name}
                      </th>
                    ))}
                    <th className="col-ind" style={{ width: "4.5%" }}>
                      초고속
                    </th>
                    <th style={{ width: "4.5%" }}>IPTV</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 도매 합산 행 */}
                  <tr>
                    <td style={{ fontWeight: 900 }}>도매</td>
                    <td>{channelState.wholesale['010'] || '-'}</td>
                    <td className="col-used">{channelState.wholesale['중고신규'] || '-'}</td>
                    <td className="col-used">{channelState.wholesale['중고MNP'] || '-'}</td>
                    <td>{channelState.wholesale['MNP'] || '-'}</td>
                    <td>{channelState.wholesale['기변'] || '-'}</td>
                    <td className="col-pickup">{channelState.wholesale['바로픽업'] || '-'}</td>
                    <td className="col-hs">{channelState.wholesale['HS'] || '-'}</td>
                    {modelGroups.map((g) => {
                      const v = channelState.wholesale[g.name] || 0;
                      return (
                        <td
                          key={g.name}
                          style={
                            v > 0 && g.colorEnabled
                              ? { background: g.color }
                              : v > 0
                              ? { background: '#fffed5' }
                              : undefined
                          }
                        >
                          {v || '-'}
                        </td>
                      );
                    })}
                    <td className="col-ind">{channelState.wholesale['초고속'] || '-'}</td>
                    <td>{channelState.wholesale['IPTV'] || '-'}</td>
                  </tr>

                  {/* 소매 2차 헤더 (도매/소매 구분) */}
                  <tr>
                    <th>판매처</th>
                    <th>010</th>
                    <th>중고신규</th>
                    <th>중고MNP</th>
                    <th>MNP</th>
                    <th>기변</th>
                    <th className="col-pickup">바로<br />픽업</th>
                    <th>H/S 합계<br />(SD/태블릿제외)</th>
                    {modelGroups.map((g) => (
                      <th
                        key={`rh-${g.name}`}
                        style={{ background: g.colorEnabled ? g.color : '#fffdf2' }}
                      >
                        {g.name}
                      </th>
                    ))}
                    <th className="col-ind">초고속</th>
                    <th>IPTV</th>
                  </tr>

                  {/* 소매 전체 매장 행 (17개 지정 매장 + 추가 소매 매장) */}
                  {channelState.sortedRetailNames.map((name) => {
                    const row = channelState.stores[name] || emptyMetricRow(modelGroups);
                    const isDirect = storeConfig.direct.includes(name);
                    const isExtra = channelState.extraRetailNames.includes(name);
                    return (
                      <tr key={name}>
                        <td className={isDirect ? 'store-direct' : ''}>
                          {name}
                          {isExtra ? ' (추가)' : ''}
                        </td>
                        <td>{row['010'] || '-'}</td>
                        <td className="col-used">{row['중고신규'] || '-'}</td>
                        <td className="col-used">{row['중고MNP'] || '-'}</td>
                        <td>{row['MNP'] || '-'}</td>
                        <td>{row['기변'] || '-'}</td>
                        <td className="col-pickup">
                          <input
                            type="text"
                            inputMode="numeric"
                            className="inline-num-input"
                            value={row['바로픽업'] === 0 ? '-' : row['바로픽업']}
                            onChange={(e) =>
                              setManualEdits((prev) => ({
                                ...prev,
                                [name]: { ...prev[name], 바로픽업: Number(e.target.value) || 0 },
                              }))
                            }
                          />
                        </td>
                        <td className="col-hs">{row['HS'] || '-'}</td>
                        {modelGroups.map((g) => {
                          const v = row[g.name] || 0;
                          return (
                            <td
                              key={g.name}
                              style={
                                v > 0 && g.colorEnabled
                                  ? { background: g.color }
                                  : v > 0
                                  ? { background: '#fffed5' }
                                  : undefined
                              }
                            >
                              {v || '-'}
                            </td>
                          );
                        })}
                        <td className="col-ind">
                          <input
                            type="text"
                            inputMode="numeric"
                            className="inline-num-input"
                            value={row['초고속'] === 0 ? '-' : row['초고속']}
                            onChange={(e) =>
                              setManualEdits((prev) => ({
                                ...prev,
                                [name]: { ...prev[name], 초고속: Number(e.target.value) || 0 },
                              }))
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            inputMode="numeric"
                            className="inline-num-input"
                            value={row['IPTV'] === 0 ? '-' : row['IPTV']}
                            onChange={(e) =>
                              setManualEdits((prev) => ({
                                ...prev,
                                [name]: { ...prev[name], IPTV: Number(e.target.value) || 0 },
                              }))
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}

                  {/* 소매 총합계 */}
                  <tr className="sum-row">
                    <td>소매 총합계</td>
                    <td>{channelState.retail['010'] || '-'}</td>
                    <td className="col-used">{channelState.retail['중고신규'] || '-'}</td>
                    <td className="col-used">{channelState.retail['중고MNP'] || '-'}</td>
                    <td>{channelState.retail['MNP'] || '-'}</td>
                    <td>{channelState.retail['기변'] || '-'}</td>
                    <td className="col-pickup">{channelState.retail['바로픽업'] || '-'}</td>
                    <td className="col-hs">{channelState.retail['HS'] || '-'}</td>
                    {modelGroups.map((g) => (
                      <td key={g.name}>{channelState.retail[g.name] || '-'}</td>
                    ))}
                    <td className="col-ind">{channelState.retail['초고속'] || '-'}</td>
                    <td>{channelState.retail['IPTV'] || '-'}</td>
                  </tr>

                  {/* 도/소매 통합 총합계 */}
                  <tr className="grand-row">
                    <td>총합계</td>
                    <td>{channelState.grand['010'] || '-'}</td>
                    <td className="col-used">{channelState.grand['중고신규'] || '-'}</td>
                    <td className="col-used">{channelState.grand['중고MNP'] || '-'}</td>
                    <td>{channelState.grand['MNP'] || '-'}</td>
                    <td>{channelState.grand['기변'] || '-'}</td>
                    <td className="col-pickup">{channelState.grand['바로픽업'] || '-'}</td>
                    <td className="col-hs">{channelState.grand['HS'] || '-'}</td>
                    {modelGroups.map((g) => (
                      <td key={g.name}>{channelState.grand[g.name] || '-'}</td>
                    ))}
                    <td className="col-ind">{channelState.grand['초고속'] || '-'}</td>
                    <td>{channelState.grand['IPTV'] || '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong>카톡 공지용 텍스트 (도/소매 통합)</strong>
              <button
                type="button"
                className="btn btn-green"
                onClick={() => copyText(channelNoticeText, '공지 텍스트를 복사했습니다.')}
              >
                텍스트 복사
              </button>
            </div>
            <textarea
              readOnly
              value={channelNoticeText}
              style={{ width: '100%', height: 280, padding: 12, borderRadius: 8, border: '1px solid #cbd5e1', fontFamily: 'inherit', fontSize: 13 }}
            />
          </div>
        </>
      ) : (
        <>
          <div className="card">
            <div className="toolbar" style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 800 }}>
                기준 날짜{' '}
                <input
                  type="date"
                  className="input"
                  value={reportDate}
                  onChange={(e) => onChangeDate(e.target.value)}
                />
              </label>
              <button type="button" className="btn btn-primary" onClick={saveDealerSnapshot}>
                시간별 누적 저장
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => captureElement(dealerCaptureRef.current, '주요대리점실적', 'preview')}
              >
                미리보기
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => captureElement(dealerCaptureRef.current, '주요대리점실적', 'save')}
              >
                이미지 저장
              </button>
              <button
                type="button"
                className="btn btn-blue"
                onClick={() => captureElement(dealerCaptureRef.current, '주요대리점실적', 'copy')}
              >
                이미지 복사
              </button>
              <button
                type="button"
                className="btn btn-green"
                onClick={() => copyText(dealerSummaryText, '주요대리점 요약 텍스트를 복사했습니다.')}
              >
                텍스트 복사
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>① 무선 통계 붙여넣기</div>
                <textarea
                  value={dealerWirelessText}
                  onChange={(e) => setDealerWirelessText(e.target.value)}
                  style={{ width: '100%', height: 180, padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>② 유선 통계 붙여넣기</div>
                <textarea
                  value={dealerWiredText}
                  onChange={(e) => setDealerWiredText(e.target.value)}
                  style={{ width: '100%', height: 180, padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </div>
            </div>

            <div>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
                이전 시간 실적 한 번에 붙여넣기 (예: - 13시 : 30대, 4위)
              </div>
              <textarea
                value={memoBulkInput}
                onChange={(e) => setMemoBulkInput(e.target.value)}
                placeholder="- 13시 : 30대, 4위&#10;- 15시 : 56대, 3위"
                style={{ width: '100%', height: 84, padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
              />
            </div>
          </div>

          <div className="table-scroll" style={{ marginBottom: 14 }}>
            <div ref={dealerCaptureRef} className="dealer-sheet">
              <table className="dealer-table">
                <thead>
                  <tr>
                    <th colSpan={7} style={{ background: '#fff', color: '#d71920', fontSize: 22, fontWeight: 900, padding: '8px 6px' }}>
                      {koreanDealerDate} 주요대리점 실적현황
                    </th>
                    <th colSpan={2} style={{ background: '#fff', color: '#d71920', fontSize: 22, fontWeight: 900, padding: '8px 6px' }}>
                      청약기준
                    </th>
                  </tr>
                  <tr>
                    <th style={{ background: '#ffe600', height: 42 }}>순위</th>
                    <th style={{ background: '#ffe600', height: 42 }}>대리점</th>
                    <th style={{ background: '#ffe600', height: 42 }}>010</th>
                    <th style={{ background: '#ffe600', height: 42 }}>MNP</th>
                    <th style={{ background: '#ffe600', height: 42 }}>기변</th>
                    <th style={{ background: '#ffe600', height: 42 }}>합계</th>
                    <th style={{ background: '#ffe600', height: 42 }}>1위 GAP</th>
                    <th style={{ background: '#ffe600', height: 42 }}>초고속</th>
                    <th style={{ background: '#ffe600', height: 42 }}>IPTV</th>
                  </tr>
                </thead>
                <tbody>
                  {dealerResult.ranked.map((r) => {
                    const isTarget = r.name === '대교';
                    const gap = r.rank === 1 ? '-' : `- ${dealerResult.leaderTotal - r.total}`;
                    return (
                      <tr
                        key={r.name}
                        style={isTarget ? { background: '#ffc21a', fontWeight: 900 } : undefined}
                      >
                        <td>{r.rank}</td>
                        <td>{r.name}</td>
                        <td>{r.zero}</td>
                        <td>{r.mnp}</td>
                        <td>{r.change}</td>
                        <td>{r.total}</td>
                        <td>{gap}</td>
                        <td>{r.internet ?? '-'}</td>
                        <td>{r.tv ?? '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div style={{ textAlign: 'center', fontWeight: 900, fontSize: 18, color: '#d71920', padding: '10px 6px 6px' }}>
                {koreanDealerDate} 시간별 누적 실적현황
              </div>
              <table className="channel-table">
                <thead>
                  <tr>
                    <th style={{ background: '#ffe600', height: 38 }}>시간</th>
                    <th style={{ background: '#ffe600', height: 38 }}>무선 실적</th>
                    <th style={{ background: '#ffe600', height: 38 }}>직전 대비 증가</th>
                    <th style={{ background: '#ffe600', height: 38 }}>순위</th>
                  </tr>
                </thead>
                <tbody>
                  {dateDealerSnapshots.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ color: '#94a3b8' }}>
                        [시간별 누적 저장] 버튼을 누르면 09~20시 기록이 날짜별로 누적됩니다.
                      </td>
                    </tr>
                  ) : (
                    dateDealerSnapshots.map((s, idx) => {
                      const prev = idx > 0 ? dateDealerSnapshots[idx - 1].total : 0;
                      const inc = s.total - prev;
                      return (
                        <tr key={s.hour}>
                          <td>{s.hour}시</td>
                          <td>{s.total}대</td>
                          <td>+{inc}</td>
                          <td>{s.rank}위</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ background: '#ffe600', borderColor: '#111' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ fontSize: 16 }}>카톡용 요약 문구</strong>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => copyText(dealerSummaryText, '요약 문구를 복사했습니다.')}
              >
                요약 문구 복사
              </button>
            </div>
            <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: 15, fontWeight: 800, whiteSpace: 'pre-wrap' }}>
              {dealerSummaryText}
            </pre>
          </div>
        </>
      )}

      {/* 이미지 미리보기 모달 */}
      {previewUrl && (
        <div className="modal-backdrop" onClick={() => setPreviewUrl(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span>{previewTitle} 미리보기</span>
              <button type="button" className="btn" onClick={() => setPreviewUrl(null)}>
                닫기
              </button>
            </div>
            <div style={{ padding: 16, textAlign: 'center', background: '#334155' }}>
              <img src={previewUrl} alt="미리보기" style={{ maxWidth: '100%', background: '#fff' }} />
            </div>
          </div>
        </div>
      )}

      {/* 모델군 관리 모달 */}
      {modelModalOpen && (
        <div className="modal-backdrop" onClick={() => setModelModalOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span>모델군 관리</span>
              <button type="button" className="btn" onClick={() => setModelModalOpen(false)}>
                닫기
              </button>
            </div>
            <div style={{ padding: 16 }}>
              {draftModels.map((g, idx) => (
                <div
                  key={idx}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 90px 60px 60px', gap: 8, marginBottom: 8, alignItems: 'center' }}
                >
                  <input
                    className="input"
                    value={g.name}
                    onChange={(e) => {
                      const next = [...draftModels];
                      next[idx] = { ...next[idx], name: e.target.value };
                      setDraftModels(next);
                    }}
                  />
                  <input
                    className="input"
                    value={g.patterns}
                    placeholder="키워드 (쉼표 구분)"
                    onChange={(e) => {
                      const next = [...draftModels];
                      next[idx] = { ...next[idx], patterns: e.target.value };
                      setDraftModels(next);
                    }}
                  />
                  <label style={{ fontSize: 12, fontWeight: 800 }}>
                    <input
                      type="checkbox"
                      checked={g.colorEnabled}
                      onChange={(e) => {
                        const next = [...draftModels];
                        next[idx] = { ...next[idx], colorEnabled: e.target.checked };
                        setDraftModels(next);
                      }}
                    />{' '}
                    강조색
                  </label>
                  <input
                    type="color"
                    value={g.color}
                    onChange={(e) => {
                      const next = [...draftModels];
                      next[idx] = { ...next[idx], color: e.target.value };
                      setDraftModels(next);
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => setDraftModels(draftModels.filter((_, i) => i !== idx))}
                  >
                    삭제
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    setDraftModels([
                      ...draftModels,
                      { name: '새 모델군', patterns: '', colorEnabled: false, color: '#fff2a8' },
                    ])
                  }
                >
                  + 모델군 추가
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setDraftModels(DEFAULT_MODEL_GROUPS)}
                >
                  기본값 복원
                </button>
                <input
                  className="input"
                  placeholder="분류 테스트 (예: SM-F976N)"
                  value={testModelInput}
                  onChange={(e) => setTestModelInput(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => {
                    onUpdateModelGroups(draftModels.filter((x) => x.name.trim()));
                    setModelModalOpen(false);
                  }}
                >
                  설정 적용
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 매장명 관리 모달 */}
      {storeModalOpen && (
        <div className="modal-backdrop" onClick={() => setStoreModalOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span>소매 매장명 관리 (하안점 제외)</span>
              <button type="button" className="btn" onClick={() => setStoreModalOpen(false)}>
                닫기
              </button>
            </div>
            <div style={{ padding: 16 }}>
              {draftStores.map((item, idx) => (
                <div
                  key={idx}
                  style={{ display: 'grid', gridTemplateColumns: '32px 1fr 90px 64px', gap: 8, marginBottom: 8, alignItems: 'center' }}
                >
                  <span style={{ fontWeight: 900, textAlign: 'center' }}>{idx + 1}</span>
                  <input
                    className="input"
                    value={item.name}
                    onChange={(e) => {
                      const next = [...draftStores];
                      next[idx] = { ...next[idx], name: e.target.value };
                      setDraftStores(next);
                    }}
                  />
                  <label style={{ fontSize: 12, fontWeight: 800 }}>
                    <input
                      type="checkbox"
                      checked={item.direct}
                      onChange={(e) => {
                        const next = [...draftStores];
                        next[idx] = { ...next[idx], direct: e.target.checked };
                        setDraftStores(next);
                      }}
                    />{' '}
                    직영점
                  </label>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => setDraftStores(draftStores.filter((_, i) => i !== idx))}
                  >
                    삭제
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    setDraftStores([...draftStores, { original: '', name: '', direct: false }])
                  }
                >
                  + 매장 추가
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    setDraftStores(
                      DEFAULT_STORE_CONFIG.names.map((n) => ({
                        original: n,
                        name: n,
                        direct: DEFAULT_STORE_CONFIG.direct.includes(n),
                      }))
                    )
                  }
                >
                  기본 매장 복원
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => {
                    const names = draftStores.map((x) => x.name.trim()).filter(Boolean);
                    if (names.includes('하안점')) {
                      alert('폐쇄된 하안점은 추가할 수 없습니다.');
                      return;
                    }
                    const nextAliases = { ...storeConfig.aliases };
                    draftStores.forEach((x) => {
                      if (x.original && x.name.trim() && x.original !== x.name.trim()) {
                        nextAliases[x.original.replace(/\s+/g, '')] = x.name.trim();
                      }
                    });
                    onUpdateStoreConfig({
                      names,
                      direct: draftStores.filter((x) => x.direct).map((x) => x.name.trim()),
                      aliases: nextAliases,
                    });
                    setStoreModalOpen(false);
                  }}
                >
                  설정 적용
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

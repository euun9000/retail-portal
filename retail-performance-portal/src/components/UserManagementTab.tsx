'use client';

import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import type {
  ModelGroup,
  StoreConfig,
  TeamPermission,
  TkeyScheduleConfig,
  TkeySyncLog,
  UserAccount,
  UserSubTab,
  WiredRecord,
  WirelessRecord,
} from '@/lib/types';
import { parseWiredExcel, parseWirelessExcel } from '@/lib/excelParser';

interface Props {
  storeConfig: StoreConfig;
  modelGroups: ModelGroup[];
  syncLogs: TkeySyncLog[];
  onAddLog: (log: TkeySyncLog) => void;
  onWirelessLoaded: (rows: WirelessRecord[]) => void;
  onWiredLoaded: (rows: WiredRecord[]) => void;
}

export default function UserManagementTab({
  storeConfig,
  modelGroups,
  syncLogs,
  onAddLog,
  onWirelessLoaded,
  onWiredLoaded,
}: Props) {
  const [subTab, setSubTab] = useState<UserSubTab>('tkey');

  // ===== 티키타카 연동 상태 =====
  const [tkeyId, setTkeyId] = useState('');
  const [tkeyPw, setTkeyPw] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [smsRequested, setSmsRequested] = useState(false);
  const [tkeyConnected, setTkeyConnected] = useState(false);
  const [tkeyMsg, setTkeyMsg] = useState('티키타카(T.Key-taka) 계정을 연동하거나 수동 엑셀을 업로드하세요.');
  const [schedule, setSchedule] = useState<TkeyScheduleConfig>({
    enabled: true,
    startHour: 9,
    endHour: 21,
    wirelessIntervalMin: 10,
    wiredIntervalMin: 30,
  });

  // ===== 사용자/권한 관리 상태 =====
  const [headCode, setHeadCode] = useState('D13965');
  const [teams, setTeams] = useState<TeamPermission[]>([
    { id: 'retail', name: '소매영업팀', tabs: { sales: true, report: true, users: true } },
    { id: 'wholesale', name: '도매팀', tabs: { sales: true, report: true, users: false } },
    { id: 'support', name: '업무지원팀', tabs: { sales: true, report: true, users: true } },
  ]);
  const [users, setUsers] = useState<UserAccount[]>([
    {
      id: 'u1',
      name: '소매담당자',
      empCode: 'D139650001',
      teamId: 'retail',
      role: '상위관리자',
      status: '이용중',
      lastLogin: '오늘',
    },
  ]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserCode, setNewUserCode] = useState('');

  async function handleRequestSms() {
    try {
      const res = await fetch('/api/tkey/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_sms', userId: tkeyId, password: tkeyPw }),
      });
      const data = await res.json();
      setTkeyMsg(data.message || 'SMS 요청 처리 완료');
      if (data.ok) setSmsRequested(true);
    } catch {
      setTkeyMsg('SMS 인증 요청 중 오류가 발생했습니다.');
    }
  }

  async function handleVerifySms() {
    try {
      const res = await fetch('/api/tkey/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_sms', userId: tkeyId, smsCode }),
      });
      const data = await res.json();
      setTkeyMsg(data.message || '인증 확인 완료');
      if (data.ok && data.connected) {
        setTkeyConnected(true);
        onAddLog({
          id: `log-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('ko-KR'),
          type: 'auto',
          status: 'success',
          message: `티키타카 계정(${tkeyId || '연동계정'}) 인증 세션 연결`,
        });
      }
    } catch {
      setTkeyMsg('인증 확인 중 오류가 발생했습니다.');
    }
  }

  function jsonRowsToArrayBuffer(rows: Record<string, unknown>[]): ArrayBuffer {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    return out as ArrayBuffer;
  }

  async function runSync(triggerType: 'manual' | 'auto') {
    try {
      const res = await fetch('/api/tkey/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: tkeyId, schedule }),
      });
      const data = await res.json();

      let wCount = 0;
      let dCount = 0;
      if (Array.isArray(data.wirelessRaw) && data.wirelessRaw.length > 0) {
        const parsedW = parseWirelessExcel(
          jsonRowsToArrayBuffer(data.wirelessRaw),
          storeConfig,
          modelGroups
        );
        onWirelessLoaded(parsedW);
        wCount = parsedW.length;
      }
      if (Array.isArray(data.wiredRaw) && data.wiredRaw.length > 0) {
        const parsedD = parseWiredExcel(jsonRowsToArrayBuffer(data.wiredRaw), storeConfig);
        onWiredLoaded(parsedD);
        dCount = parsedD.length;
      }

      const msg =
        wCount || dCount
          ? `자동 수집 반영 완료: 무선 ${wCount.toLocaleString()}건 / 유선 ${dCount.toLocaleString()}건`
          : data.message || '동기화 완료';

      setTkeyMsg(msg);
      onAddLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('ko-KR'),
        type: triggerType,
        status: data.ok ? 'success' : 'error',
        message: msg,
        wirelessCount: wCount || undefined,
        wiredCount: dCount || undefined,
      });
    } catch {
      setTkeyMsg('동기화 중 오류가 발생했습니다.');
    }
  }

  async function handleManualSync() {
    await runSync('manual');
  }

  useEffect(() => {
    if (!tkeyConnected || !schedule.enabled) return;
    const ms = Math.max(1, schedule.wirelessIntervalMin) * 60 * 1000;
    const timer = setInterval(() => {
      const h = new Date().getHours();
      if (h >= schedule.startHour && h <= schedule.endHour) {
        runSync('auto');
      }
    }, ms);
    return () => clearInterval(timer);
  }, [tkeyConnected, schedule.enabled, schedule.wirelessIntervalMin, schedule.startHour, schedule.endHour]);

  async function handleWirelessUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseWirelessExcel(buf, storeConfig, modelGroups);
      onWirelessLoaded(parsed);
      const msg = `무선 엑셀(${file.name}) ${parsed.length.toLocaleString()}건 반영 완료`;
      setTkeyMsg(msg);
      onAddLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('ko-KR'),
        type: 'upload',
        status: 'success',
        message: msg,
        wirelessCount: parsed.length,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '무선 파일 파싱 실패';
      setTkeyMsg(msg);
      onAddLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('ko-KR'),
        type: 'upload',
        status: 'error',
        message: msg,
      });
    }
  }

  async function handleWiredUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseWiredExcel(buf, storeConfig);
      onWiredLoaded(parsed);
      const msg = `유선 엑셀(${file.name}) ${parsed.length.toLocaleString()}건 반영 완료`;
      setTkeyMsg(msg);
      onAddLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('ko-KR'),
        type: 'upload',
        status: 'success',
        message: msg,
        wiredCount: parsed.length,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '유선 파일 파싱 실패';
      setTkeyMsg(msg);
      onAddLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('ko-KR'),
        type: 'upload',
        status: 'error',
        message: msg,
      });
    }
  }

  return (
    <div>
      <div className="subtabs">
        <button
          type="button"
          className={`subtab ${subTab === 'tkey' ? 'active' : ''}`}
          onClick={() => setSubTab('tkey')}
        >
          티키타카 자동연동 · 수동 업로드
        </button>
        <button
          type="button"
          className={`subtab ${subTab === 'accounts' ? 'active' : ''}`}
          onClick={() => setSubTab('accounts')}
        >
          사용자 · 팀 권한 관리
        </button>
      </div>

      {subTab === 'tkey' ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* 티키타카 계정 연동 */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <strong style={{ fontSize: 16 }}>T.Key-taka (티키타카) 계정 연동</strong>
                <span
                  className="badge-pill"
                  style={{
                    background: tkeyConnected ? '#dcfce7' : '#fef3c7',
                    borderColor: tkeyConnected ? '#16a34a' : '#d97706',
                  }}
                >
                  {tkeyConnected ? '연동됨' : '미연동'}
                </span>
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                <input
                  className="input"
                  placeholder="T.Key-taka 아이디"
                  value={tkeyId}
                  onChange={(e) => setTkeyId(e.target.value)}
                />
                <input
                  className="input"
                  type="password"
                  placeholder="비밀번호"
                  value={tkeyPw}
                  onChange={(e) => setTkeyPw(e.target.value)}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-primary" onClick={handleRequestSms}>
                    SMS 인증번호 요청
                  </button>
                  <input
                    className="input"
                    placeholder="6자리 인증번호"
                    maxLength={6}
                    value={smsCode}
                    onChange={(e) => setSmsCode(e.target.value)}
                    style={{ width: 150 }}
                  />
                  <button
                    type="button"
                    className="btn btn-green"
                    disabled={!smsRequested}
                    onClick={handleVerifySms}
                  >
                    인증 확인
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: '#f8fafc', fontSize: 12, color: '#334155' }}>
                {tkeyMsg}
              </div>
            </div>

            {/* 자동연동 스케줄 + 수동 업로드 */}
            <div className="card">
              <strong style={{ fontSize: 16, display: 'block', marginBottom: 12 }}>
                자동연동 스케줄 ({schedule.startHour}:00 ~ {schedule.endHour}:00)
              </strong>

              <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 800 }}>
                  <input
                    type="checkbox"
                    checked={schedule.enabled}
                    onChange={(e) => setSchedule({ ...schedule, enabled: e.target.checked })}
                  />{' '}
                  영업시간 자동 수집 활성화 (Vercel Cron 연동)
                </label>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <label style={{ fontSize: 13, fontWeight: 700 }}>
                    T판매관리(무선) 주기{' '}
                    <select
                      className="select"
                      value={schedule.wirelessIntervalMin}
                      onChange={(e) =>
                        setSchedule({ ...schedule, wirelessIntervalMin: Number(e.target.value) })
                      }
                    >
                      <option value={10}>10분</option>
                      <option value={30}>30분</option>
                      <option value={60}>60분</option>
                    </select>
                  </label>

                  <label style={{ fontSize: 13, fontWeight: 700 }}>
                    유선판매 주기{' '}
                    <select
                      className="select"
                      value={schedule.wiredIntervalMin}
                      onChange={(e) =>
                        setSchedule({ ...schedule, wiredIntervalMin: Number(e.target.value) })
                      }
                    >
                      <option value={30}>30분</option>
                      <option value={60}>60분</option>
                    </select>
                  </label>

                  <button type="button" className="btn btn-blue" onClick={handleManualSync}>
                    지금 즉시 연동
                  </button>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                <strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>
                  수동 파일 업로드 (T판매관리 · 유선판매)
                </strong>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <label className="btn btn-yellow" style={{ cursor: 'pointer' }}>
                    무선 T판매관리 업로드
                    <input
                      type="file"
                      accept=".xlsx,.xls,.xlsm"
                      onChange={handleWirelessUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <label className="btn btn-blue" style={{ cursor: 'pointer' }}>
                    유선판매 업로드
                    <input
                      type="file"
                      accept=".xlsx,.xls,.xlsm"
                      onChange={handleWiredUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <strong style={{ fontSize: 15, display: 'block', marginBottom: 10 }}>
              연동 및 업로드 실행 이력 ({syncLogs.length}건)
            </strong>
            <div className="table-scroll" style={{ maxHeight: 280 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>시각</th>
                    <th>구분</th>
                    <th>상태</th>
                    <th>내용</th>
                  </tr>
                </thead>
                <tbody>
                  {syncLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>
                        실행 이력이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    syncLogs.map((l) => (
                      <tr key={l.id}>
                        <td>{l.timestamp}</td>
                        <td>{l.type === 'auto' ? '자동연동' : l.type === 'manual' ? '수동연동' : '엑셀업로드'}</td>
                        <td style={{ fontWeight: 800, color: l.status === 'error' ? '#dc2626' : '#15803d' }}>
                          {l.status}
                        </td>
                        <td>{l.message}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="card">
            <strong style={{ fontSize: 16, display: 'block', marginBottom: 10 }}>
              본사코드 및 팀별 탭 권한 설정
            </strong>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 800 }}>
                가입 허용 본사코드{' '}
                <input
                  className="input"
                  value={headCode}
                  onChange={(e) => setHeadCode(e.target.value.toUpperCase())}
                  style={{ width: 140, marginLeft: 8 }}
                />
              </label>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>팀명</th>
                  <th>판매현황</th>
                  <th>실적보고</th>
                  <th>사용자관리</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t, idx) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 800 }}>{t.name}</td>
                    {(['sales', 'report', 'users'] as const).map((tabKey) => (
                      <td key={tabKey}>
                        <input
                          type="checkbox"
                          checked={t.tabs[tabKey]}
                          onChange={(e) => {
                            const next = [...teams];
                            next[idx] = {
                              ...next[idx],
                              tabs: { ...next[idx].tabs, [tabKey]: e.target.checked },
                            };
                            setTeams(next);
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <strong style={{ fontSize: 16, display: 'block', marginBottom: 10 }}>
              사용자 계정 관리 ({users.length}명)
            </strong>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                className="input"
                placeholder="이름"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                style={{ width: 110 }}
              />
              <input
                className="input"
                placeholder="D코드 사번"
                value={newUserCode}
                onChange={(e) => setNewUserCode(e.target.value)}
                style={{ width: 140 }}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (!newUserName.trim() || !newUserCode.trim()) return;
                  setUsers([
                    ...users,
                    {
                      id: `u-${Date.now()}`,
                      name: newUserName.trim(),
                      empCode: newUserCode.trim().toUpperCase(),
                      teamId: 'retail',
                      role: '매니저',
                      status: '이용중',
                      lastLogin: '신규등록',
                    },
                  ]);
                  setNewUserName('');
                  setNewUserCode('');
                }}
              >
                사용자 추가
              </button>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>사번</th>
                  <th>권한</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 800 }}>{u.name}</td>
                    <td>{u.empCode}</td>
                    <td>{u.role}</td>
                    <td>
                      <select
                        className="select"
                        value={u.status}
                        onChange={(e) => {
                          const next = [...users];
                          next[idx] = {
                            ...next[idx],
                            status: e.target.value as UserAccount['status'],
                          };
                          setUsers(next);
                        }}
                      >
                        <option value="이용중">이용중</option>
                        <option value="승인대기">승인대기</option>
                        <option value="로그인 잠금">로그인 잠금</option>
                        <option value="퇴사자">퇴사자</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

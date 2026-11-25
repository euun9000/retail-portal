'use client';

import React, { useEffect, useState } from 'react';
import type {
  MainTab,
  ModelGroup,
  StoreConfig,
  TkeySyncLog,
  WiredRecord,
  WirelessRecord,
} from '@/lib/types';
import { DEFAULT_MODEL_GROUPS, DEFAULT_STORE_CONFIG } from '@/lib/excelParser';
import SalesStatusTab from '@/components/SalesStatusTab';
import PerformanceReportTab from '@/components/PerformanceReportTab';
import UserManagementTab from '@/components/UserManagementTab';

function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(
    n.getDate()
  ).padStart(2, '0')}`;
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<MainTab>('report');
  const [reportDate, setReportDate] = useState<string>(todayISO);
  const [storeConfig, setStoreConfig] = useState<StoreConfig>(DEFAULT_STORE_CONFIG);
  const [modelGroups, setModelGroups] = useState<ModelGroup[]>(DEFAULT_MODEL_GROUPS);
  const [wireless, setWireless] = useState<WirelessRecord[]>([]);
  const [wired, setWired] = useState<WiredRecord[]>([]);
  const [syncLogs, setSyncLogs] = useState<TkeySyncLog[]>([]);

  useEffect(() => {
    try {
      const savedStore = localStorage.getItem('retail_portal_store_config_v1');
      if (savedStore) setStoreConfig(JSON.parse(savedStore));
      const savedModels = localStorage.getItem('retail_portal_model_groups_v1');
      if (savedModels) setModelGroups(JSON.parse(savedModels));
    } catch {}

    // 중앙 DB(Supabase)에 저장된 최신 무선/유선 실적과 연동 이력 자동 불러오기
    fetch('/api/tkey/state')
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok && (data?.workerConfigured || data?.dbConfigured)) {
          if (Array.isArray(data.wireless) && data.wireless.length) setWireless(data.wireless);
          if (Array.isArray(data.wired) && data.wired.length) setWired(data.wired);
          if (Array.isArray(data.state?.sync_logs)) setSyncLogs(data.state.sync_logs);
        }
      })
      .catch(() => {});
  }, []);

  function handleUpdateStoreConfig(cfg: StoreConfig) {
    setStoreConfig(cfg);
    try {
      localStorage.setItem('retail_portal_store_config_v1', JSON.stringify(cfg));
    } catch {}
  }

  function handleUpdateModelGroups(groups: ModelGroup[]) {
    setModelGroups(groups);
    try {
      localStorage.setItem('retail_portal_model_groups_v1', JSON.stringify(groups));
    } catch {}
  }

  return (
    <div>
      <header className="topbar">
        <div className="brand">소매 · 도매 통합 실적관리</div>
        <nav className="nav-tabs">
          <button
            type="button"
            className={`nav-tab ${activeTab === 'sales' ? 'active' : ''}`}
            onClick={() => setActiveTab('sales')}
          >
            판매현황
          </button>
          <button
            type="button"
            className={`nav-tab ${activeTab === 'report' ? 'active' : ''}`}
            onClick={() => setActiveTab('report')}
          >
            실적보고
          </button>
          <button
            type="button"
            className={`nav-tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            사용자관리
          </button>
        </nav>
        <div className="topbar-right">
          <span className="badge-pill">무선 {wireless.length.toLocaleString()}건</span>
          <span className="badge-pill">유선 {wired.length.toLocaleString()}건</span>
        </div>
      </header>

      <main className="container">
        {activeTab === 'sales' && (
          <SalesStatusTab
            wireless={wireless}
            wired={wired}
            storeConfig={storeConfig}
            modelGroups={modelGroups}
            reportDate={reportDate}
            onChangeDate={setReportDate}
          />
        )}

        {activeTab === 'report' && (
          <PerformanceReportTab
            wireless={wireless}
            wired={wired}
            storeConfig={storeConfig}
            modelGroups={modelGroups}
            reportDate={reportDate}
            onChangeDate={setReportDate}
            onUpdateStoreConfig={handleUpdateStoreConfig}
            onUpdateModelGroups={handleUpdateModelGroups}
          />
        )}

        {activeTab === 'users' && (
          <UserManagementTab
            storeConfig={storeConfig}
            modelGroups={modelGroups}
            syncLogs={syncLogs}
            onAddLog={(log) => setSyncLogs((prev) => [log, ...prev])}
            onWirelessLoaded={(rows) => {
              setWireless(rows);
              fetch('/api/tkey/state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wireless: rows }),
              }).catch(() => {});
            }}
            onWiredLoaded={(rows) => {
              setWired(rows);
              fetch('/api/tkey/state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wired: rows }),
              }).catch(() => {});
            }}
          />
        )}
      </main>
    </div>
  );
}

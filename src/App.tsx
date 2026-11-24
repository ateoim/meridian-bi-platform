import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Database } from 'lucide-react';
import { getDatabase, type MeridianDB } from './db/database';
import {
  getAnomalyAlerts,
  getChannelRoi,
  getCohortRetentionMatrix,
  getExecutiveKpis,
  getMonthlyRevenueTrend,
  getRevenueBySegment,
  getRevenueByState,
} from './db/queries';
import { Sidebar, type NavTab } from './components/Sidebar';
import { ExecutiveDashboard } from './components/ExecutiveDashboard';
import { CohortEconomics } from './components/CohortEconomics';
import { SqlWorkbench } from './components/SqlWorkbench';
import { DataDictionary } from './components/DataDictionary';

export function App() {
  const [db, setDb] = useState<MeridianDB | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('executive');
  const [workbenchSql, setWorkbenchSql] = useState<string | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    getDatabase()
      .then((instance) => {
        if (mounted) setDb(instance);
      })
      .catch((err) => {
        if (mounted) {
          setLoadError(
            err instanceof Error ? err.message : 'Failed to initialize in-browser SQLite engine.'
          );
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const analytics = useMemo(() => {
    if (!db) return null;
    const schema = db.getSchema();
    const totalRows = schema.reduce((acc, t) => acc + t.rowCount, 0);
    const kpis = getExecutiveKpis(db);
    const monthlyTrend = getMonthlyRevenueTrend(db);
    const segmentRevenue = getRevenueBySegment(db);
    const stateRevenue = getRevenueByState(db);
    const alerts = getAnomalyAlerts(db);
    const cohorts = getCohortRetentionMatrix(db);
    const channels = getChannelRoi(db);

    return {
      schema,
      totalRows,
      kpis,
      monthlyTrend,
      segmentRevenue,
      stateRevenue,
      alerts,
      cohorts,
      channels,
    };
  }, [db]);

  const handleInspectSql = (sql: string) => {
    setWorkbenchSql(sql);
    setActiveTab('workbench');
  };

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-rose-200 rounded-xl p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-rose-700 font-semibold text-sm">
            <AlertTriangle className="w-5 h-5" />
            SQLite Engine Initialization Error
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!db || !analytics) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl px-6 py-5 shadow-xs flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center animate-pulse">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Initializing Meridian BI</div>
            <div className="text-xs text-slate-500">
              Loading SQLite WebAssembly engine &amp; seeding relational star schema...
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        tableCount={analytics.schema.length}
        totalRows={analytics.totalRows}
        latestMonth={analytics.kpis.latestMonth}
      />

      <main className="flex-1 min-w-0 p-5 sm:p-7 max-w-[1440px] mx-auto w-full">
        {activeTab === 'executive' && (
          <ExecutiveDashboard
            kpis={analytics.kpis}
            monthlyTrend={analytics.monthlyTrend}
            segmentRevenue={analytics.segmentRevenue}
            stateRevenue={analytics.stateRevenue}
            alerts={analytics.alerts}
            onInspectSql={handleInspectSql}
          />
        )}

        {activeTab === 'cohorts' && (
          <CohortEconomics cohorts={analytics.cohorts} channels={analytics.channels} />
        )}

        {activeTab === 'workbench' && (
          <SqlWorkbench db={db} schema={analytics.schema} initialSql={workbenchSql} />
        )}

        {activeTab === 'dictionary' && (
          <DataDictionary schema={analytics.schema} onInspectSql={handleInspectSql} />
        )}
      </main>
    </div>
  );
}

import {
  BarChart3,
  BookOpen,
  Database,
  Layers,
  TerminalSquare,
} from 'lucide-react';
import { formatNumber } from '../utils/format';

export type NavTab = 'executive' | 'cohorts' | 'workbench' | 'dictionary';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  tableCount: number;
  totalRows: number;
  latestMonth: string;
}

const NAV_ITEMS: { id: NavTab; label: string; subtitle: string; icon: typeof BarChart3 }[] = [
  {
    id: 'executive',
    label: 'Executive KPIs',
    subtitle: 'MRR, ARR, Margins & Alerts',
    icon: BarChart3,
  },
  {
    id: 'cohorts',
    label: 'Cohorts & Unit Economics',
    subtitle: 'Retention Matrix & Channel ROI',
    icon: Layers,
  },
  {
    id: 'workbench',
    label: 'SQL Workbench',
    subtitle: 'Live In-Browser SQLite IDE',
    icon: TerminalSquare,
  },
  {
    id: 'dictionary',
    label: 'Data Dictionary',
    subtitle: 'Star Schema & KPI Lineage',
    icon: BookOpen,
  },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  tableCount,
  totalRows,
  latestMonth,
}: SidebarProps) {
  return (
    <aside className="w-full lg:w-64 lg:min-h-screen bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col justify-between shrink-0">
      <div>
        {/* Brand Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-700 text-white flex items-center justify-center shadow-xs">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-slate-900">Meridian BI</h1>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                SQL
              </span>
            </div>
            <p className="text-[11px] text-slate-500">AU B2B SaaS Analytics</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-3 space-y-1" aria-label="Primary Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-start gap-3 cursor-pointer ${
                  active
                    ? 'bg-blue-50 text-blue-800 border border-blue-200/80'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                }`}
              >
                <Icon
                  className={`w-4 h-4 mt-0.5 shrink-0 ${
                    active ? 'text-blue-700' : 'text-slate-400'
                  }`}
                />
                <div className="min-w-0">
                  <div className={`text-xs font-semibold ${active ? 'text-blue-900' : 'text-slate-800'}`}>
                    {item.label}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{item.subtitle}</div>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Live SQLite Engine Status Footer */}
      <div className="p-4 border-t border-slate-200 bg-slate-50/70 space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-medium text-slate-700">
            <span className="w-2 h-2 rounded-full bg-teal-600 inline-block" />
            SQLite WASM
          </span>
          <span className="font-mono text-[11px] text-slate-500 tabular-nums">
            {latestMonth}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="bg-white border border-slate-200 rounded-md px-2.5 py-1.5">
            <div className="text-slate-400">Tables</div>
            <div className="font-semibold text-slate-800 tabular-nums">{tableCount}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-md px-2.5 py-1.5">
            <div className="text-slate-400">Records</div>
            <div className="font-semibold text-slate-800 tabular-nums">
              {formatNumber(totalRows)}
            </div>
          </div>
        </div>
        <p className="text-[10px] leading-relaxed text-slate-500">
          Powered by deterministic synthetic Australian B2B SaaS &amp; commerce data running locally in-browser.
        </p>
      </div>
    </aside>
  );
}

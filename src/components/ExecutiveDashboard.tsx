import { useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Code2,
  Info,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  ExecutiveKpiSummary,
  KpiAnomalyAlert,
  MonthlyRevenuePoint,
  SegmentRevenueRow,
  StateRevenueRow,
} from '../db/types';
import { formatAud, formatMonthShort, formatNumber, formatPct } from '../utils/format';

interface ExecutiveDashboardProps {
  kpis: ExecutiveKpiSummary;
  monthlyTrend: MonthlyRevenuePoint[];
  segmentRevenue: SegmentRevenueRow[];
  stateRevenue: StateRevenueRow[];
  alerts: KpiAnomalyAlert[];
  onInspectSql: (sql: string) => void;
}

const STATE_BAR_COLORS = ['#1D4ED8', '#2563EB', '#0F766E', '#0D9488', '#475569', '#64748B'];

export function ExecutiveDashboard({
  kpis,
  monthlyTrend,
  segmentRevenue,
  stateRevenue,
  alerts,
  onInspectSql,
}: ExecutiveDashboardProps) {
  const [trendMode, setTrendMode] = useState<'composition' | 'margin'>('composition');

  const gmDelta = Math.round((kpis.grossMarginPct - kpis.prevGrossMarginPct) * 10) / 10;
  const cacDeltaPct =
    kpis.prevCac > 0 ? Math.round(((kpis.cac - kpis.prevCac) / kpis.prevCac) * 1000) / 10 : 0;

  const chartData = monthlyTrend.map((pt) => ({
    ...pt,
    label: formatMonthShort(pt.billingMonth),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Executive KPI Dashboard
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Live SQL aggregations over reporting period{' '}
            <span className="font-mono font-medium text-slate-700">{kpis.latestMonth}</span> vs{' '}
            <span className="font-mono text-slate-600">{kpis.previousMonth}</span> (AUD)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-white border border-slate-200 text-slate-600">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            {formatNumber(kpis.activeCustomers)} Active B2B Accounts
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            Synthetic AU Dataset
          </span>
        </div>
      </div>

      {/* 6 Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* MRR */}
        <KpiCard
          label="Monthly Recurring Revenue (MRR)"
          value={formatAud(kpis.mrr)}
          delta={formatPct(kpis.mrrDeltaPct, 1, true)}
          positive={kpis.mrrDeltaPct >= 0}
          subtext={`Prior month: ${formatAud(kpis.prevMrr)}`}
        />

        {/* ARR */}
        <KpiCard
          label="Annual Recurring Revenue (ARR)"
          value={formatAud(kpis.arr, true)}
          delta={`+${kpis.newCustomersLatestMonth} logos`}
          positive={true}
          subtext={`Run-rate (${formatAud(kpis.arr)} exact)`}
        />

        {/* NRR */}
        <KpiCard
          label="Net Revenue Retention (6m NRR)"
          value={formatPct(kpis.nrrPct)}
          delta={kpis.nrrPct >= 100 ? 'Net Expansion' : 'Net Contraction'}
          positive={kpis.nrrPct >= 100}
          subtext="Trailing 6-month existing cohort expansion"
        />

        {/* Gross Margin */}
        <KpiCard
          label="Gross Margin %"
          value={formatPct(kpis.grossMarginPct)}
          delta={`${gmDelta >= 0 ? '+' : ''}${gmDelta.toFixed(1)} pts`}
          positive={gmDelta >= 0}
          subtext="Paid revenue less cloud & support COGS"
        />

        {/* CAC */}
        <KpiCard
          label="Customer Acquisition Cost (CAC)"
          value={formatAud(kpis.cac)}
          delta={formatPct(cacDeltaPct, 1, true)}
          positive={cacDeltaPct <= 0}
          subtext="Trailing 3-month marketing spend / new logos"
        />

        {/* LTV:CAC */}
        <KpiCard
          label="LTV : CAC Ratio"
          value={`${kpis.ltvCacRatio.toFixed(1)}x`}
          delta={`LTV ${formatAud(kpis.ltv, true)}`}
          positive={kpis.ltvCacRatio >= 3}
          subtext="Target benchmark: >= 3.0x B2B SaaS"
        />
      </div>

      {/* Main Revenue Trend Chart */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-700" />
              Monthly Revenue &amp; Expansion Trend (2025–2026)
            </h3>
            <p className="text-xs text-slate-500">
              Computed via SQL CTE with <code className="text-[11px] bg-slate-100 px-1 rounded">LAG()</code> and{' '}
              <code className="text-[11px] bg-slate-100 px-1 rounded">SUM() OVER</code> window functions
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setTrendMode('composition')}
              className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                trendMode === 'composition'
                  ? 'bg-white text-blue-800 shadow-2xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Revenue Mix
            </button>
            <button
              type="button"
              onClick={() => setTrendMode('margin')}
              className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                trendMode === 'margin'
                  ? 'bg-white text-blue-800 shadow-2xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Total &amp; Margin %
            </button>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {trendMode === 'composition' ? (
              <BarChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={{ stroke: '#CBD5E1' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) => formatAud(v, true)}
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                  width={62}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [formatAud(value), name]}
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid #E2E8F0',
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="renewalRevenue" name="Renewal MRR" stackId="a" fill="#1D4ED8" radius={[0, 0, 0, 0]} />
                <Bar dataKey="expansionRevenue" name="Expansion MRR" stackId="a" fill="#0F766E" />
                <Bar dataKey="newRevenue" name="New Logo MRR" stackId="a" fill="#93C5FD" radius={[3, 3, 0, 0]} />
              </BarChart>
            ) : (
              <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={{ stroke: '#CBD5E1' }}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  tickFormatter={(v: number) => formatAud(v, true)}
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                  width={62}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[70, 95]}
                  tickFormatter={(v: number) => `${v}%`}
                  tick={{ fontSize: 11, fill: '#0F766E' }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    name.includes('%') ? formatPct(value) : formatAud(value),
                    name,
                  ]}
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid #E2E8F0',
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="totalRevenue" name="Total Paid MRR" fill="#1D4ED8" radius={[3, 3, 0, 0]} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="grossMarginPct"
                  name="Gross Margin %"
                  stroke="#0F766E"
                  strokeWidth={2.5}
                  dot={{ r: 2.5, fill: '#0F766E' }}
                />
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Segment + AU State Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Segment Breakdown */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Latest-Month MRR by Commercial Segment
            </h3>
            <p className="text-xs text-slate-500">
              Account count, ARPA, and gross margin across Enterprise, Mid-Market, and SMB
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
                  <th className="text-left py-2 font-semibold">Segment</th>
                  <th className="text-right py-2 font-semibold">Accounts</th>
                  <th className="text-right py-2 font-semibold">MRR (AUD)</th>
                  <th className="text-right py-2 font-semibold">ARPA</th>
                  <th className="text-right py-2 font-semibold">GM %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {segmentRevenue.map((row) => (
                  <tr key={row.segment} className="hover:bg-slate-50/70">
                    <td className="py-3 font-semibold text-slate-800">{row.segment}</td>
                    <td className="py-3 text-right text-slate-600">{formatNumber(row.customers)}</td>
                    <td className="py-3 text-right font-semibold text-slate-900">
                      {formatAud(row.revenue)}
                    </td>
                    <td className="py-3 text-right text-slate-700">{formatAud(row.avgArpa)}</td>
                    <td className="py-3 text-right">
                      <span className="inline-flex px-2 py-0.5 rounded bg-teal-50 text-teal-800 font-medium border border-teal-200/70">
                        {formatPct(row.grossMarginPct)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* AU State Breakdown */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Cumulative Paid Revenue by Australian State
            </h3>
            <p className="text-xs text-slate-500">
              Regional B2B revenue concentration using SQL <code className="text-[11px] bg-slate-100 px-1 rounded">SUM() OVER ()</code> share
            </p>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stateRevenue}
                layout="vertical"
                margin={{ top: 4, right: 20, left: 4, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => formatAud(v, true)}
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="state"
                  tick={{ fontSize: 11, fill: '#0F172A', fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                />
                <Tooltip
                  formatter={(value: number) => [formatAud(value), 'Paid Revenue']}
                  contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
                />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]} barSize={18}>
                  {stateRevenue.map((entry, idx) => (
                    <Cell key={entry.state} fill={STATE_BAR_COLORS[idx % STATE_BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Automated KPI Anomaly & Threshold Alerts */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Automated KPI Anomaly &amp; Threshold Alerts
            </h3>
            <p className="text-xs text-slate-500">
              Rule-based SQL monitors comparing latest period metrics against trailing baselines
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            {alerts.length} active signals
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {alerts.map((alert) => {
            const styles =
              alert.severity === 'critical'
                ? {
                    border: 'border-rose-200 bg-rose-50/40',
                    badge: 'bg-rose-100 text-rose-800 border-rose-200',
                    Icon: ShieldAlert,
                    iconColor: 'text-rose-600',
                  }
                : alert.severity === 'warning'
                  ? {
                      border: 'border-amber-200 bg-amber-50/40',
                      badge: 'bg-amber-100 text-amber-800 border-amber-200',
                      Icon: AlertTriangle,
                      iconColor: 'text-amber-600',
                    }
                  : {
                      border: 'border-blue-200 bg-blue-50/40',
                      badge: 'bg-blue-100 text-blue-800 border-blue-200',
                      Icon: Info,
                      iconColor: 'text-blue-600',
                    };
            const Icon = styles.Icon;

            return (
              <div
                key={alert.id}
                className={`rounded-lg border p-4 flex flex-col justify-between gap-3 ${styles.border}`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 shrink-0 ${styles.iconColor}`} />
                      <h4 className="text-xs font-semibold text-slate-900">{alert.title}</h4>
                    </div>
                    <span
                      className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border ${styles.badge}`}
                    >
                      {alert.severity}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{alert.detail}</p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200/70">
                  <div className="flex items-baseline gap-2 tabular-nums">
                    <span className="text-[11px] text-slate-500">{alert.metricLabel}:</span>
                    <span className="text-sm font-bold text-slate-900">{alert.currentValue}</span>
                    <span className="text-[11px] text-slate-500">({alert.baselineValue})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onInspectSql(alert.sqlReference)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900 cursor-pointer"
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    Inspect SQL
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: string;
  delta: string;
  positive: boolean;
  subtext: string;
}

function KpiCard({ label, value, delta, positive, subtext }: KpiCardProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col justify-between">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <div className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
          {value}
        </div>
        <span
          className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-semibold tabular-nums ${
            positive
              ? 'bg-teal-50 text-teal-800 border border-teal-200/70'
              : 'bg-rose-50 text-rose-700 border border-rose-200/70'
          }`}
        >
          {positive ? (
            <ArrowUpRight className="w-3 h-3" />
          ) : (
            <ArrowDownRight className="w-3 h-3" />
          )}
          {delta}
        </span>
      </div>
      <div className="mt-2 text-[11px] text-slate-500 truncate">{subtext}</div>
    </div>
  );
}

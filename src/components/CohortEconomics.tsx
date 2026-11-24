import { useState } from 'react';
import { BarChart2, Grid3X3 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChannelRoiRow, CohortQuarterRow } from '../db/types';
import { formatAud, formatNumber, formatPct } from '../utils/format';

interface CohortEconomicsProps {
  cohorts: CohortQuarterRow[];
  channels: ChannelRoiRow[];
}

function getHeatmapCellStyle(val: number | null, mode: 'account' | 'revenue'): string {
  if (val === null) return 'bg-slate-50 text-slate-300';
  if (mode === 'revenue' && val >= 105) return 'bg-teal-700 text-white font-semibold';
  if (val >= 95) return 'bg-blue-700 text-white font-semibold';
  if (val >= 85) return 'bg-blue-600 text-white font-medium';
  if (val >= 75) return 'bg-blue-200 text-blue-950 font-medium';
  if (val >= 60) return 'bg-blue-100 text-blue-900';
  return 'bg-slate-100 text-slate-700';
}

export function CohortEconomics({ cohorts, channels }: CohortEconomicsProps) {
  const [matrixMode, setMatrixMode] = useState<'account' | 'revenue'>('account');
  const periodLabels = ['Q0', 'Q+1', 'Q+2', 'Q+3', 'Q+4', 'Q+5', 'Q+6'];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900">
          Cohort Retention &amp; Unit Economics
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          SQL-computed quarterly signup cohort retention and acquisition channel efficiency
        </p>
      </div>

      {/* Cohort Retention Heatmap */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Grid3X3 className="w-4 h-4 text-blue-700" />
              Quarterly Cohort Retention Matrix
            </h3>
            <p className="text-xs text-slate-500">
              {matrixMode === 'account'
                ? 'Percentage of initial cohort accounts remaining active with paid invoices in subsequent quarters'
                : 'Net dollar retention relative to Q0 cohort revenue (values >100% indicate expansion upsells)'}
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMatrixMode('account')}
              className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                matrixMode === 'account'
                  ? 'bg-white text-blue-800 shadow-2xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Logo Retention %
            </button>
            <button
              type="button"
              onClick={() => setMatrixMode('revenue')}
              className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                matrixMode === 'revenue'
                  ? 'bg-white text-blue-800 shadow-2xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Revenue Retention %
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate border-spacing-1">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                <th className="text-left py-2 px-2 font-semibold">Cohort</th>
                <th className="text-right py-2 px-2 font-semibold">Logos</th>
                <th className="text-right py-2 px-2 font-semibold">Avg Q0 MRR</th>
                {periodLabels.map((p) => (
                  <th key={p} className="text-center py-2 px-2 font-semibold">
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {cohorts.map((row) => {
                const values =
                  matrixMode === 'account' ? row.accountRetention : row.revenueRetention;
                return (
                  <tr key={row.cohortQuarter}>
                    <td className="py-2 px-2 font-mono font-semibold text-slate-800 whitespace-nowrap">
                      {row.cohortQuarter}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-600">
                      {formatNumber(row.cohortSize)}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-700 font-medium whitespace-nowrap">
                      {formatAud(row.initialMrr, true)}
                    </td>
                    {values.map((val, idx) => (
                      <td
                        key={`${row.cohortQuarter}-${idx}`}
                        className={`py-2 px-2 text-center rounded-md transition-colors ${getHeatmapCellStyle(
                          val,
                          matrixMode
                        )}`}
                      >
                        {val === null ? '—' : formatPct(val, 0)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Marketing Channel ROI & CAC Efficiency */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-teal-700" />
              Spend vs Attributed Revenue
            </h3>
            <p className="text-xs text-slate-500">
              Cumulative marketing investment vs paid customer revenue by channel
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channels} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis
                  dataKey="channel"
                  tick={{ fontSize: 10, fill: '#475569' }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={45}
                />
                <YAxis
                  tickFormatter={(v: number) => formatAud(v, true)}
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [formatAud(value), name]}
                  contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="totalSpend" name="Total Spend" fill="#94A3B8" radius={[3, 3, 0, 0]} />
                <Bar
                  dataKey="attributedRevenue"
                  name="Attributed Revenue"
                  fill="#0F766E"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="xl:col-span-3 bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Acquisition Channel CAC &amp; ROI Breakdown
            </h3>
            <p className="text-xs text-slate-500">
              Full-funnel conversion and payback efficiency ranked by revenue return multiple
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="text-left py-2 font-semibold">Channel</th>
                  <th className="text-right py-2 font-semibold">Spend</th>
                  <th className="text-right py-2 font-semibold">Leads</th>
                  <th className="text-right py-2 font-semibold">Logos</th>
                  <th className="text-right py-2 font-semibold">CAC</th>
                  <th className="text-right py-2 font-semibold">Rev (AUD)</th>
                  <th className="text-right py-2 font-semibold">ROI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {channels.map((ch) => (
                  <tr key={ch.channel} className="hover:bg-slate-50/70">
                    <td className="py-3 font-semibold text-slate-800 whitespace-nowrap">
                      {ch.channel}
                    </td>
                    <td className="py-3 text-right text-slate-600">
                      {formatAud(ch.totalSpend, true)}
                    </td>
                    <td className="py-3 text-right text-slate-600">
                      {formatNumber(ch.qualifiedLeads)}
                    </td>
                    <td className="py-3 text-right text-slate-800 font-medium">
                      {formatNumber(ch.newCustomers)}
                    </td>
                    <td className="py-3 text-right text-slate-800 font-medium">
                      {formatAud(ch.cac)}
                    </td>
                    <td className="py-3 text-right font-semibold text-slate-900">
                      {formatAud(ch.attributedRevenue, true)}
                    </td>
                    <td className="py-3 text-right">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded font-semibold border ${
                          ch.roiMultiple >= 8
                            ? 'bg-teal-50 text-teal-800 border-teal-200'
                            : ch.roiMultiple >= 4
                              ? 'bg-blue-50 text-blue-800 border-blue-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {ch.roiMultiple.toFixed(1)}x
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

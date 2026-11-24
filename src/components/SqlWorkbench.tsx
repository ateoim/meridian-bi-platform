import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  KeyRound,
  Link2,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  ShieldCheck,
  Table2,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MeridianDB } from '../db/database';
import { SQL_WORKBENCH_TEMPLATES } from '../db/queries';
import type { QueryResult, TableSchemaInfo } from '../db/types';
import { formatNumber, toCsv } from '../utils/format';

interface SqlWorkbenchProps {
  db: MeridianDB;
  schema: TableSchemaInfo[];
  initialSql?: string;
}

const PAGE_SIZE = 25;

export function SqlWorkbench({ db, schema, initialSql }: SqlWorkbenchProps) {
  const [sql, setSql] = useState<string>(initialSql ?? SQL_WORKBENCH_TEMPLATES[0].sql);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [schemaOpen, setSchemaOpen] = useState(true);
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({
    customers: true,
    orders: true,
  });
  const [page, setPage] = useState(0);
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showChart, setShowChart] = useState(true);

  const runQuery = (queryText: string) => {
    try {
      const res = db.query(queryText);
      setResult(res);
      setError(null);
      setPage(0);
      setSortCol(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute query.');
      setResult(null);
    }
  };

  useEffect(() => {
    if (initialSql) {
      setSql(initialSql);
      runQuery(initialSql);
    } else {
      runQuery(SQL_WORKBENCH_TEMPLATES[0].sql);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSql]);

  const sortedRows = useMemo(() => {
    if (!result) return [];
    if (sortCol === null) return result.rows;
    const copy = [...result.rows];
    copy.sort((a, b) => {
      const va = a[sortCol];
      const vb = b[sortCol];
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      return sortDir === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
    return copy;
  }, [result, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const pagedRows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Detect 2-column chartable numeric result (e.g., label + numeric metric)
  const chartPreviewData = useMemo(() => {
    if (!result || result.columns.length !== 2 || result.rows.length === 0 || result.rows.length > 30) {
      return null;
    }
    const allNumericSecondCol = result.rows.every(
      (r) => typeof r[1] === 'number' && Number.isFinite(r[1])
    );
    if (!allNumericSecondCol) return null;

    return {
      xKey: result.columns[0],
      yKey: result.columns[1],
      data: result.rows.map((r) => ({
        [result.columns[0]]: String(r[0] ?? 'NULL'),
        [result.columns[1]]: Number(r[1]),
      })),
    };
  }, [result]);

  const handleSort = (colIdx: number) => {
    if (sortCol === colIdx) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(colIdx);
      setSortDir('asc');
    }
    setPage(0);
  };

  const handleExportCsv = () => {
    if (!result) return;
    const csv = toCsv(result.columns, sortedRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meridian-query-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const insertToken = (token: string) => {
    setSql((prev) => `${prev}${prev.endsWith(' ') || prev.endsWith('\n') ? '' : ' '}${token}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Live SQL Workbench</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Execute read-only SQLite queries directly against the in-browser star-schema database
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-teal-50 text-teal-800 border border-teal-200">
            <ShieldCheck className="w-3.5 h-3.5" />
            Read-Only Guard Active
          </span>
          <button
            type="button"
            onClick={() => setSchemaOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            {schemaOpen ? (
              <>
                <PanelLeftClose className="w-3.5 h-3.5" />
                Hide Schema
              </>
            ) : (
              <>
                <PanelLeftOpen className="w-3.5 h-3.5" />
                Show Schema
              </>
            )}
          </button>
        </div>
      </div>

      {/* Template Selector Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
          Analytical SQL Templates ({SQL_WORKBENCH_TEMPLATES.length})
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SQL_WORKBENCH_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              title={tpl.description}
              onClick={() => {
                setSql(tpl.sql);
                runQuery(tpl.sql);
              }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-800 border border-slate-200 hover:border-blue-200 transition-colors cursor-pointer"
            >
              {tpl.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main Split: Collapsible Schema Explorer + Editor/Results */}
      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {schemaOpen && (
          <div className="w-full lg:w-64 shrink-0 bg-white border border-slate-200 rounded-xl p-3 shadow-2xs space-y-2">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
              <span className="text-xs font-semibold text-slate-800">Schema Explorer</span>
              <span className="text-[10px] text-slate-400">Click to insert</span>
            </div>
            <div className="space-y-1 max-h-[540px] overflow-y-auto pr-1">
              {schema.map((tbl) => {
                const isOpen = !!expandedTables[tbl.name];
                const fkCols = new Set(tbl.foreignKeys.map((fk) => fk.from));
                return (
                  <div key={tbl.name} className="border border-slate-100 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedTables((prev) => ({ ...prev, [tbl.name]: !prev[tbl.name] }))
                      }
                      className="w-full flex items-center justify-between px-2.5 py-2 bg-slate-50/70 hover:bg-slate-100/70 text-left cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5 text-xs font-mono font-semibold text-slate-800">
                        {isOpen ? (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        )}
                        <Table2 className="w-3.5 h-3.5 text-blue-700" />
                        {tbl.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                        {formatNumber(tbl.rowCount)}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="px-2 py-1.5 bg-white space-y-0.5">
                        {tbl.columns.map((col) => (
                          <button
                            key={col.name}
                            type="button"
                            onClick={() => insertToken(`${tbl.name}.${col.name}`)}
                            className="w-full flex items-center justify-between px-1.5 py-1 rounded hover:bg-blue-50 text-[11px] font-mono text-left cursor-pointer group"
                          >
                            <span className="flex items-center gap-1 text-slate-700 group-hover:text-blue-800 truncate">
                              {col.pk && <KeyRound className="w-3 h-3 text-amber-600 shrink-0" />}
                              {!col.pk && fkCols.has(col.name) && (
                                <Link2 className="w-3 h-3 text-teal-600 shrink-0" />
                              )}
                              {col.name}
                            </span>
                            <span className="text-[10px] text-slate-400 uppercase">{col.type}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Editor & Results Pane */}
        <div className="flex-1 min-w-0 w-full space-y-4">
          {/* SQL Editor Card */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">Query Editor</span>
                <span className="text-slate-400">·</span>
                <span className="text-[11px] text-slate-500">Ctrl / Cmd + Enter to execute</span>
              </div>
              <button
                type="button"
                onClick={() => runQuery(sql)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white transition-colors shadow-2xs cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Run Query
              </button>
            </div>
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  runQuery(sql);
                }
              }}
              spellCheck={false}
              rows={10}
              aria-label="SQL Query Editor"
              className="w-full p-4 font-mono text-xs leading-relaxed text-slate-900 bg-white focus:outline-none resize-y"
            />
          </div>

          {/* Error Banner */}
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <div>
                <div className="font-semibold">Query Error</div>
                <div className="font-mono mt-0.5">{error}</div>
              </div>
            </div>
          )}

          {/* Auto Chart Preview (when 2-column numeric result) */}
          {chartPreviewData && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                  <BarChart3 className="w-4 h-4 text-blue-700" />
                  Automatic Chart Preview ({chartPreviewData.xKey} vs {chartPreviewData.yKey})
                </div>
                <button
                  type="button"
                  onClick={() => setShowChart((v) => !v)}
                  className="text-xs text-blue-700 hover:text-blue-900 font-medium cursor-pointer"
                >
                  {showChart ? 'Hide Chart' : 'Show Chart'}
                </button>
              </div>
              {showChart && (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartPreviewData.data}
                      margin={{ top: 8, right: 16, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                      <XAxis
                        dataKey={chartPreviewData.xKey}
                        tick={{ fontSize: 11, fill: '#475569' }}
                      />
                      <YAxis tick={{ fontSize: 11, fill: '#64748B' }} width={64} />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
                      />
                      <Bar
                        dataKey={chartPreviewData.yKey}
                        fill="#1D4ED8"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={48}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Results Table */}
          {result && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-3 tabular-nums">
                  <span className="font-semibold text-slate-800">
                    {formatNumber(result.rowCount)} rows
                    {result.truncated ? ' (capped at 1,000)' : ''}
                  </span>
                  <span className="inline-flex items-center gap-1 text-slate-500 font-mono text-[11px]">
                    <Clock className="w-3.5 h-3.5" />
                    {result.executionTimeMs.toFixed(2)} ms
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-600">
                      {result.columns.map((col, idx) => (
                        <th
                          key={col}
                          onClick={() => handleSort(idx)}
                          className="text-left px-3 py-2.5 font-mono text-[11px] font-semibold cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap"
                        >
                          <span className="inline-flex items-center gap-1">
                            {col}
                            {sortCol === idx &&
                              (sortDir === 'asc' ? (
                                <ArrowUp className="w-3 h-3 text-blue-700" />
                              ) : (
                                <ArrowDown className="w-3 h-3 text-blue-700" />
                              ))}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px] tabular-nums">
                    {pagedRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={result.columns.length}
                          className="px-4 py-8 text-center text-slate-400 font-sans"
                        >
                          Query executed successfully with 0 rows returned.
                        </td>
                      </tr>
                    ) : (
                      pagedRows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-50/80">
                          {row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              className={`px-3 py-2 whitespace-nowrap ${
                                typeof cell === 'number'
                                  ? 'text-slate-900 font-medium'
                                  : cell === null
                                    ? 'text-slate-400 italic'
                                    : 'text-slate-700'
                              }`}
                            >
                              {cell === null ? 'NULL' : String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              {totalPages > 1 && (
                <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs text-slate-600">
                  <span className="tabular-nums">
                    Page {page + 1} of {totalPages}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={page === 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      className="p-1 rounded border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-50 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      className="p-1 rounded border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-50 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

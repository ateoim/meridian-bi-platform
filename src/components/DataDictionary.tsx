import { Code2, Database, GitBranch, KeyRound, Link2 } from 'lucide-react';
import { KPI_LINEAGE_DEFINITIONS } from '../db/schema';
import type { TableSchemaInfo } from '../db/types';
import { formatNumber } from '../utils/format';

interface DataDictionaryProps {
  schema: TableSchemaInfo[];
  onInspectSql: (sql: string) => void;
}

export function DataDictionary({ schema, onInspectSql }: DataDictionaryProps) {
  const dimensions = schema.filter((t) => t.role === 'dimension');
  const facts = schema.filter((t) => t.role === 'fact');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900">
          Data Dictionary &amp; KPI Lineage
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Live star-schema metadata introspected via SQLite <code className="bg-slate-100 px-1 rounded">PRAGMA table_info</code> and{' '}
          <code className="bg-slate-100 px-1 rounded">PRAGMA foreign_key_list</code>, plus canonical business KPI definitions
        </p>
      </div>

      {/* Star Schema Architecture Overview */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-blue-700" />
              Relational Star Schema Topology
            </h3>
            <p className="text-xs text-slate-500">
              2 core dimension tables joined to 4 operational fact tables with enforced foreign keys
            </p>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
            PRAGMA foreign_keys = ON
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-blue-200/80 bg-blue-50/30 p-4 space-y-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
              Dimension Tables ({dimensions.length})
            </div>
            {dimensions.map((t) => (
              <div
                key={t.name}
                className="bg-white border border-blue-100 rounded-lg p-3 flex items-center justify-between"
              >
                <div>
                  <div className="font-mono text-xs font-semibold text-slate-900">{t.name}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    PK:{' '}
                    <span className="font-mono text-slate-700">
                      {t.columns.find((c) => c.pk)?.name}
                    </span>{' '}
                    · {t.columns.length} columns
                  </div>
                </div>
                <span className="font-mono text-xs font-semibold text-blue-800 tabular-nums">
                  {formatNumber(t.rowCount)} rows
                </span>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-teal-200/80 bg-teal-50/30 p-4 space-y-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-teal-800">
              Fact Tables ({facts.length})
            </div>
            {facts.map((t) => (
              <div
                key={t.name}
                className="bg-white border border-teal-100 rounded-lg p-3 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-mono text-xs font-semibold text-slate-900">{t.name}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                    {t.foreignKeys.length > 0
                      ? `FKs -> ${t.foreignKeys.map((fk) => `${fk.table}.${fk.to}`).join(', ')}`
                      : 'Grain: spend_month × channel'}
                  </div>
                </div>
                <span className="font-mono text-xs font-semibold text-teal-800 tabular-nums shrink-0">
                  {formatNumber(t.rowCount)} rows
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Business KPI Definitions & SQL Lineage */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Canonical Business KPI Definitions &amp; SQL Lineage
          </h3>
          <p className="text-xs text-slate-500">
            Exact SQL formulas used across the Executive Dashboard and Cohort views
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {KPI_LINEAGE_DEFINITIONS.map((kpi) => (
            <div
              key={kpi.id}
              className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col justify-between gap-3"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">{kpi.name}</h4>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Unit: <span className="font-medium text-slate-700">{kpi.unit}</span> ·{' '}
                      {kpi.benchmark}
                    </div>
                  </div>
                  <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                    {kpi.shortName}
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">{kpi.businessDefinition}</p>

                <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto leading-relaxed">
                  {kpi.sqlFormula}
                </pre>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                    Sources:
                  </span>
                  {kpi.sourceTables.map((src) => (
                    <span
                      key={src}
                      className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700"
                    >
                      {src}
                    </span>
                  ))}
                </div>
                {!kpi.sqlFormula.includes(':') && !kpi.sqlFormula.startsWith('--') && (
                  <button
                    type="button"
                    onClick={() => onInspectSql(kpi.sqlFormula)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900 cursor-pointer shrink-0"
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    Run in Workbench
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Complete Table-by-Table Reference */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-700" />
            Table &amp; Column Reference
          </h3>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {schema.map((tbl) => {
            const fkMap = new Map(tbl.foreignKeys.map((fk) => [fk.from, `${fk.table}.${fk.to}`]));
            return (
              <div
                key={tbl.name}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs"
              >
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-900">{tbl.name}</span>
                    <span
                      className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${
                        tbl.role === 'dimension'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-teal-50 text-teal-700 border-teal-200'
                      }`}
                    >
                      {tbl.role}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                    {formatNumber(tbl.rowCount)} rows
                  </span>
                </div>
                <p className="px-4 py-2.5 text-xs text-slate-600 border-b border-slate-100">
                  {tbl.description}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400">
                        <th className="text-left px-4 py-1.5 font-semibold">Column</th>
                        <th className="text-left px-3 py-1.5 font-semibold">Type</th>
                        <th className="text-left px-3 py-1.5 font-semibold">Key / Constraint</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {tbl.columns.map((col) => {
                        const fkTarget = fkMap.get(col.name);
                        return (
                          <tr key={col.name} className="hover:bg-slate-50/70">
                            <td className="px-4 py-1.5 text-slate-800 font-medium">{col.name}</td>
                            <td className="px-3 py-1.5 text-slate-500">{col.type}</td>
                            <td className="px-3 py-1.5">
                              {col.pk ? (
                                <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[10px]">
                                  <KeyRound className="w-2.5 h-2.5" />
                                  PK
                                </span>
                              ) : fkTarget ? (
                                <span className="inline-flex items-center gap-1 text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded text-[10px]">
                                  <Link2 className="w-2.5 h-2.5" />
                                  FK → {fkTarget}
                                </span>
                              ) : col.notnull ? (
                                <span className="text-[10px] text-slate-400">NOT NULL</span>
                              ) : (
                                <span className="text-[10px] text-slate-400">NULLABLE</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

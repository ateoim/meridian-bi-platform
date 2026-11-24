import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { SCHEMA_DDL, TABLE_METADATA } from './schema';
import { seedDatabase } from './seed';
import type { ForeignKeyInfo, QueryResult, TableColumnInfo, TableSchemaInfo } from './types';

export const DEFAULT_MAX_ROWS = 1000;

const FORBIDDEN_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|ATTACH|DETACH|VACUUM|REINDEX|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i;

/**
 * Strips SQL line comments (-- ...) and block comments (/* ... *\/) as well as
 * string literals so keyword validation cannot be bypassed or falsely triggered.
 */
function stripCommentsAndStrings(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?:""|[^"])*"/g, '""');
}

/**
 * Validates that a user-submitted SQL query is strictly read-only and single-statement.
 * Throws an Error with a clear explanation if validation fails.
 */
export function validateReadOnlyQuery(sql: string): void {
  const trimmed = sql.trim();
  if (!trimmed) {
    throw new Error('Query is empty. Enter a SELECT or WITH statement.');
  }

  const sanitized = stripCommentsAndStrings(trimmed).trim();
  if (!sanitized) {
    throw new Error('Query contains only comments. Enter a SELECT or WITH statement.');
  }

  // Disallow multi-statement queries (allow optional trailing semicolon only)
  const withoutTrailingSemicolon = sanitized.replace(/;\s*$/, '');
  if (withoutTrailingSemicolon.includes(';')) {
    throw new Error('Only single-statement read-only queries are permitted.');
  }

  // Must start with SELECT, WITH, or EXPLAIN
  if (!/^(SELECT|WITH|EXPLAIN)\b/i.test(withoutTrailingSemicolon)) {
    throw new Error('Read-only guard: queries must begin with SELECT, WITH, or EXPLAIN.');
  }

  // Block any DDL/DML keywords anywhere in the statement
  const match = withoutTrailingSemicolon.match(FORBIDDEN_KEYWORDS);
  if (match) {
    throw new Error(
      `Read-only guard: keyword "${match[1].toUpperCase()}" is not permitted in the SQL Workbench.`
    );
  }

  // Block PRAGMA statements inside user queries
  if (/\bPRAGMA\b/i.test(withoutTrailingSemicolon)) {
    throw new Error('Read-only guard: PRAGMA statements are not permitted in user queries.');
  }
}

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

async function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
    sqlJsPromise = initSqlJs(
      isBrowser
        ? {
            locateFile: () => './sql-wasm.wasm',
            useOldExtensionFunctions: false,
          }
        : undefined
    );
  }
  return sqlJsPromise;
}

export class MeridianDB {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  static async create(): Promise<MeridianDB> {
    const SQL = await getSqlJs();
    const db = new SQL.Database();
    db.run(SCHEMA_DDL);
    seedDatabase(db);
    return new MeridianDB(db);
  }

  /**
   * Executes a validated read-only SQL query with row limit and execution timing.
   */
  query(
    sql: string,
    params?: (string | number | null)[],
    maxRows: number = DEFAULT_MAX_ROWS
  ): QueryResult {
    validateReadOnlyQuery(sql);

    const start = performance.now();
    const stmt = this.db.prepare(sql);
    try {
      if (params && params.length > 0) {
        stmt.bind(params);
      }

      const columns = stmt.getColumnNames();
      const rows: (string | number | null)[][] = [];
      let truncated = false;

      while (stmt.step()) {
        if (rows.length >= maxRows) {
          truncated = true;
          break;
        }
        const raw = stmt.get();
        rows.push(
          raw.map((v) =>
            v === null || v === undefined
              ? null
              : typeof v === 'number' || typeof v === 'string'
                ? v
                : String(v)
          )
        );
      }

      const executionTimeMs = Math.round((performance.now() - start) * 100) / 100;
      return {
        columns,
        rows,
        rowCount: rows.length,
        truncated,
        executionTimeMs,
      };
    } finally {
      stmt.free();
    }
  }

  /**
   * Convenience helper returning rows as typed objects keyed by column name.
   */
  queryObjects<T extends Record<string, string | number | null>>(
    sql: string,
    params?: (string | number | null)[],
    maxRows: number = DEFAULT_MAX_ROWS
  ): { data: T[]; executionTimeMs: number } {
    const result = this.query(sql, params, maxRows);
    const data = result.rows.map((row) => {
      const obj: Record<string, string | number | null> = {};
      for (let i = 0; i < result.columns.length; i++) {
        obj[result.columns[i]] = row[i];
      }
      return obj as T;
    });
    return { data, executionTimeMs: result.executionTimeMs };
  }

  /**
   * Introspects all user tables via sqlite_master, PRAGMA table_info,
   * PRAGMA foreign_key_list, and live COUNT(*) queries.
   */
  getSchema(): TableSchemaInfo[] {
    const tableStmt = this.db.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    );
    const tableNames: string[] = [];
    try {
      while (tableStmt.step()) {
        tableNames.push(String(tableStmt.get()[0]));
      }
    } finally {
      tableStmt.free();
    }

    const orderedNames = [
      'customers',
      'products',
      'orders',
      'order_items',
      'marketing_spend',
      'support_tickets',
    ].filter((name) => tableNames.includes(name));

    return orderedNames.map((tableName) => {
      const columns: TableColumnInfo[] = [];
      const colStmt = this.db.prepare(`PRAGMA table_info(${tableName})`);
      try {
        while (colStmt.step()) {
          const r = colStmt.get();
          columns.push({
            cid: Number(r[0]),
            name: String(r[1]),
            type: String(r[2]),
            notnull: Number(r[3]) === 1,
            defaultValue: r[4] === null ? null : String(r[4]),
            pk: Number(r[5]) === 1,
          });
        }
      } finally {
        colStmt.free();
      }

      const foreignKeys: ForeignKeyInfo[] = [];
      const fkStmt = this.db.prepare(`PRAGMA foreign_key_list(${tableName})`);
      try {
        while (fkStmt.step()) {
          const r = fkStmt.get();
          foreignKeys.push({
            id: Number(r[0]),
            seq: Number(r[1]),
            table: String(r[2]),
            from: String(r[3]),
            to: String(r[4]),
          });
        }
      } finally {
        fkStmt.free();
      }

      const countRes = this.query(`SELECT COUNT(*) AS cnt FROM ${tableName}`);
      const rowCount = Number(countRes.rows[0]?.[0] ?? 0);
      const meta = TABLE_METADATA[tableName] ?? {
        description: '',
        role: 'fact' as const,
      };

      return {
        name: tableName,
        description: meta.description,
        role: meta.role,
        rowCount,
        columns,
        foreignKeys,
      };
    });
  }

  close(): void {
    this.db.close();
  }
}

let singletonPromise: Promise<MeridianDB> | null = null;

export function getDatabase(): Promise<MeridianDB> {
  if (!singletonPromise) {
    singletonPromise = MeridianDB.create();
  }
  return singletonPromise;
}

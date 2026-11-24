import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MeridianDB, validateReadOnlyQuery } from '../database';
import {
  getAnomalyAlerts,
  getChannelRoi,
  getCohortRetentionMatrix,
  getExecutiveKpis,
  getMonthlyRevenueTrend,
  getRevenueBySegment,
  getRevenueByState,
  SQL_WORKBENCH_TEMPLATES,
} from '../queries';
import { toCsv } from '../../utils/format';

describe('Meridian BI — In-Browser SQLite Engine & Analytical Queries', () => {
  let db: MeridianDB;

  beforeAll(async () => {
    db = await MeridianDB.create();
  });

  afterAll(() => {
    db.close();
  });

  it('seeds all 6 normalized star-schema tables with expected volumes', () => {
    const schema = db.getSchema();
    const counts = Object.fromEntries(schema.map((t) => [t.name, t.rowCount]));

    expect(schema).toHaveLength(6);
    expect(counts.customers).toBe(180);
    expect(counts.products).toBe(8);
    expect(counts.orders).toBeGreaterThanOrEqual(1400);
    expect(counts.order_items).toBeGreaterThanOrEqual(counts.orders);
    expect(counts.marketing_spend).toBe(110); // 22 months x 5 channels
    expect(counts.support_tickets).toBeGreaterThanOrEqual(450);
  });

  it('produces deterministic identical results across independent instances', async () => {
    const secondDb = await MeridianDB.create();
    try {
      const kpiA = getExecutiveKpis(db);
      const kpiB = getExecutiveKpis(secondDb);
      expect(kpiA).toEqual(kpiB);
    } finally {
      secondDb.close();
    }
  });

  it('enforces referential integrity across all foreign key relationships', () => {
    const orphanOrders = db.query(
      `SELECT COUNT(*) FROM orders o LEFT JOIN customers c ON o.customer_id = c.customer_id WHERE c.customer_id IS NULL`
    );
    const orphanItemsOrder = db.query(
      `SELECT COUNT(*) FROM order_items oi LEFT JOIN orders o ON oi.order_id = o.order_id WHERE o.order_id IS NULL`
    );
    const orphanItemsProduct = db.query(
      `SELECT COUNT(*) FROM order_items oi LEFT JOIN products p ON oi.product_id = p.product_id WHERE p.product_id IS NULL`
    );
    const orphanTickets = db.query(
      `SELECT COUNT(*) FROM support_tickets t LEFT JOIN customers c ON t.customer_id = c.customer_id WHERE c.customer_id IS NULL`
    );

    expect(orphanOrders.rows[0][0]).toBe(0);
    expect(orphanItemsOrder.rows[0][0]).toBe(0);
    expect(orphanItemsProduct.rows[0][0]).toBe(0);
    expect(orphanTickets.rows[0][0]).toBe(0);
  });

  it('matches rolled-up order totals to exact sum of order_items', () => {
    const mismatch = db.query(
      `SELECT COUNT(*)
       FROM orders o
       JOIN (
         SELECT order_id, ROUND(SUM(net_revenue_aud), 2) AS sum_net
         FROM order_items
         GROUP BY order_id
       ) oi ON o.order_id = oi.order_id
       WHERE ABS(o.total_net_aud - oi.sum_net) > 0.02`
    );
    expect(mismatch.rows[0][0]).toBe(0);
  });

  it('introspects schema columns, primary keys, and foreign keys via PRAGMA', () => {
    const schema = db.getSchema();
    const ordersTable = schema.find((t) => t.name === 'orders');
    const orderItemsTable = schema.find((t) => t.name === 'order_items');

    expect(ordersTable).toBeDefined();
    expect(ordersTable?.columns.find((c) => c.name === 'order_id')?.pk).toBe(true);
    expect(ordersTable?.foreignKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'customer_id', table: 'customers', to: 'customer_id' }),
      ])
    );

    expect(orderItemsTable?.foreignKeys).toHaveLength(2);
  });

  it('blocks destructive DDL/DML and multi-statement SQL injection via read-only guardrails', () => {
    const blockedQueries = [
      'DROP TABLE customers;',
      'DELETE FROM orders WHERE order_id = 1',
      "INSERT INTO products VALUES (99, 'X', 'Y', 'Add-On', 'All', 10, 0.9)",
      "UPDATE customers SET status = 'churned'",
      'ALTER TABLE customers ADD COLUMN foo TEXT',
      'SELECT * FROM customers; DROP TABLE orders;',
      'PRAGMA writable_schema = ON',
      'ATTACH DATABASE ":memory:" AS evil',
      '   -- only a comment',
    ];

    for (const q of blockedQueries) {
      expect(() => validateReadOnlyQuery(q)).toThrow();
      expect(() => db.query(q)).toThrow();
    }
  });

  it('permits valid SELECT, CTE WITH, comments, and string literals containing keywords', () => {
    const validQueries = [
      'SELECT COUNT(*) FROM customers;',
      `-- leading comment
       WITH t AS (SELECT customer_id FROM customers LIMIT 5)
       SELECT * FROM t;`,
      `SELECT 'DROP TABLE safe_string' AS label, COUNT(*) AS cnt FROM products`,
    ];

    for (const q of validQueries) {
      const res = db.query(q);
      expect(res.rows.length).toBeGreaterThan(0);
      expect(res.executionTimeMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('enforces maxRows truncation guard on large result sets', () => {
    const res = db.query('SELECT * FROM orders', undefined, 25);
    expect(res.rowCount).toBe(25);
    expect(res.truncated).toBe(true);
  });

  it('computes accurate Executive KPIs (MRR, ARR, NRR, Gross Margin, CAC, LTV:CAC)', () => {
    const kpi = getExecutiveKpis(db);

    expect(kpi.latestMonth).toBe('2026-10');
    expect(kpi.previousMonth).toBe('2026-09');
    expect(kpi.mrr).toBeGreaterThan(100_000);
    expect(kpi.arr).toBeCloseTo(kpi.mrr * 12, 1);
    expect(kpi.nrrPct).toBeGreaterThan(70);
    expect(kpi.nrrPct).toBeLessThan(150);
    expect(kpi.grossMarginPct).toBeGreaterThan(75);
    expect(kpi.grossMarginPct).toBeLessThan(92);
    expect(kpi.cac).toBeGreaterThan(500);
    expect(kpi.ltvCacRatio).toBeGreaterThan(1.5);
    expect(kpi.activeCustomers).toBeGreaterThan(100);
  });

  it('computes 22-month revenue trend with LAG() MoM growth and running total', () => {
    const trend = getMonthlyRevenueTrend(db);

    expect(trend).toHaveLength(22);
    expect(trend[0].billingMonth).toBe('2025-01');
    expect(trend[0].momGrowthPct).toBeNull();
    expect(trend[21].billingMonth).toBe('2026-10');
    expect(trend[21].totalRevenue).toBeGreaterThan(trend[0].totalRevenue * 3);
    expect(trend[21].cumulativeRevenue).toBeGreaterThan(trend[21].totalRevenue * 10);

    for (const point of trend) {
      expect(point.newRevenue + point.renewalRevenue + point.expansionRevenue).toBeCloseTo(
        point.totalRevenue,
        0
      );
    }
  });

  it('breaks down latest-month revenue across all 3 commercial segments', () => {
    const segments = getRevenueBySegment(db);
    expect(segments).toHaveLength(3);
    const names = segments.map((s) => s.segment).sort();
    expect(names).toEqual(['Enterprise', 'Mid-Market', 'SMB']);

    const ent = segments.find((s) => s.segment === 'Enterprise')!;
    const smb = segments.find((s) => s.segment === 'SMB')!;
    expect(ent.avgArpa).toBeGreaterThan(smb.avgArpa * 4);
  });

  it('breaks down revenue across all 6 Australian states with shares summing to ~100%', () => {
    const states = getRevenueByState(db);
    expect(states).toHaveLength(6);
    const totalShare = states.reduce((acc, s) => acc + s.sharePct, 0);
    expect(totalShare).toBeGreaterThan(99.5);
    expect(totalShare).toBeLessThan(100.5);
  });

  it('builds quarterly cohort retention matrix with 100% baseline at Q0', () => {
    const cohorts = getCohortRetentionMatrix(db);
    expect(cohorts.length).toBeGreaterThanOrEqual(6);

    for (const row of cohorts) {
      expect(row.cohortSize).toBeGreaterThan(0);
      expect(row.accountRetention[0]).toBe(100);
      expect(row.revenueRetention[0]).toBe(100);
    }
  });

  it('calculates marketing channel ROI and CAC across all 5 channels', () => {
    const channels = getChannelRoi(db);
    expect(channels).toHaveLength(5);

    for (const c of channels) {
      expect(c.totalSpend).toBeGreaterThan(0);
      expect(c.newCustomers).toBeGreaterThan(0);
      expect(c.cac).toBeCloseTo(c.totalSpend / c.newCustomers, 0);
      expect(c.roiMultiple).toBeGreaterThan(0);
    }
  });

  it('detects operational KPI anomalies and threshold alerts via SQL', () => {
    const alerts = getAnomalyAlerts(db);
    expect(alerts.length).toBeGreaterThanOrEqual(3);

    const overdueAlert = alerts.find((a) => a.id === 'overdue-spike');
    expect(overdueAlert).toBeDefined();
    expect(overdueAlert?.severity).toBe('critical');

    for (const alert of alerts) {
      expect(() => validateReadOnlyQuery(alert.sqlReference)).not.toThrow();
      const drilldown = db.query(alert.sqlReference);
      expect(drilldown.rowCount).toBeGreaterThan(0);
    }
  });

  it('executes all 8 SQL Workbench templates cleanly and returns data', () => {
    expect(SQL_WORKBENCH_TEMPLATES).toHaveLength(8);
    for (const tpl of SQL_WORKBENCH_TEMPLATES) {
      const result = db.query(tpl.sql);
      expect(result.columns.length).toBeGreaterThanOrEqual(2);
      expect(result.rowCount).toBeGreaterThan(0);
    }
  });

  it('exports query results to RFC-4180 compliant CSV with proper quoting', () => {
    const csv = toCsv(
      ['company_name', 'state', 'mrr'],
      [
        ['Yarra, Health Systems Pty Ltd', 'VIC', 4200],
        ['"Harbourside" Logistics', 'NSW', null],
      ]
    );
    expect(csv).toBe(
      'company_name,state,mrr\n"Yarra, Health Systems Pty Ltd",VIC,4200\n"""Harbourside"" Logistics",NSW,'
    );
  });
});

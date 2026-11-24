import type { MeridianDB } from './database';
import type {
  AcquisitionChannel,
  AuState,
  ChannelRoiRow,
  CohortQuarterRow,
  CustomerSegment,
  ExecutiveKpiSummary,
  KpiAnomalyAlert,
  MonthlyRevenuePoint,
  SegmentRevenueRow,
  SqlTemplate,
  StateRevenueRow,
} from './types';
import { formatAud, formatPct } from '../utils/format';

export function getExecutiveKpis(db: MeridianDB): ExecutiveKpiSummary {
  const monthsRes = db.query(
    `SELECT DISTINCT billing_month FROM orders ORDER BY billing_month DESC LIMIT 7`
  );
  const months = monthsRes.rows.map((r) => String(r[0]));
  const latestMonth = months[0];
  const previousMonth = months[1] ?? months[0];
  const sixMonthsAgo = months[6] ?? months[months.length - 1];
  const threeMonthStart = months[2] ?? months[months.length - 1];
  const prevThreeMonthEnd = months[3] ?? months[months.length - 1];
  const prevThreeMonthStart = months[5] ?? months[months.length - 1];

  const mrrRow = db.queryObjects<{
    latest_mrr: number;
    prev_mrr: number;
    latest_gp: number;
    prev_gp: number;
    active_customers: number;
    overdue_amount: number;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN billing_month = ? AND status = 'paid' THEN total_net_aud END), 0) AS latest_mrr,
       COALESCE(SUM(CASE WHEN billing_month = ? AND status = 'paid' THEN total_net_aud END), 0) AS prev_mrr,
       COALESCE(SUM(CASE WHEN billing_month = ? AND status = 'paid' THEN total_gross_profit_aud END), 0) AS latest_gp,
       COALESCE(SUM(CASE WHEN billing_month = ? AND status = 'paid' THEN total_gross_profit_aud END), 0) AS prev_gp,
       COUNT(DISTINCT CASE WHEN billing_month = ? AND status IN ('paid', 'overdue') THEN customer_id END) AS active_customers,
       COALESCE(SUM(CASE WHEN billing_month = ? AND status = 'overdue' THEN total_net_aud END), 0) AS overdue_amount
     FROM orders`,
    [latestMonth, previousMonth, latestMonth, previousMonth, latestMonth, latestMonth]
  ).data[0];

  const mrr = Number(mrrRow.latest_mrr);
  const prevMrr = Number(mrrRow.prev_mrr);
  const mrrDeltaPct = prevMrr > 0 ? ((mrr - prevMrr) / prevMrr) * 100 : 0;
  const arr = mrr * 12;

  const grossMarginPct = mrr > 0 ? (Number(mrrRow.latest_gp) / mrr) * 100 : 0;
  const prevGrossMarginPct = prevMrr > 0 ? (Number(mrrRow.prev_gp) / prevMrr) * 100 : 0;

  // 6-month Net Revenue Retention (NRR)
  const nrrRow = db.queryObjects<{ nrr_pct: number }>(
    `WITH base_cohort AS (
       SELECT customer_id, SUM(total_net_aud) AS base_rev
       FROM orders
       WHERE billing_month = ? AND status = 'paid'
       GROUP BY customer_id
     ),
     latest_cohort AS (
       SELECT customer_id, SUM(total_net_aud) AS curr_rev
       FROM orders
       WHERE billing_month = ? AND status = 'paid'
       GROUP BY customer_id
     )
     SELECT ROUND(100.0 * SUM(COALESCE(l.curr_rev, 0)) / NULLIF(SUM(b.base_rev), 0), 1) AS nrr_pct
     FROM base_cohort b
     LEFT JOIN latest_cohort l ON b.customer_id = l.customer_id`,
    [sixMonthsAgo, latestMonth]
  ).data[0];

  const nrrPct = Number(nrrRow?.nrr_pct ?? 100);

  // Trailing 3-month CAC and prior 3-month CAC
  const cacRow = db.queryObjects<{
    curr_spend: number;
    curr_logos: number;
    prev_spend: number;
    prev_logos: number;
    latest_logos: number;
  }>(
    `SELECT
       (SELECT COALESCE(SUM(spend_aud), 0) FROM marketing_spend WHERE spend_month >= ?) AS curr_spend,
       (SELECT COUNT(*) FROM customers WHERE substr(signup_date, 1, 7) >= ?) AS curr_logos,
       (SELECT COALESCE(SUM(spend_aud), 0) FROM marketing_spend WHERE spend_month BETWEEN ? AND ?) AS prev_spend,
       (SELECT COUNT(*) FROM customers WHERE substr(signup_date, 1, 7) BETWEEN ? AND ?) AS prev_logos,
       (SELECT COUNT(*) FROM customers WHERE substr(signup_date, 1, 7) = ?) AS latest_logos`,
    [
      threeMonthStart,
      threeMonthStart,
      prevThreeMonthStart,
      prevThreeMonthEnd,
      prevThreeMonthStart,
      prevThreeMonthEnd,
      latestMonth,
    ]
  ).data[0];

  const cac =
    Number(cacRow.curr_logos) > 0 ? Number(cacRow.curr_spend) / Number(cacRow.curr_logos) : 0;
  const prevCac =
    Number(cacRow.prev_logos) > 0 ? Number(cacRow.prev_spend) / Number(cacRow.prev_logos) : cac;

  // LTV calculation: ARPA * Gross Margin / MAX(monthly logo churn rate, 1/36)
  const churnRow = db.queryObjects<{ churned_total: number; total_customers: number }>(
    `SELECT
       SUM(CASE WHEN status = 'churned' THEN 1 ELSE 0 END) AS churned_total,
       COUNT(*) AS total_customers
     FROM customers`
  ).data[0];

  const activeCustomers = Number(mrrRow.active_customers);
  const arpa = activeCustomers > 0 ? mrr / activeCustomers : 0;
  const monthlyChurnRate = Math.max(
    Number(churnRow.churned_total) / Math.max(1, Number(churnRow.total_customers) * 22),
    1 / 36
  );
  const ltv = (arpa * (grossMarginPct / 100)) / monthlyChurnRate;
  const ltvCacRatio = cac > 0 ? ltv / cac : 0;

  return {
    latestMonth,
    previousMonth,
    mrr: Math.round(mrr * 100) / 100,
    prevMrr: Math.round(prevMrr * 100) / 100,
    mrrDeltaPct: Math.round(mrrDeltaPct * 10) / 10,
    arr: Math.round(arr * 100) / 100,
    nrrPct: Math.round(nrrPct * 10) / 10,
    grossMarginPct: Math.round(grossMarginPct * 10) / 10,
    prevGrossMarginPct: Math.round(prevGrossMarginPct * 10) / 10,
    cac: Math.round(cac * 100) / 100,
    prevCac: Math.round(prevCac * 100) / 100,
    ltv: Math.round(ltv * 100) / 100,
    ltvCacRatio: Math.round(ltvCacRatio * 100) / 100,
    activeCustomers,
    newCustomersLatestMonth: Number(cacRow.latest_logos),
    overdueAmount: Math.round(Number(mrrRow.overdue_amount) * 100) / 100,
  };
}

export function getMonthlyRevenueTrend(db: MeridianDB): MonthlyRevenuePoint[] {
  const { data } = db.queryObjects<{
    billing_month: string;
    new_rev: number;
    renewal_rev: number;
    expansion_rev: number;
    total_rev: number;
    gross_profit: number;
    gross_margin_pct: number;
    mom_growth_pct: number | null;
    cumulative_rev: number;
  }>(
    `WITH monthly AS (
       SELECT
         billing_month,
         ROUND(SUM(CASE WHEN order_type = 'new' THEN total_net_aud ELSE 0 END), 2) AS new_rev,
         ROUND(SUM(CASE WHEN order_type = 'renewal' THEN total_net_aud ELSE 0 END), 2) AS renewal_rev,
         ROUND(SUM(CASE WHEN order_type = 'expansion' THEN total_net_aud ELSE 0 END), 2) AS expansion_rev,
         ROUND(SUM(total_net_aud), 2) AS total_rev,
         ROUND(SUM(total_gross_profit_aud), 2) AS gross_profit
       FROM orders
       WHERE status = 'paid'
       GROUP BY billing_month
     )
     SELECT
       billing_month,
       new_rev,
       renewal_rev,
       expansion_rev,
       total_rev,
       gross_profit,
       ROUND(100.0 * gross_profit / NULLIF(total_rev, 0), 1) AS gross_margin_pct,
       ROUND(
         100.0 * (total_rev - LAG(total_rev) OVER (ORDER BY billing_month)) /
         NULLIF(LAG(total_rev) OVER (ORDER BY billing_month), 0),
         1
       ) AS mom_growth_pct,
       ROUND(SUM(total_rev) OVER (ORDER BY billing_month), 2) AS cumulative_rev
     FROM monthly
     ORDER BY billing_month ASC`
  );

  return data.map((r) => ({
    billingMonth: String(r.billing_month),
    newRevenue: Number(r.new_rev),
    renewalRevenue: Number(r.renewal_rev),
    expansionRevenue: Number(r.expansion_rev),
    totalRevenue: Number(r.total_rev),
    grossProfit: Number(r.gross_profit),
    grossMarginPct: Number(r.gross_margin_pct),
    momGrowthPct: r.mom_growth_pct === null ? null : Number(r.mom_growth_pct),
    cumulativeRevenue: Number(r.cumulative_rev),
  }));
}

export function getRevenueBySegment(db: MeridianDB): SegmentRevenueRow[] {
  const { data } = db.queryObjects<{
    segment: CustomerSegment;
    customers: number;
    revenue: number;
    gross_profit: number;
    gross_margin_pct: number;
    avg_arpa: number;
  }>(
    `SELECT
       c.segment,
       COUNT(DISTINCT o.customer_id) AS customers,
       ROUND(SUM(o.total_net_aud), 2) AS revenue,
       ROUND(SUM(o.total_gross_profit_aud), 2) AS gross_profit,
       ROUND(100.0 * SUM(o.total_gross_profit_aud) / NULLIF(SUM(o.total_net_aud), 0), 1) AS gross_margin_pct,
       ROUND(SUM(o.total_net_aud) / NULLIF(COUNT(DISTINCT o.customer_id), 0), 2) AS avg_arpa
     FROM orders o
     JOIN customers c ON o.customer_id = c.customer_id
     WHERE o.status = 'paid'
       AND o.billing_month = (SELECT MAX(billing_month) FROM orders)
     GROUP BY c.segment
     ORDER BY revenue DESC`
  );

  return data.map((r) => ({
    segment: r.segment,
    customers: Number(r.customers),
    revenue: Number(r.revenue),
    grossProfit: Number(r.gross_profit),
    grossMarginPct: Number(r.gross_margin_pct),
    avgArpa: Number(r.avg_arpa),
  }));
}

export function getRevenueByState(db: MeridianDB): StateRevenueRow[] {
  const { data } = db.queryObjects<{
    state: AuState;
    customers: number;
    revenue: number;
    share_pct: number;
  }>(
    `WITH state_rev AS (
       SELECT
         c.state,
         COUNT(DISTINCT o.customer_id) AS customers,
         ROUND(SUM(o.total_net_aud), 2) AS revenue
       FROM orders o
       JOIN customers c ON o.customer_id = c.customer_id
       WHERE o.status = 'paid'
       GROUP BY c.state
     )
     SELECT
       state,
       customers,
       revenue,
       ROUND(100.0 * revenue / NULLIF(SUM(revenue) OVER (), 0), 1) AS share_pct
     FROM state_rev
     ORDER BY revenue DESC`
  );

  return data.map((r) => ({
    state: r.state,
    customers: Number(r.customers),
    revenue: Number(r.revenue),
    sharePct: Number(r.share_pct),
  }));
}

export function getAnomalyAlerts(db: MeridianDB): KpiAnomalyAlert[] {
  const alerts: KpiAnomalyAlert[] = [];

  // 1. Overdue invoice rate spike vs historical baseline
  const overdueRow = db.queryObjects<{
    latest_month: string;
    latest_overdue_pct: number;
    baseline_overdue_pct: number;
    latest_overdue_aud: number;
    latest_overdue_count: number;
  }>(
    `WITH latest AS (SELECT MAX(billing_month) AS m FROM orders)
     SELECT
       (SELECT m FROM latest) AS latest_month,
       ROUND(100.0 * SUM(CASE WHEN billing_month = (SELECT m FROM latest) AND status = 'overdue' THEN 1 ELSE 0 END) /
         NULLIF(SUM(CASE WHEN billing_month = (SELECT m FROM latest) THEN 1 ELSE 0 END), 0), 1) AS latest_overdue_pct,
       ROUND(100.0 * SUM(CASE WHEN billing_month < (SELECT m FROM latest) AND status = 'overdue' THEN 1 ELSE 0 END) /
         NULLIF(SUM(CASE WHEN billing_month < (SELECT m FROM latest) THEN 1 ELSE 0 END), 0), 1) AS baseline_overdue_pct,
       ROUND(SUM(CASE WHEN billing_month = (SELECT m FROM latest) AND status = 'overdue' THEN total_net_aud ELSE 0 END), 2) AS latest_overdue_aud,
       SUM(CASE WHEN billing_month = (SELECT m FROM latest) AND status = 'overdue' THEN 1 ELSE 0 END) AS latest_overdue_count
     FROM orders`
  ).data[0];

  if (Number(overdueRow.latest_overdue_pct) > Number(overdueRow.baseline_overdue_pct) * 1.5) {
    alerts.push({
      id: 'overdue-spike',
      title: 'Overdue Invoice Rate Spike',
      severity: 'critical',
      metricLabel: 'Overdue Rate',
      currentValue: formatPct(Number(overdueRow.latest_overdue_pct)),
      baselineValue: `${formatPct(Number(overdueRow.baseline_overdue_pct))} avg`,
      detail: `${overdueRow.latest_overdue_count} invoices (${formatAud(Number(overdueRow.latest_overdue_aud))}) remain overdue in ${overdueRow.latest_month}, exceeding the historical baseline by >1.5x.`,
      sqlReference: `SELECT billing_month, status, COUNT(*) AS invoices, ROUND(SUM(total_net_aud), 2) AS total_aud FROM orders WHERE status = 'overdue' GROUP BY billing_month, status ORDER BY billing_month DESC;`,
    });
  }

  // 2. Urgent/High support ticket SLA breach rate in latest month
  const slaRow = db.queryObjects<{
    latest_month: string;
    latest_breach_pct: number;
    baseline_breach_pct: number;
    breached_count: number;
  }>(
    `WITH latest AS (SELECT MAX(created_month) AS m FROM support_tickets)
     SELECT
       (SELECT m FROM latest) AS latest_month,
       ROUND(100.0 * SUM(CASE WHEN created_month = (SELECT m FROM latest) AND priority IN ('urgent', 'high') AND sla_breached = 1 THEN 1 ELSE 0 END) /
         NULLIF(SUM(CASE WHEN created_month = (SELECT m FROM latest) AND priority IN ('urgent', 'high') THEN 1 ELSE 0 END), 0), 1) AS latest_breach_pct,
       ROUND(100.0 * SUM(CASE WHEN created_month < (SELECT m FROM latest) AND priority IN ('urgent', 'high') AND sla_breached = 1 THEN 1 ELSE 0 END) /
         NULLIF(SUM(CASE WHEN created_month < (SELECT m FROM latest) AND priority IN ('urgent', 'high') THEN 1 ELSE 0 END), 0), 1) AS baseline_breach_pct,
       SUM(CASE WHEN created_month = (SELECT m FROM latest) AND priority IN ('urgent', 'high') AND sla_breached = 1 THEN 1 ELSE 0 END) AS breached_count
     FROM support_tickets`
  ).data[0];

  if (Number(slaRow.latest_breach_pct) >= 20) {
    alerts.push({
      id: 'sla-breach-spike',
      title: 'Priority Support SLA Breach Elevation',
      severity: 'warning',
      metricLabel: 'P1/P2 SLA Breach',
      currentValue: formatPct(Number(slaRow.latest_breach_pct)),
      baselineValue: `${formatPct(Number(slaRow.baseline_breach_pct))} avg`,
      detail: `${slaRow.breached_count} urgent/high tickets breached response SLA targets during ${slaRow.latest_month}. Recommend staffing review for Sydney/Melbourne queues.`,
      sqlReference: `SELECT created_month, priority, COUNT(*) AS tickets, SUM(sla_breached) AS breached, ROUND(AVG(csat_score), 2) AS avg_csat FROM support_tickets WHERE priority IN ('urgent', 'high') GROUP BY created_month, priority ORDER BY created_month DESC;`,
    });
  }

  // 3. Enterprise / Mid-Market at-risk ARR exposure
  const riskRow = db.queryObjects<{
    at_risk_accounts: number;
    at_risk_mrr: number;
  }>(
    `SELECT
       COUNT(DISTINCT c.customer_id) AS at_risk_accounts,
       ROUND(COALESCE(SUM(o.total_net_aud), 0), 2) AS at_risk_mrr
     FROM customers c
     JOIN orders o ON c.customer_id = o.customer_id
     WHERE c.status = 'at_risk'
       AND o.billing_month = (SELECT MAX(billing_month) FROM orders)`
  ).data[0];

  if (Number(riskRow.at_risk_accounts) > 0) {
    alerts.push({
      id: 'at-risk-arr',
      title: 'At-Risk Renewal Exposure',
      severity: 'warning',
      metricLabel: 'At-Risk MRR',
      currentValue: formatAud(Number(riskRow.at_risk_mrr), true),
      baselineValue: `${riskRow.at_risk_accounts} accounts`,
      detail: `${riskRow.at_risk_accounts} accounts flagged at_risk represent ${formatAud(Number(riskRow.at_risk_mrr) * 12, true)} in annualised ARR exposure.`,
      sqlReference: `SELECT c.company_name, c.segment, c.state, ROUND(SUM(o.total_net_aud), 2) AS latest_mrr FROM customers c JOIN orders o ON c.customer_id = o.customer_id WHERE c.status = 'at_risk' AND o.billing_month = (SELECT MAX(billing_month) FROM orders) GROUP BY c.customer_id ORDER BY latest_mrr DESC;`,
    });
  }

  // 4. Expansion revenue momentum (positive informational signal)
  const expRow = db.queryObjects<{
    expansion_share_pct: number;
    expansion_aud: number;
  }>(
    `SELECT
       ROUND(100.0 * SUM(CASE WHEN order_type = 'expansion' THEN total_net_aud ELSE 0 END) / NULLIF(SUM(total_net_aud), 0), 1) AS expansion_share_pct,
       ROUND(SUM(CASE WHEN order_type = 'expansion' THEN total_net_aud ELSE 0 END), 2) AS expansion_aud
     FROM orders
     WHERE status = 'paid'
       AND billing_month = (SELECT MAX(billing_month) FROM orders)`
  ).data[0];

  alerts.push({
    id: 'expansion-momentum',
    title: 'Account Expansion Contribution',
    severity: 'info',
    metricLabel: 'Expansion Share',
    currentValue: formatPct(Number(expRow.expansion_share_pct)),
    baselineValue: formatAud(Number(expRow.expansion_aud), true),
    detail: `Add-on modules (Analytics Pack, SSO, Dedicated VPC) and seat upgrades contributed ${formatAud(Number(expRow.expansion_aud))} in paid MRR this month.`,
    sqlReference: `SELECT p.product_name, p.category, COUNT(*) AS line_items, ROUND(SUM(oi.net_revenue_aud), 2) AS total_rev FROM order_items oi JOIN products p ON oi.product_id = p.product_id GROUP BY p.product_id ORDER BY total_rev DESC;`,
  });

  return alerts;
}

export function getCohortRetentionMatrix(db: MeridianDB): CohortQuarterRow[] {
  const { data } = db.queryObjects<{
    signup_quarter: string;
    quarter_offset: number;
    active_accounts: number;
    cohort_revenue: number;
  }>(
    `WITH customer_quarters AS (
       SELECT
         customer_id,
         signup_quarter,
         CAST(substr(signup_quarter, 1, 4) AS INTEGER) * 4 +
         CAST(substr(signup_quarter, 7, 1) AS INTEGER) AS signup_q_idx
       FROM customers
       WHERE signup_quarter <= '2026-Q3'
     ),
     order_quarters AS (
       SELECT
         o.customer_id,
         CAST(substr(o.billing_month, 1, 4) AS INTEGER) * 4 +
         ((CAST(substr(o.billing_month, 6, 2) AS INTEGER) - 1) / 3 + 1) AS order_q_idx,
         SUM(o.total_net_aud) AS q_rev
       FROM orders o
       WHERE o.status = 'paid'
       GROUP BY o.customer_id, order_q_idx
     )
     SELECT
       cq.signup_quarter,
       (oq.order_q_idx - cq.signup_q_idx) AS quarter_offset,
       COUNT(DISTINCT oq.customer_id) AS active_accounts,
       ROUND(SUM(oq.q_rev), 2) AS cohort_revenue
     FROM customer_quarters cq
     JOIN order_quarters oq ON cq.customer_id = oq.customer_id
     WHERE (oq.order_q_idx - cq.signup_q_idx) BETWEEN 0 AND 6
     GROUP BY cq.signup_quarter, quarter_offset
     ORDER BY cq.signup_quarter ASC, quarter_offset ASC`
  );

  const grouped = new Map<
    string,
    {
      cohortSize: number;
      initialRev: number;
      offsets: Map<number, { accounts: number; revenue: number }>;
    }
  >();

  for (const row of data) {
    const q = String(row.signup_quarter);
    const offset = Number(row.quarter_offset);
    if (!grouped.has(q)) {
      grouped.set(q, { cohortSize: 0, initialRev: 0, offsets: new Map() });
    }
    const entry = grouped.get(q)!;
    entry.offsets.set(offset, {
      accounts: Number(row.active_accounts),
      revenue: Number(row.cohort_revenue),
    });
    if (offset === 0) {
      entry.cohortSize = Number(row.active_accounts);
      entry.initialRev = Number(row.cohort_revenue);
    }
  }

  const maxPeriods = 7; // Q0..Q6
  const rows: CohortQuarterRow[] = [];

  for (const [cohortQuarter, info] of grouped.entries()) {
    const accountRetention: (number | null)[] = [];
    const revenueRetention: (number | null)[] = [];

    for (let offset = 0; offset < maxPeriods; offset++) {
      const point = info.offsets.get(offset);
      if (!point || info.cohortSize === 0) {
        accountRetention.push(null);
        revenueRetention.push(null);
      } else {
        accountRetention.push(
          Math.round((point.accounts / info.cohortSize) * 1000) / 10
        );
        revenueRetention.push(
          info.initialRev > 0
            ? Math.round((point.revenue / info.initialRev) * 1000) / 10
            : null
        );
      }
    }

    rows.push({
      cohortQuarter,
      cohortSize: info.cohortSize,
      initialMrr: Math.round((info.initialRev / 3) * 100) / 100,
      accountRetention,
      revenueRetention,
    });
  }

  return rows;
}

export function getChannelRoi(db: MeridianDB): ChannelRoiRow[] {
  const { data } = db.queryObjects<{
    channel: AcquisitionChannel;
    total_spend: number;
    qualified_leads: number;
    new_customers: number;
    cac: number;
    attributed_revenue: number;
    roi_multiple: number;
    lead_to_customer_pct: number;
  }>(
    `WITH spend_by_channel AS (
       SELECT
         channel,
         ROUND(SUM(spend_aud), 2) AS total_spend,
         SUM(qualified_leads) AS qualified_leads
       FROM marketing_spend
       GROUP BY channel
     ),
     rev_by_channel AS (
       SELECT
         c.acquisition_channel AS channel,
         COUNT(DISTINCT c.customer_id) AS new_customers,
         ROUND(COALESCE(SUM(CASE WHEN o.status = 'paid' THEN o.total_net_aud ELSE 0 END), 0), 2) AS attributed_revenue
       FROM customers c
       LEFT JOIN orders o ON c.customer_id = o.customer_id
       GROUP BY c.acquisition_channel
     )
     SELECT
       s.channel,
       s.total_spend,
       s.qualified_leads,
       COALESCE(r.new_customers, 0) AS new_customers,
       ROUND(s.total_spend / NULLIF(r.new_customers, 0), 2) AS cac,
       COALESCE(r.attributed_revenue, 0) AS attributed_revenue,
       ROUND(COALESCE(r.attributed_revenue, 0) / NULLIF(s.total_spend, 0), 2) AS roi_multiple,
       ROUND(100.0 * COALESCE(r.new_customers, 0) / NULLIF(s.qualified_leads, 0), 2) AS lead_to_customer_pct
     FROM spend_by_channel s
     LEFT JOIN rev_by_channel r ON s.channel = r.channel
     ORDER BY roi_multiple DESC`
  );

  return data.map((r) => ({
    channel: r.channel,
    totalSpend: Number(r.total_spend),
    qualifiedLeads: Number(r.qualified_leads),
    newCustomers: Number(r.new_customers),
    cac: Number(r.cac),
    attributedRevenue: Number(r.attributed_revenue),
    roiMultiple: Number(r.roi_multiple),
    leadToCustomerPct: Number(r.lead_to_customer_pct),
  }));
}

export const SQL_WORKBENCH_TEMPLATES: SqlTemplate[] = [
  {
    id: 'mrr-mom-window',
    name: 'MRR & MoM Growth (LAG + Running Total)',
    category: 'Revenue',
    description: 'Uses CTEs, LAG(), and SUM() OVER window functions to compute monthly revenue growth and cumulative recognised revenue.',
    sql: `WITH monthly_mrr AS (
  SELECT
    billing_month,
    ROUND(SUM(total_net_aud), 2) AS mrr_aud,
    COUNT(DISTINCT customer_id) AS paying_accounts
  FROM orders
  WHERE status = 'paid'
  GROUP BY billing_month
)
SELECT
  billing_month,
  mrr_aud,
  paying_accounts,
  ROUND(
    100.0 * (mrr_aud - LAG(mrr_aud) OVER (ORDER BY billing_month)) /
    NULLIF(LAG(mrr_aud) OVER (ORDER BY billing_month), 0),
    1
  ) AS mom_growth_pct,
  ROUND(SUM(mrr_aud) OVER (ORDER BY billing_month), 2) AS cumulative_rev_aud
FROM monthly_mrr
ORDER BY billing_month DESC;`,
  },
  {
    id: 'au-state-revenue',
    name: 'Revenue by AU State (Chart Ready)',
    category: 'Revenue',
    description: '2-column aggregation ideal for automatic chart preview in the Workbench.',
    sql: `SELECT
  c.state,
  ROUND(SUM(o.total_net_aud), 2) AS total_revenue_aud
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
WHERE o.status = 'paid'
GROUP BY c.state
ORDER BY total_revenue_aud DESC;`,
  },
  {
    id: 'cohort-retention-sql',
    name: 'Quarterly Cohort Retention SQL',
    category: 'Retention',
    description: 'Computes active retained accounts by signup quarter and quarter offset.',
    sql: `WITH cohorts AS (
  SELECT
    customer_id,
    signup_quarter,
    CAST(substr(signup_quarter, 1, 4) AS INTEGER) * 4 +
    CAST(substr(signup_quarter, 7, 1) AS INTEGER) AS sq_idx
  FROM customers
),
activity AS (
  SELECT
    o.customer_id,
    CAST(substr(o.billing_month, 1, 4) AS INTEGER) * 4 +
    ((CAST(substr(o.billing_month, 6, 2) AS INTEGER) - 1) / 3 + 1) AS oq_idx,
    SUM(o.total_net_aud) AS rev_aud
  FROM orders o
  WHERE o.status = 'paid'
  GROUP BY o.customer_id, oq_idx
)
SELECT
  c.signup_quarter,
  (a.oq_idx - c.sq_idx) AS quarters_since_signup,
  COUNT(DISTINCT a.customer_id) AS retained_accounts,
  ROUND(SUM(a.rev_aud), 2) AS quarterly_rev_aud
FROM cohorts c
JOIN activity a ON c.customer_id = a.customer_id
WHERE (a.oq_idx - c.sq_idx) >= 0
GROUP BY c.signup_quarter, quarters_since_signup
ORDER BY c.signup_quarter, quarters_since_signup;`,
  },
  {
    id: 'churn-risk-radar',
    name: 'Account Churn Risk Score',
    category: 'Retention',
    description: 'Joins customers, overdue invoices, and recent SLA-breached support tickets to rank accounts needing CSM outreach.',
    sql: `WITH overdue_stats AS (
  SELECT
    customer_id,
    COUNT(*) AS overdue_invoices,
    ROUND(SUM(total_net_aud), 2) AS overdue_aud
  FROM orders
  WHERE status = 'overdue'
  GROUP BY customer_id
),
ticket_stats AS (
  SELECT
    customer_id,
    COUNT(*) AS total_tickets,
    SUM(sla_breached) AS sla_breaches,
    ROUND(AVG(csat_score), 2) AS avg_csat
  FROM support_tickets
  GROUP BY customer_id
)
SELECT
  c.company_name,
  c.segment,
  c.state,
  c.status,
  COALESCE(o.overdue_invoices, 0) AS overdue_invoices,
  COALESCE(o.overdue_aud, 0) AS overdue_aud,
  COALESCE(t.sla_breaches, 0) AS sla_breaches,
  COALESCE(t.avg_csat, 5.0) AS avg_csat
FROM customers c
LEFT JOIN overdue_stats o ON c.customer_id = o.customer_id
LEFT JOIN ticket_stats t ON c.customer_id = t.customer_id
WHERE c.status != 'churned'
  AND (COALESCE(o.overdue_invoices, 0) > 0 OR COALESCE(t.sla_breaches, 0) >= 2 OR c.status = 'at_risk')
ORDER BY overdue_aud DESC, sla_breaches DESC
LIMIT 25;`,
  },
  {
    id: 'channel-cac-roi',
    name: 'Marketing Channel CAC & ROI',
    category: 'Unit Economics',
    description: 'Compares total channel spend, qualified leads, new customers, CAC, and attributed revenue.',
    sql: `WITH spend AS (
  SELECT channel, ROUND(SUM(spend_aud), 2) AS spend_aud, SUM(qualified_leads) AS leads
  FROM marketing_spend
  GROUP BY channel
),
rev AS (
  SELECT
    c.acquisition_channel AS channel,
    COUNT(DISTINCT c.customer_id) AS customers,
    ROUND(SUM(CASE WHEN o.status = 'paid' THEN o.total_net_aud ELSE 0 END), 2) AS rev_aud
  FROM customers c
  LEFT JOIN orders o ON c.customer_id = o.customer_id
  GROUP BY c.acquisition_channel
)
SELECT
  s.channel,
  s.spend_aud,
  r.customers,
  ROUND(s.spend_aud / NULLIF(r.customers, 0), 2) AS cac_aud,
  r.rev_aud,
  ROUND(r.rev_aud / NULLIF(s.spend_aud, 0), 2) AS roi_multiple
FROM spend s
JOIN rev r ON s.channel = r.channel
ORDER BY roi_multiple DESC;`,
  },
  {
    id: 'product-margin-mix',
    name: 'Product Revenue & Gross Margin Mix',
    category: 'Unit Economics',
    description: 'Breaks down net revenue, discount rate, and gross profit across subscriptions and add-ons.',
    sql: `SELECT
  p.product_name,
  p.category,
  SUM(oi.quantity) AS units_billed,
  ROUND(AVG(oi.discount_pct) * 100, 1) AS avg_discount_pct,
  ROUND(SUM(oi.net_revenue_aud), 2) AS net_revenue_aud,
  ROUND(SUM(oi.gross_profit_aud), 2) AS gross_profit_aud,
  ROUND(100.0 * SUM(oi.gross_profit_aud) / NULLIF(SUM(oi.net_revenue_aud), 0), 1) AS margin_pct
FROM order_items oi
JOIN orders o ON oi.order_id = o.order_id
JOIN products p ON oi.product_id = p.product_id
WHERE o.status = 'paid'
GROUP BY p.product_id
ORDER BY net_revenue_aud DESC;`,
  },
  {
    id: 'top-enterprise-accounts',
    name: 'Top 15 Accounts by Lifetime Revenue',
    category: 'Revenue',
    description: 'Ranks highest-value B2B customers using RANK() OVER window function.',
    sql: `SELECT
  RANK() OVER (ORDER BY SUM(o.total_net_aud) DESC) AS rev_rank,
  c.company_name,
  c.segment,
  c.state,
  c.industry,
  COUNT(o.order_id) AS paid_invoices,
  ROUND(SUM(o.total_net_aud), 2) AS lifetime_rev_aud
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id
WHERE o.status = 'paid'
GROUP BY c.customer_id
ORDER BY lifetime_rev_aud DESC
LIMIT 15;`,
  },
  {
    id: 'support-sla-by-segment',
    name: 'Support SLA & CSAT by Segment',
    category: 'Operations',
    description: 'Evaluates ticket volume, average resolution hours, SLA breach rate, and CSAT per commercial segment.',
    sql: `SELECT
  c.segment,
  COUNT(t.ticket_id) AS tickets,
  ROUND(AVG(t.resolution_hours), 1) AS avg_resolution_hrs,
  ROUND(100.0 * SUM(t.sla_breached) / NULLIF(COUNT(t.ticket_id), 0), 1) AS sla_breach_pct,
  ROUND(AVG(t.csat_score), 2) AS avg_csat
FROM support_tickets t
JOIN customers c ON t.customer_id = c.customer_id
GROUP BY c.segment
ORDER BY tickets DESC;`,
  },
];

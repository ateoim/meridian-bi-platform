import type { KpiLineageDefinition } from './types';

export const SCHEMA_DDL = `
PRAGMA foreign_keys = ON;

CREATE TABLE customers (
  customer_id INTEGER PRIMARY KEY,
  company_name TEXT NOT NULL,
  segment TEXT NOT NULL CHECK (segment IN ('Enterprise', 'Mid-Market', 'SMB')),
  state TEXT NOT NULL CHECK (state IN ('VIC', 'NSW', 'QLD', 'WA', 'SA', 'ACT')),
  industry TEXT NOT NULL,
  acquisition_channel TEXT NOT NULL CHECK (
    acquisition_channel IN ('Organic Search', 'Paid Search', 'LinkedIn B2B', 'Partner Referral', 'Events')
  ),
  signup_date TEXT NOT NULL,
  signup_quarter TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'churned', 'at_risk')),
  churn_date TEXT
);

CREATE TABLE products (
  product_id INTEGER PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Subscription', 'Add-On', 'Support')),
  tier TEXT NOT NULL,
  unit_price_aud REAL NOT NULL,
  gross_margin_pct REAL NOT NULL
);

CREATE TABLE orders (
  order_id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(customer_id),
  invoice_number TEXT NOT NULL UNIQUE,
  order_date TEXT NOT NULL,
  billing_month TEXT NOT NULL,
  order_type TEXT NOT NULL CHECK (order_type IN ('new', 'renewal', 'expansion')),
  status TEXT NOT NULL CHECK (status IN ('paid', 'refunded', 'overdue')),
  total_net_aud REAL NOT NULL,
  total_gross_profit_aud REAL NOT NULL
);

CREATE TABLE order_items (
  order_item_id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(order_id),
  product_id INTEGER NOT NULL REFERENCES products(product_id),
  quantity INTEGER NOT NULL,
  unit_price_aud REAL NOT NULL,
  discount_pct REAL NOT NULL,
  net_revenue_aud REAL NOT NULL,
  gross_profit_aud REAL NOT NULL
);

CREATE TABLE marketing_spend (
  spend_id INTEGER PRIMARY KEY,
  spend_month TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (
    channel IN ('Organic Search', 'Paid Search', 'LinkedIn B2B', 'Partner Referral', 'Events')
  ),
  spend_aud REAL NOT NULL,
  impressions INTEGER NOT NULL,
  clicks INTEGER NOT NULL,
  qualified_leads INTEGER NOT NULL
);

CREATE TABLE support_tickets (
  ticket_id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(customer_id),
  created_at TEXT NOT NULL,
  created_month TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  category TEXT NOT NULL,
  resolution_hours REAL NOT NULL,
  sla_breached INTEGER NOT NULL CHECK (sla_breached IN (0, 1)),
  csat_score INTEGER NOT NULL CHECK (csat_score BETWEEN 1 AND 5)
);

CREATE INDEX idx_customers_segment_state ON customers(segment, state);
CREATE INDEX idx_customers_signup_quarter ON customers(signup_quarter);
CREATE INDEX idx_orders_billing_month ON orders(billing_month);
CREATE INDEX idx_orders_customer_month ON orders(customer_id, billing_month);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);
CREATE INDEX idx_marketing_month_channel ON marketing_spend(spend_month, channel);
CREATE INDEX idx_support_customer_month ON support_tickets(customer_id, created_month);
`;

export const TABLE_METADATA: Record<
  string,
  { description: string; role: 'dimension' | 'fact' }
> = {
  customers: {
    description:
      'B2B SaaS account dimension covering 180 Australian organisations across six states, three commercial segments, acquisition channels, and lifecycle status.',
    role: 'dimension',
  },
  products: {
    description:
      'SaaS subscription plans, enterprise add-on modules, and support packages with AUD list pricing and direct gross margin rates.',
    role: 'dimension',
  },
  orders: {
    description:
      'Monthly recurring subscription, renewal, and expansion invoices with payment lifecycle status (paid, refunded, overdue) and rolled-up net revenue.',
    role: 'fact',
  },
  order_items: {
    description:
      'Invoice line items linking orders to products with seat/unit quantities, commercial discount percentages, net revenue, and gross profit.',
    role: 'fact',
  },
  marketing_spend: {
    description:
      'Monthly demand-generation expenditure and funnel volume (impressions, clicks, qualified leads) across five B2B acquisition channels.',
    role: 'fact',
  },
  support_tickets: {
    description:
      'Customer support interactions tracking ticket priority, issue category, time-to-resolution, SLA breach flags, and post-resolution CSAT.',
    role: 'fact',
  },
};

export const KPI_LINEAGE_DEFINITIONS: KpiLineageDefinition[] = [
  {
    id: 'mrr',
    name: 'Monthly Recurring Revenue (MRR)',
    shortName: 'MRR',
    unit: 'AUD / month',
    businessDefinition:
      'Total recognised net recurring revenue from paid invoices in the latest completed billing month, including new logos, renewals, and seat/module expansions.',
    sourceTables: ['orders'],
    sqlFormula: `SELECT SUM(total_net_aud) AS mrr
FROM orders
WHERE billing_month = (SELECT MAX(billing_month) FROM orders)
  AND status = 'paid';`,
    benchmark: 'Target: +4–8% MoM growth',
  },
  {
    id: 'arr',
    name: 'Annual Recurring Revenue (ARR)',
    shortName: 'ARR',
    unit: 'AUD / year',
    businessDefinition:
      'Annualised run-rate recurring revenue computed as latest-month paid MRR multiplied by 12.',
    sourceTables: ['orders'],
    sqlFormula: `SELECT SUM(total_net_aud) * 12.0 AS arr
FROM orders
WHERE billing_month = (SELECT MAX(billing_month) FROM orders)
  AND status = 'paid';`,
    benchmark: 'Run-rate scale metric',
  },
  {
    id: 'nrr',
    name: 'Net Revenue Retention (NRR)',
    shortName: 'NRR',
    unit: 'Percentage (%)',
    businessDefinition:
      'Percentage of recurring revenue retained from an existing cohort of customers over a 6-month trailing window, capturing both expansion upsells and churn/contraction.',
    sourceTables: ['orders'],
    sqlFormula: `WITH base AS (
  SELECT customer_id, SUM(total_net_aud) AS base_rev
  FROM orders
  WHERE billing_month = :base_month AND status = 'paid'
  GROUP BY customer_id
),
curr AS (
  SELECT customer_id, SUM(total_net_aud) AS curr_rev
  FROM orders
  WHERE billing_month = :latest_month AND status = 'paid'
  GROUP BY customer_id
)
SELECT ROUND(100.0 * SUM(COALESCE(c.curr_rev, 0)) / SUM(b.base_rev), 1) AS nrr_pct
FROM base b
LEFT JOIN curr c ON b.customer_id = c.customer_id;`,
    benchmark: 'Best-in-class B2B SaaS: > 110%',
  },
  {
    id: 'gross_margin',
    name: 'Gross Margin %',
    shortName: 'GM%',
    unit: 'Percentage (%)',
    businessDefinition:
      'Share of paid recurring revenue remaining after direct cloud hosting, infrastructure, and support delivery costs across line items.',
    sourceTables: ['orders', 'order_items', 'products'],
    sqlFormula: `SELECT ROUND(100.0 * SUM(total_gross_profit_aud) / NULLIF(SUM(total_net_aud), 0), 1) AS gross_margin_pct
FROM orders
WHERE billing_month = (SELECT MAX(billing_month) FROM orders)
  AND status = 'paid';`,
    benchmark: 'SaaS target: 78–85%',
  },
  {
    id: 'cac',
    name: 'Customer Acquisition Cost (CAC)',
    shortName: 'CAC',
    unit: 'AUD / customer',
    businessDefinition:
      'Trailing 3-month marketing expenditure divided by the number of net new logos acquired during the same 3-month window.',
    sourceTables: ['marketing_spend', 'customers'],
    sqlFormula: `SELECT ROUND(
  (SELECT SUM(spend_aud) FROM marketing_spend WHERE spend_month >= :window_start) /
  NULLIF((SELECT COUNT(*) FROM customers WHERE substr(signup_date, 1, 7) >= :window_start), 0),
  2
) AS cac_aud;`,
    benchmark: 'Payback < 12 months',
  },
  {
    id: 'ltv_cac',
    name: 'LTV : CAC Ratio',
    shortName: 'LTV:CAC',
    unit: 'Multiple (x)',
    businessDefinition:
      'Estimated customer lifetime gross profit (ARPA × Gross Margin % ÷ monthly logo churn rate, bounded by a 36-month conservative horizon) divided by trailing CAC.',
    sourceTables: ['orders', 'customers', 'marketing_spend'],
    sqlFormula: `-- LTV = (ARPA * GrossMargin%) / MAX(monthly_churn_rate, 1.0/36.0)
-- LTV:CAC = LTV / CAC`,
    benchmark: 'Healthy B2B SaaS: >= 3.0x',
  },
];

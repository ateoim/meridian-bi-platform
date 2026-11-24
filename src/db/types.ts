export type AuState = 'VIC' | 'NSW' | 'QLD' | 'WA' | 'SA' | 'ACT';
export type CustomerSegment = 'Enterprise' | 'Mid-Market' | 'SMB';
export type AcquisitionChannel =
  | 'Organic Search'
  | 'Paid Search'
  | 'LinkedIn B2B'
  | 'Partner Referral'
  | 'Events';

export interface QueryResult {
  columns: string[];
  rows: (string | number | null)[][];
  rowCount: number;
  truncated: boolean;
  executionTimeMs: number;
}

export interface TableColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: boolean;
  defaultValue: string | null;
  pk: boolean;
}

export interface ForeignKeyInfo {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
}

export interface TableSchemaInfo {
  name: string;
  description: string;
  role: 'dimension' | 'fact';
  rowCount: number;
  columns: TableColumnInfo[];
  foreignKeys: ForeignKeyInfo[];
}

export interface ExecutiveKpiSummary {
  latestMonth: string;
  previousMonth: string;
  mrr: number;
  prevMrr: number;
  mrrDeltaPct: number;
  arr: number;
  nrrPct: number;
  grossMarginPct: number;
  prevGrossMarginPct: number;
  cac: number;
  prevCac: number;
  ltv: number;
  ltvCacRatio: number;
  activeCustomers: number;
  newCustomersLatestMonth: number;
  overdueAmount: number;
}

export interface MonthlyRevenuePoint {
  billingMonth: string;
  newRevenue: number;
  renewalRevenue: number;
  expansionRevenue: number;
  totalRevenue: number;
  grossProfit: number;
  grossMarginPct: number;
  momGrowthPct: number | null;
  cumulativeRevenue: number;
}

export interface SegmentRevenueRow {
  segment: CustomerSegment;
  customers: number;
  revenue: number;
  grossProfit: number;
  grossMarginPct: number;
  avgArpa: number;
}

export interface StateRevenueRow {
  state: AuState;
  customers: number;
  revenue: number;
  sharePct: number;
}

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface KpiAnomalyAlert {
  id: string;
  title: string;
  severity: AlertSeverity;
  metricLabel: string;
  currentValue: string;
  baselineValue: string;
  detail: string;
  sqlReference: string;
}

export interface CohortQuarterRow {
  cohortQuarter: string;
  cohortSize: number;
  initialMrr: number;
  /** Retention percentages indexed by quarter offset 0..N */
  accountRetention: (number | null)[];
  revenueRetention: (number | null)[];
}

export interface ChannelRoiRow {
  channel: AcquisitionChannel;
  totalSpend: number;
  qualifiedLeads: number;
  newCustomers: number;
  cac: number;
  attributedRevenue: number;
  roiMultiple: number;
  leadToCustomerPct: number;
}

export interface SqlTemplate {
  id: string;
  name: string;
  category: 'Revenue' | 'Retention' | 'Unit Economics' | 'Operations';
  description: string;
  sql: string;
}

export interface KpiLineageDefinition {
  id: string;
  name: string;
  shortName: string;
  unit: string;
  businessDefinition: string;
  sourceTables: string[];
  sqlFormula: string;
  benchmark: string;
}

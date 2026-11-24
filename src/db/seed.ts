import type { Database } from 'sql.js';
import type { AcquisitionChannel, AuState, CustomerSegment } from './types';

/**
 * Deterministic 32-bit PRNG (Mulberry32) so every run produces identical
 * analytical datasets, charts, and test assertions.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(rng: () => number, items: readonly [T, number][]): T {
  const total = items.reduce((acc, [, w]) => acc + w, 0);
  let r = rng() * total;
  for (const [value, weight] of items) {
    r -= weight;
    if (r <= 0) return value;
  }
  return items[items.length - 1][0];
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function quarterFromMonth(ym: string): string {
  const [y, mStr] = ym.split('-');
  const q = Math.floor((Number(mStr) - 1) / 3) + 1;
  return `${y}-Q${q}`;
}

const MONTHS: string[] = [
  '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06',
  '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
  '2026-07', '2026-08', '2026-09', '2026-10',
];

const COMPANY_PREFIXES = [
  'Southern Cross', 'Yarra', 'Harbourside', 'Bayside', 'Outback', 'Tasman',
  'Pacific', 'Kangaroo', 'Blue Gum', 'Redback', 'Silverleaf', 'Ironbark',
  'Banksia', 'Wattle', 'Coral Sea', 'Flinders', 'Barossa', 'Fremantle',
  'Brisbane', 'Canberra', 'Melbourne', 'Sydney', 'Adelaide', 'Perth',
  'Kestrel', 'Meridian', 'Apex', 'Clearwater', 'Northstar', 'Vanguard',
  'Bridgewater', 'Crestview', 'Summit', 'Solstice', 'Horizon', 'Vertex',
];

const COMPANY_SUFFIXES = [
  'Logistics', 'Health Systems', 'Financial Group', 'Energy', 'Retail Co',
  'Cloudworks', 'Supply Chain', 'Mining Tech', 'AgriData', 'BioLabs',
  'Property Group', 'Payments', 'Advisory', 'Manufacturing', 'Telecom',
  'Freight', 'Commerce', 'Software', 'Infrastructure', 'Analytics',
];

const INDUSTRIES = [
  'FinTech & Payments',
  'Healthcare & MedTech',
  'Logistics & Supply Chain',
  'Retail & eCommerce',
  'Energy & Utilities',
  'Professional Services',
  'Mining & Resources',
  'Construction & PropTech',
];

const STATE_WEIGHTS: readonly [AuState, number][] = [
  ['NSW', 33],
  ['VIC', 29],
  ['QLD', 17],
  ['WA', 10],
  ['SA', 6],
  ['ACT', 5],
];

const SEGMENT_WEIGHTS: readonly [CustomerSegment, number][] = [
  ['Enterprise', 18],
  ['Mid-Market', 34],
  ['SMB', 48],
];

const CHANNEL_WEIGHTS: readonly [AcquisitionChannel, number][] = [
  ['Organic Search', 28],
  ['Paid Search', 22],
  ['LinkedIn B2B', 24],
  ['Partner Referral', 16],
  ['Events', 10],
];

interface SeedProduct {
  id: number;
  sku: string;
  name: string;
  category: 'Subscription' | 'Add-On' | 'Support';
  tier: string;
  price: number;
  margin: number;
}

const PRODUCTS: SeedProduct[] = [
  { id: 1, sku: 'SUB-STR', name: 'Meridian Starter', category: 'Subscription', tier: 'SMB', price: 320, margin: 0.85 },
  { id: 2, sku: 'SUB-GRW', name: 'Meridian Growth', category: 'Subscription', tier: 'Mid-Market', price: 980, margin: 0.84 },
  { id: 3, sku: 'SUB-BIZ', name: 'Meridian Business', category: 'Subscription', tier: 'Mid-Market', price: 1850, margin: 0.83 },
  { id: 4, sku: 'SUB-ENT', name: 'Meridian Enterprise Core', category: 'Subscription', tier: 'Enterprise', price: 4200, margin: 0.81 },
  { id: 5, sku: 'ADD-ANL', name: 'Embedded Analytics Pack', category: 'Add-On', tier: 'All', price: 450, margin: 0.88 },
  { id: 6, sku: 'ADD-SSO', name: 'SSO & Audit Compliance', category: 'Add-On', tier: 'Mid-Market+', price: 380, margin: 0.90 },
  { id: 7, sku: 'ADD-VPC', name: 'AU Dedicated VPC (Sydney)', category: 'Add-On', tier: 'Enterprise', price: 1400, margin: 0.72 },
  { id: 8, sku: 'SUP-PRI', name: '24/7 Priority SLA Support', category: 'Support', tier: 'Enterprise', price: 650, margin: 0.68 },
];

const TICKET_CATEGORIES = [
  'Billing',
  'API & Integrations',
  'Data Sync',
  'Permissions',
  'Performance',
];

export const SEED_CONSTANT = 20260419;

export function seedDatabase(db: Database): void {
  const rng = mulberry32(SEED_CONSTANT);

  db.run('BEGIN TRANSACTION;');
  try {
    // 1. Seed products
    const insertProduct = db.prepare(
      `INSERT INTO products (product_id, sku, product_name, category, tier, unit_price_aud, gross_margin_pct)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const p of PRODUCTS) {
      insertProduct.run([p.id, p.sku, p.name, p.category, p.tier, p.price, p.margin]);
    }
    insertProduct.free();

    // 2. Seed 180 Australian B2B customers with realistic growth curve across 2025-01..2026-10
    const insertCustomer = db.prepare(
      `INSERT INTO customers (
        customer_id, company_name, segment, state, industry,
        acquisition_channel, signup_date, signup_quarter, status, churn_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    // Weighted month distribution: steady growth with Q2/Q4 AU EOFY/calendar bumps
    const monthWeights: [number, number][] = MONTHS.map((_, idx) => {
      const base = 5 + idx * 0.45;
      const eofyBoost = idx === 5 || idx === 17 ? 2.5 : 0; // June AU EOFY
      return [idx, base + eofyBoost];
    });

    interface CustomerRecord {
      id: number;
      segment: CustomerSegment;
      state: AuState;
      channel: AcquisitionChannel;
      signupMonthIdx: number;
      churnMonthIdx: number | null;
      status: 'active' | 'churned' | 'at_risk';
      baseProductId: number;
    }

    const customers: CustomerRecord[] = [];
    const usedNames = new Set<string>();

    for (let id = 1; id <= 180; id++) {
      let companyName = '';
      for (let attempt = 0; attempt < 20; attempt++) {
        const prefix = COMPANY_PREFIXES[Math.floor(rng() * COMPANY_PREFIXES.length)];
        const suffix = COMPANY_SUFFIXES[Math.floor(rng() * COMPANY_SUFFIXES.length)];
        const candidate = `${prefix} ${suffix} Pty Ltd`;
        if (!usedNames.has(candidate)) {
          usedNames.add(candidate);
          companyName = candidate;
          break;
        }
      }
      if (!companyName) {
        companyName = `Meridian Partner #${id} Pty Ltd`;
      }

      const segment = pickWeighted(rng, SEGMENT_WEIGHTS);
      const state = pickWeighted(rng, STATE_WEIGHTS);
      const industry = INDUSTRIES[Math.floor(rng() * INDUSTRIES.length)];

      // Enterprise skews toward LinkedIn B2B, Partner Referral, Events; SMB toward Organic/Paid
      const channel: AcquisitionChannel =
        segment === 'Enterprise'
          ? pickWeighted(rng, [
              ['LinkedIn B2B', 34],
              ['Partner Referral', 28],
              ['Events', 22],
              ['Organic Search', 10],
              ['Paid Search', 6],
            ])
          : pickWeighted(rng, CHANNEL_WEIGHTS);

      // Ensure first 16 customers join in 2025-01 so initial baseline cohorts are well-populated
      const signupMonthIdx =
        id <= 16 ? 0 : pickWeighted(rng, monthWeights);
      const signupMonth = MONTHS[signupMonthIdx];
      const day = Math.floor(rng() * 25) + 1;
      const signupDate = `${signupMonth}-${pad2(day)}`;
      const signupQuarter = quarterFromMonth(signupMonth);

      // Realistic churn: SMB ~2.4%/mo, Mid-Market ~1.2%/mo, Enterprise ~0.5%/mo
      const monthlyChurnProb =
        segment === 'Enterprise' ? 0.006 : segment === 'Mid-Market' ? 0.013 : 0.025;

      let churnMonthIdx: number | null = null;
      // Only eligible to churn after at least 3 months
      for (let m = signupMonthIdx + 3; m < MONTHS.length; m++) {
        if (rng() < monthlyChurnProb) {
          churnMonthIdx = m;
          break;
        }
      }

      let status: 'active' | 'churned' | 'at_risk' = 'active';
      let churnDate: string | null = null;
      if (churnMonthIdx !== null) {
        status = 'churned';
        churnDate = `${MONTHS[churnMonthIdx]}-${pad2(Math.floor(rng() * 20) + 5)}`;
      } else if (signupMonthIdx <= 16 && rng() < 0.085) {
        status = 'at_risk';
      }

      const baseProductId =
        segment === 'Enterprise'
          ? 4
          : segment === 'Mid-Market'
            ? rng() < 0.55
              ? 2
              : 3
            : 1;

      insertCustomer.run([
        id,
        companyName,
        segment,
        state,
        industry,
        channel,
        signupDate,
        signupQuarter,
        status,
        churnDate,
      ]);

      customers.push({
        id,
        segment,
        state,
        channel,
        signupMonthIdx,
        churnMonthIdx,
        status,
        baseProductId,
      });
    }
    insertCustomer.free();

    // 3. Seed orders and order_items
    const insertOrder = db.prepare(
      `INSERT INTO orders (
        order_id, customer_id, invoice_number, order_date, billing_month,
        order_type, status, total_net_aud, total_gross_profit_aud
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const insertOrderItem = db.prepare(
      `INSERT INTO order_items (
        order_item_id, order_id, product_id, quantity, unit_price_aud,
        discount_pct, net_revenue_aud, gross_profit_aud
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    let orderId = 1;
    let orderItemId = 1;
    const latestMonthIdx = MONTHS.length - 1;

    for (const c of customers) {
      const endMonthIdx = c.churnMonthIdx !== null ? c.churnMonthIdx - 1 : latestMonthIdx;
      const baseProd = PRODUCTS[c.baseProductId - 1];
      let hasAnalyticsAddon = c.segment === 'Enterprise' && rng() < 0.5;
      let hasSsoAddon = c.segment === 'Enterprise' && rng() < 0.6;
      let hasVpcAddon = false;
      let hasPrioritySupport = c.segment === 'Enterprise' && rng() < 0.45;
      let seatMultiplier = 1;

      for (let m = c.signupMonthIdx; m <= endMonthIdx; m++) {
        const billingMonth = MONTHS[m];
        const monthsActive = m - c.signupMonthIdx;
        const isFirstMonth = monthsActive === 0;

        // Organic account expansion over time (drives healthy NRR > 105%)
        let expandedThisMonth = false;
        if (!isFirstMonth && monthsActive >= 3) {
          if (c.segment === 'Enterprise') {
            if (!hasVpcAddon && rng() < 0.05) {
              hasVpcAddon = true;
              expandedThisMonth = true;
            } else if (!hasAnalyticsAddon && rng() < 0.06) {
              hasAnalyticsAddon = true;
              expandedThisMonth = true;
            } else if (seatMultiplier < 3 && rng() < 0.045) {
              seatMultiplier += 1;
              expandedThisMonth = true;
            }
          } else if (c.segment === 'Mid-Market') {
            if (!hasAnalyticsAddon && rng() < 0.045) {
              hasAnalyticsAddon = true;
              expandedThisMonth = true;
            } else if (!hasSsoAddon && rng() < 0.035) {
              hasSsoAddon = true;
              expandedThisMonth = true;
            } else if (seatMultiplier < 2 && rng() < 0.03) {
              seatMultiplier += 1;
              expandedThisMonth = true;
            }
          } else if (c.segment === 'SMB') {
            if (!hasAnalyticsAddon && rng() < 0.02) {
              hasAnalyticsAddon = true;
              expandedThisMonth = true;
            }
          }
        }

        const orderType: 'new' | 'renewal' | 'expansion' = isFirstMonth
          ? 'new'
          : expandedThisMonth
            ? 'expansion'
            : 'renewal';

        // Build line items for this invoice
        const items: { product: SeedProduct; qty: number; discount: number }[] = [
          {
            product: baseProd,
            qty: seatMultiplier,
            discount: c.segment === 'Enterprise' ? 0.1 : c.segment === 'Mid-Market' ? 0.05 : 0,
          },
        ];

        if (hasAnalyticsAddon) {
          items.push({ product: PRODUCTS[4], qty: 1, discount: 0 });
        }
        if (hasSsoAddon) {
          items.push({ product: PRODUCTS[5], qty: 1, discount: 0 });
        }
        if (hasVpcAddon) {
          items.push({ product: PRODUCTS[6], qty: 1, discount: 0.05 });
        }
        if (hasPrioritySupport) {
          items.push({ product: PRODUCTS[7], qty: 1, discount: 0 });
        }

        let totalNet = 0;
        let totalProfit = 0;
        const computedItems = items.map((it) => {
          const net = Math.round(it.product.price * it.qty * (1 - it.discount) * 100) / 100;
          const profit = Math.round(net * it.product.margin * 100) / 100;
          totalNet += net;
          totalProfit += profit;
          return { ...it, net, profit };
        });

        totalNet = Math.round(totalNet * 100) / 100;
        totalProfit = Math.round(totalProfit * 100) / 100;

        // Invoice payment status: introduce realistic overdue spike in 2026-10 for anomaly alerts
        const statusRoll = rng();
        let invoiceStatus: 'paid' | 'refunded' | 'overdue' = 'paid';
        if (m === latestMonthIdx) {
          if (c.status === 'at_risk' && statusRoll < 0.45) {
            invoiceStatus = 'overdue';
          } else if (statusRoll < 0.085) {
            invoiceStatus = 'overdue';
          } else if (statusRoll < 0.105) {
            invoiceStatus = 'refunded';
          }
        } else {
          if (statusRoll < 0.022) {
            invoiceStatus = 'overdue';
          } else if (statusRoll < 0.04) {
            invoiceStatus = 'refunded';
          }
        }

        const invDay = pad2(Math.floor(rng() * 24) + 1);
        const orderDate = `${billingMonth}-${invDay}`;
        const invoiceNumber = `INV-${billingMonth.replace('-', '')}-${String(orderId).padStart(5, '0')}`;

        insertOrder.run([
          orderId,
          c.id,
          invoiceNumber,
          orderDate,
          billingMonth,
          orderType,
          invoiceStatus,
          totalNet,
          totalProfit,
        ]);

        for (const ci of computedItems) {
          insertOrderItem.run([
            orderItemId,
            orderId,
            ci.product.id,
            ci.qty,
            ci.product.price,
            ci.discount,
            ci.net,
            ci.profit,
          ]);
          orderItemId += 1;
        }

        orderId += 1;
      }
    }
    insertOrder.free();
    insertOrderItem.free();

    // 4. Seed marketing_spend (22 months x 5 channels = 110 rows)
    const insertSpend = db.prepare(
      `INSERT INTO marketing_spend (
        spend_id, spend_month, channel, spend_aud, impressions, clicks, qualified_leads
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    const channelConfigs: {
      channel: AcquisitionChannel;
      baseSpend: number;
      cpm: number;
      ctr: number;
      leadRate: number;
    }[] = [
      { channel: 'Organic Search', baseSpend: 3200, cpm: 14, ctr: 0.036, leadRate: 0.072 },
      { channel: 'Paid Search', baseSpend: 7400, cpm: 42, ctr: 0.044, leadRate: 0.065 },
      { channel: 'LinkedIn B2B', baseSpend: 9200, cpm: 68, ctr: 0.018, leadRate: 0.088 },
      { channel: 'Partner Referral', baseSpend: 3800, cpm: 25, ctr: 0.030, leadRate: 0.115 },
      { channel: 'Events', baseSpend: 5600, cpm: 55, ctr: 0.022, leadRate: 0.092 },
    ];

    let spendId = 1;
    for (let m = 0; m < MONTHS.length; m++) {
      const month = MONTHS[m];
      const growthFactor = 1 + m * 0.028;
      const eofyFactor = m === 5 || m === 17 ? 1.18 : 1.0;

      for (const cfg of channelConfigs) {
        const noise = 0.88 + rng() * 0.24;
        const spend = Math.round(cfg.baseSpend * growthFactor * eofyFactor * noise);
        const impressions = Math.round((spend / cfg.cpm) * 1000);
        const clicks = Math.max(10, Math.round(impressions * cfg.ctr * (0.9 + rng() * 0.2)));
        const leads = Math.max(2, Math.round(clicks * cfg.leadRate * (0.85 + rng() * 0.3)));

        insertSpend.run([spendId, month, cfg.channel, spend, impressions, clicks, leads]);
        spendId += 1;
      }
    }
    insertSpend.free();

    // 5. Seed support_tickets (520 tickets across active/at_risk customers)
    const insertTicket = db.prepare(
      `INSERT INTO support_tickets (
        ticket_id, customer_id, created_at, created_month, priority,
        category, resolution_hours, sla_breached, csat_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const TOTAL_TICKETS = 520;
    for (let t = 1; t <= TOTAL_TICKETS; t++) {
      const customer = customers[Math.floor(rng() * customers.length)];
      const maxMonthIdx = customer.churnMonthIdx ?? latestMonthIdx;
      const span = Math.max(1, maxMonthIdx - customer.signupMonthIdx + 1);
      // Skew slightly toward recent months as customer base grows
      const monthIdx =
        t > TOTAL_TICKETS - 48
          ? latestMonthIdx
          : customer.signupMonthIdx + Math.floor(rng() * span);
      const createdMonth = MONTHS[Math.min(monthIdx, latestMonthIdx)];
      const day = pad2(Math.floor(rng() * 26) + 1);
      const createdAt = `${createdMonth}-${day}`;

      const priority =
        customer.status === 'at_risk'
          ? pickWeighted(rng, [
              ['urgent', 28],
              ['high', 36],
              ['normal', 26],
              ['low', 10],
            ])
          : pickWeighted(rng, [
              ['urgent', 10],
              ['high', 24],
              ['normal', 46],
              ['low', 20],
            ]);

      const category = TICKET_CATEGORIES[Math.floor(rng() * TICKET_CATEGORIES.length)];

      // SLA thresholds: urgent <= 4h, high <= 8h, normal <= 24h, low <= 48h
      const slaTarget =
        priority === 'urgent' ? 4 : priority === 'high' ? 8 : priority === 'normal' ? 24 : 48;

      // Introduce realistic SLA pressure in 2026-10 for urgent/high tickets
      const breachProb =
        createdMonth === MONTHS[latestMonthIdx] && (priority === 'urgent' || priority === 'high')
          ? 0.34
          : customer.status === 'at_risk'
            ? 0.24
            : 0.09;

      const slaBreached = rng() < breachProb ? 1 : 0;
      const resolutionHours = slaBreached
        ? Math.round((slaTarget * (1.15 + rng() * 1.4)) * 10) / 10
        : Math.round((slaTarget * (0.2 + rng() * 0.72)) * 10) / 10;

      const csatScore = slaBreached
        ? pickWeighted(rng, [
            [1, 18],
            [2, 34],
            [3, 32],
            [4, 12],
            [5, 4],
          ])
        : pickWeighted(rng, [
            [3, 8],
            [4, 38],
            [5, 54],
          ]);

      insertTicket.run([
        t,
        customer.id,
        createdAt,
        createdMonth,
        priority,
        category,
        resolutionHours,
        slaBreached,
        csatScore,
      ]);
    }
    insertTicket.free();

    db.run('COMMIT;');
  } catch (err) {
    db.run('ROLLBACK;');
    throw err;
  }
}

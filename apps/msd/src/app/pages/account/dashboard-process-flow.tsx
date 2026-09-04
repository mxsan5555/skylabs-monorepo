import { Icon } from '@skylabs-monorepo/shared-ui/react';
import type { DashboardStats } from '../../../api/rbac/dashboard';
import { formatINR } from '../../../utils/format';

interface Stage {
  key: string;
  label: string;
  value: (stats: DashboardStats) => string;
}

const nf = (n: number) => n.toLocaleString('en-IN');

/** The marketplace's real business flow, each stage annotated with its live count from the
 *  same `GET /dashboard/stats` payload the stat widgets use — informational only, no CRUD. */
const STAGES: Stage[] = [
  { key: 'category', label: 'Category', value: (s) => nf(s.categories) },
  { key: 'sub-category', label: 'Sub Category', value: (s) => nf(s.subCategories) },
  { key: 'product', label: 'Product', value: (s) => `${nf(s.products)} products` },
  { key: 'vendor', label: 'Vendor', value: (s) => nf(s.vendors) },
  { key: 'branch', label: 'Branch', value: (s) => nf(s.branches) },
  { key: 'deal-package', label: 'Deal / Package', value: (s) => nf(s.deals) },
  { key: 'customer-order', label: 'Customer Order', value: (s) => `${nf(s.orders)} orders` },
  { key: 'payment-revenue', label: 'Payment / Revenue', value: (s) => formatINR(Number(s.revenue)) },
];

interface DashboardProcessFlowProps {
  stats: DashboardStats | null;
  loading: boolean;
  error: string;
}

/**
 * Marketplace-wide "how a listing turns into revenue" overview: Category → Sub Category →
 * Product → Vendor → Branch → Deal/Package → Customer Order → Payment/Revenue.
 * Gated by the caller (`dashboard.tsx`, on a permission check, not a role-name check) — this
 * component just renders whatever `stats` it's handed and its own loading/error/empty states.
 */
export function DashboardProcessFlow({ stats, loading, error }: DashboardProcessFlowProps) {
  return (
    <section className="panel process-flow" aria-labelledby="process-flow-heading">
      <h2 id="process-flow-heading" className="section-title">
        Marketplace Flow
      </h2>

      {loading && <p className="loading-state">Loading marketplace flow…</p>}
      {!loading && error && (
        <p className="error-state" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && !stats && <p className="empty-state">No flow data available yet.</p>}

      {!loading && !error && stats && (
        <ol className="process-flow__steps">
          {STAGES.map((stage, i) => (
            <li key={stage.key} className="process-flow__step">
              <article className="stat-card process-flow__card">
                <h3 className="stat-card__title">{stage.label}</h3>
                <p className="stat-card__value process-flow__value">{stage.value(stats)}</p>
              </article>
              {i < STAGES.length - 1 && (
                <Icon aria-hidden="true" className="process-flow__arrow">
                  arrow_forward
                </Icon>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default DashboardProcessFlow;

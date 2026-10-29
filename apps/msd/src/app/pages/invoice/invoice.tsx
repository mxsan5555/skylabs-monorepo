import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FilledButton, CircularProgress, OutlinedButton, Icon, } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getMyOrder, type Order } from '../../../api/orders';
import { ApiRequestError } from '../../../api/rbac/client';
import { InvoiceDocument } from '../../components/invoice-document';
import content from '../../../content.json';
import './invoice.css';
import { Seo } from '../../seo/seo';
/**
 * Real, printable/downloadable invoice for a customer's own order — `GET /orders/me/:id`
 * (already ownership-scoped: 404s for another customer's order, same as every other `/me/*`
 * endpoint) already returns everything an invoice needs (items, vendor/branch snapshot,
 * contact/shipping details, payments) — no new backend endpoint required.
 *
 * "Download" is the browser's native print-to-PDF (`window.print()` + the `@media print` rules
 * in `invoice.css`, which hide the site chrome and this page's own action buttons) rather than a
 * new PDF-generation dependency — no `pdf` library exists anywhere in this repo today, and a
 * print-friendly HTML page is the lightest real implementation that still produces a genuine,
 * downloadable PDF via "Save as PDF" in the browser's print dialog.
 *
 * No "Discount" line: `OrderItem` snapshots only `unitPrice`/`lineTotal`, never an
 * `originalPrice`/`discountPercent` — inventing one here would violate this codebase's
 * "never fabricate" rule, so it's simply omitted rather than guessed.
 */
export function Invoice() {
  const { id = '' } = useParams<{ id: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { invoice } = content;

  useEffect(() => {
    setLoading(true);
    setError('');
    getMyOrder(token, id)
      .then(({ data }) => setOrder(data))
      .catch((err) =>
        setError(err instanceof ApiRequestError ? err.message : invoice.loadError,),
      )
      .finally(() => setLoading(false));
  }, [token, id]);
  if (loading) {
    return (
      <div className="invoice-loading">
        <CircularProgress indeterminate aria-label={invoice.loading} />
        <p>{invoice.loading}</p>
      </div>
    );
  }
  if (error || !order) {
    return (
      <div className="invoice-page invoice-page--empty">
        <Seo title={invoice.notFound.metaTitle} description={content.meta.invoice.description} path={content.meta.invoice.pathTemplate.replace('{id}', id)} noindex="follow" />
        <sky-info-card
          icon="receipt_long"
          heading={invoice.notFound.heading}
          subheading={error || invoice.notFound.subheading}
        />
        <FilledButton onClick={() => navigate('/orders')}>{invoice.notFound.cta}</FilledButton>
      </div>
    );
  }
  return (
    <div className="invoice-page">
      <Seo
        title={invoice.metaTitleTemplate.replace('{id}', order.id)}
        description={content.meta.invoice.description}
        path={content.meta.invoice.pathTemplate.replace('{id}', order.id)}
        noindex="follow"
      />
      <div className="invoice-page__actions">
        <OutlinedButton onClick={() => navigate(`/orders/${order.id}`)}>
          <Icon slot="icon" aria-hidden="true">arrow_back</Icon>{invoice.backToOrder}
        </OutlinedButton>
        <FilledButton onClick={() => window.print()}>
          <Icon slot="icon" aria-hidden="true">download</Icon>{invoice.downloadPrint}
        </FilledButton>
      </div>
      <InvoiceDocument order={order} />
    </div>
  );
}
export default Invoice;
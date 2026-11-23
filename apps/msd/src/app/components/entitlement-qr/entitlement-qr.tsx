import { useEffect, useState } from 'react';
import { toDataURL } from 'qrcode';
import { fillTemplate, formatLongDate } from '../../../utils/format';
import content from '../../../content.json';
import './entitlement-qr.css';

const t = content.orderDetail.qr;

export type EntitlementQrStatus = 'active' | 'redeemed' | 'expired';

const STATUS_TONE: Record<EntitlementQrStatus, 'success' | 'neutral' | 'error'> = {
  active: 'success',
  redeemed: 'neutral',
  expired: 'error',
};

/** One purchased unit's QR eligibility — see `order-item-card.tsx#qrStatusOf` for how this is
 *  derived from `entitlementStatus`/`qrExpiresAt`. `null` means no QR block at all: a product
 *  entitlement, or one cancelled/refunded. */
export function qrDaysRemaining(qrExpiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(qrExpiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

export interface EntitlementQrProps {
  voucherCode: string;
  orderNumber: string;
  purchasedAt: string;
  qrExpiresAt: string;
  status: EntitlementQrStatus;
}

/**
 * D40 — per-unit QR block on the customer Order Details page. The QR image itself is generated
 * client-side (`qrcode#toDataURL`, same package/import convention as mera-driver's own QR use)
 * from the voucher code alone — no network round trip, and nothing the backend didn't already
 * send. Only rendered for an `active` voucher; `redeemed`/`expired` show the same facts without
 * an image, since scanning either can no longer redeem anything.
 */
export function EntitlementQr({ voucherCode, orderNumber, purchasedAt, qrExpiresAt, status }: EntitlementQrProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'active') return;
    let cancelled = false;
    toDataURL(voucherCode, { margin: 1, width: 160 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [voucherCode, status]);

  const daysRemaining = qrDaysRemaining(qrExpiresAt);

  return (
    <div className="entitlement-qr" aria-labelledby={`entitlement-qr-${voucherCode}`}>
      {status === 'active' && dataUrl && (
        <img className="entitlement-qr__image" src={dataUrl} alt={fillTemplate(t.altText, { code: voucherCode })} width={120} height={120} />
      )}
      <div className="entitlement-qr__body">
        <h4 id={`entitlement-qr-${voucherCode}`} className="entitlement-qr__heading label-large">
          {t.heading}
        </h4>
        <dl className="entitlement-qr__facts">
          <div>
            <dt>{t.order}</dt>
            <dd>{orderNumber}</dd>
          </div>
          <div>
            <dt>{t.purchased}</dt>
            <dd>{formatLongDate(purchasedAt)}</dd>
          </div>
          <div>
            <dt>{t.expires}</dt>
            <dd>
              {formatLongDate(qrExpiresAt)}
              {status === 'active' && ` · ${daysRemaining === 1 ? t.daysLeftOne : fillTemplate(t.daysLeftMany, { days: String(daysRemaining) })}`}
            </dd>
          </div>
        </dl>
        <sky-badge status={STATUS_TONE[status]}>{t.status[status]}</sky-badge>
      </div>
    </div>
  );
}

export default EntitlementQr;

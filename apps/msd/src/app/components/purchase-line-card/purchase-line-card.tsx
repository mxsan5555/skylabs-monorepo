import type { ReactNode } from 'react';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import type { PurchaseLine } from '../../../utils/cart-items';
import { formatINR } from '../../../utils/format';
import content from '../../../content.json';
import './purchase-line-card.css';

const t = content.purchaseLine;

export interface PurchaseLineCardProps {
  line: PurchaseLine;
  /** Cart only: the line's select checkbox. */
  select?: ReactNode;
  /** Cart only: the quantity stepper, shown instead of "× quantity". */
  quantity?: ReactNode;
  /** Cart only: Move to wishlist and Remove. */
  actions?: ReactNode;
}

/**
 * One cart or checkout line as a card (item 2): type tag, title, the member's name and branch
 * inside the card, duration, quantity and price. Title and image open the detail page in a new
 * tab (the title says so; the image link repeats it, so it is hidden from keyboard and screen
 * readers). Must sit in a `ul`.
 */
export function PurchaseLineCard({ line, select, quantity, actions }: PurchaseLineCardProps) {
  const external = { target: '_blank', rel: 'noopener noreferrer' } as const;
  const media = line.image ? <img src={line.image} alt="" width={96} height={96} loading="lazy" decoding="async" /> : null;

  return (
    <li className="purchase-line">
      {select && <div className="purchase-line__select">{select}</div>}
      {media &&
        (line.href ? (
          <a className="purchase-line__media" href={line.href} {...external} tabIndex={-1} aria-hidden="true">
            {media}
          </a>
        ) : (
          <span className="purchase-line__media">{media}</span>
        ))}
      <div className="purchase-line__body">
        <div className="purchase-line__top">
          <div className="purchase-line__details">
            <span className="purchase-line__kind label-small">{line.kind}</span>
            <h3 className="purchase-line__title title-small">
              {line.href ? (
                <a href={line.href} {...external}>
                  {line.title}
                  <span className="sr-only"> {t.opensInNewTab}</span>
                  <Icon aria-hidden="true" className="purchase-line__external">
                    open_in_new
                  </Icon>
                </a>
              ) : (
                line.title
              )}
            </h3>
            <p className="purchase-line__member body-small">
              <Icon aria-hidden="true">storefront</Icon>
              <span>
                {line.memberName}
                {line.branchName && ` · ${line.branchName}`}
              </span>
            </p>
            {(line.duration || !quantity) && (
              <p className="purchase-line__meta body-small">
                {[line.duration, quantity ? null : `× ${line.quantity}`].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <p className="purchase-line__price title-medium">{formatINR(line.total)}</p>
        </div>
        {(quantity || actions) && (
          <div className="purchase-line__bottom">
            {quantity}
            {actions && <div className="purchase-line__actions">{actions}</div>}
          </div>
        )}
      </div>
    </li>
  );
}

export default PurchaseLineCard;

export interface PurchaseLineListProps {
  /** `PurchaseLineCard`s. */
  children: ReactNode;
  /** Optional total row under the list: label and amount. */
  total?: { label: string; amount: number };
  className?: string;
}

/** A list of `PurchaseLineCard`s with an optional total row (order result). */
export function PurchaseLineList({ children, total, className }: PurchaseLineListProps) {
  return (
    <>
      <ul className={['purchase-lines', className].filter(Boolean).join(' ')}>{children}</ul>
      {total && (
        <p className="purchase-lines__total title-medium">
          <span>{total.label}</span>
          <strong>{formatINR(total.amount)}</strong>
        </p>
      )}
    </>
  );
}

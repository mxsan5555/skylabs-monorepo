import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FilledButton, OutlinedButton, IconButton, Icon, Divider } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getCart, updateCartItemQuantity, removeCartItem, clearCart, type Cart as CartData, type CartItem } from '../../../api/cart';
import { ApiRequestError } from '../../../api/rbac/client';
import { formatINR, pluralize } from '../../../utils/format';
import { resolveDealMedia, primaryImage } from '../../../utils/media';
import './cart.css';
import content from '../../../content.json';

/**
 * Real, backend-driven cart. Deal/Product/Therapist are purchasable together in ONE cart, ONE
 * checkout, ONE order — there is no separate Deal Cart / Therapist Cart / Product Cart, and no
 * separate Booking flow (see CartItem's own "three shapes" schema doc comment in msd-api). Every
 * line — whichever kind — comes back from the same `GET /cart` call and renders uniformly here.
 * Multi-vendor: items from any number of vendors/branches may sit here (see `Cart`'s doc comment
 * in `api/cart.ts`) — grouped by vendor purely for display, still one page, one combined total.
 */

function itemKindLabel(item: CartItem): 'Deal' | 'Product' | 'Therapist' {
  if (item.therapistId) return 'Therapist';
  if (item.dealPackageId) return 'Deal';
  return 'Product';
}

function itemTitle(item: CartItem): string {
  if (item.therapist) return `${item.therapist.therapistType} — ${item.therapist.personName}`;
  if (item.dealPackageId) return item.deal?.title ?? 'Deal';
  return item.deal?.product?.name ?? item.deal?.title ?? 'Product';
}

function itemSubtitle(item: CartItem): string {
  const duration = item.dealPackage?.durationMinutes ?? item.therapistPackage?.durationMinutes;
  if (item.therapist) return duration ? `${duration} min` : itemKindLabel(item);
  if (item.dealPackageId) return duration ? `${duration} min` : itemKindLabel(item);
  return item.deal?.title ?? itemKindLabel(item);
}

function itemImage(item: CartItem): string | null {
  if (item.deal) return primaryImage(resolveDealMedia(item.deal)) ?? null;
  return item.therapist?.photoUrl ?? null;
}

function itemVendorId(item: CartItem): string {
  return item.therapist?.vendorId ?? item.deal?.vendorId ?? 'unknown';
}

function itemVendorName(item: CartItem): string {
  return item.therapist?.vendor?.businessName ?? item.deal?.vendor?.businessName ?? 'Vendor';
}

function itemBranchName(item: CartItem): string | undefined {
  return item.therapist?.branch?.name ?? item.deal?.branch?.name;
}

export function Cart() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [cart, setCart] = useState<CartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getCart(token)
      .then(({ data }) => setCart(data))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load your cart.'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const items = cart?.items ?? [];
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + Number(i.unitPrice) * i.quantity, 0);

  // Group by vendor purely for display — checkout still sends/creates one flat order.
  const vendorGroups = items.reduce<{ vendorId: string; vendorName: string; branchName: string | undefined; items: CartItem[] }[]>(
    (groups, item) => {
      const vendorId = itemVendorId(item);
      const group = groups.find((g) => g.vendorId === vendorId);
      if (group) {
        group.items.push(item);
      } else {
        groups.push({
          vendorId,
          vendorName: itemVendorName(item),
          branchName: itemBranchName(item),
          items: [item],
        });
      }
      return groups;
    },
    [],
  );

  const changeQty = async (itemId: string, quantity: number) => {
    if (quantity < 1) return;
    setError('');
    try {
      const { data } = await updateCartItemQuantity(token, itemId, quantity);
      setCart(data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : content.cart.error.updateQuantity);
    }
  };

  const remove = async (itemId: string) => {
    setError('');
    try {
      const { data } = await removeCartItem(token, itemId);
      setCart(data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : content.cart.error.removeItem);
    }
  };

  const doCheckout = () => {
    // The real order-creation call happens on /checkout itself, so a page refresh mid-payment
    // retries against the same Order instead of silently creating another one here.
    navigate('/checkout');
  };

  if (loading) return <p className="loading-state"> {content.cart.loading}</p>;

  return (
    <div className="cart-page">
      <title>{content.meta.cart.title}</title>
      <meta name="robots" content="noindex" />

      <div className="cart-page__inner">
        <h1 className="cart-page__title">
          {content.cart.title}
          {totalItems > 0 && <span className="cart-page__count">({totalItems} {pluralize(totalItems, 'item')})</span>}
        </h1>

        {error && <p className="error-state" role="alert">{error}</p>}

        {items.length === 0 ? (
          <div className="cart-page__empty">
            <sky-info-card icon="shopping_bag" heading="Your cart is empty" subheading="Browse categories to add products, deals, or therapists." />
            <FilledButton onClick={() => navigate('/categories')}>Browse Categories</FilledButton>
          </div>
        ) : (
          <div className="cart-page__layout">
            <section className="cart-page__items" aria-label="Cart items">
              {vendorGroups.map((group) => (
                <div key={group.vendorId} className="cart-vendor-group">
                  <p className="cart-vendor-group__heading">
                    <Icon aria-hidden="true">storefront</Icon>
                    <strong>{group.vendorName}</strong>
                    {group.branchName && ` · ${group.branchName}`}
                  </p>
                  <ul className="cart-list">
                    {group.items.map((item) => (
                      <li key={item.id} className="cart-item">
                        {itemImage(item) && (
                          <img
                            className="cart-item__img"
                            src={itemImage(item)!}
                            alt=""
                            width={100}
                            height={100}
                            loading="lazy"
                          />
                        )}
                        <div className="cart-item__body">
                          <div className="cart-item__top">
                            <div>
                              <p className="cart-item__provider">{itemKindLabel(item)}</p>
                              <h3 className="cart-item__title">{itemTitle(item)}</h3>
                              <p className="cart-item__provider">{itemSubtitle(item)}</p>
                            </div>
                            <p className="cart-item__price">{formatINR(Number(item.unitPrice) * item.quantity)}</p>
                          </div>
                          <div className="cart-item__actions">
                            <div className="cart-item__qty" role="group" aria-label={`Quantity for ${itemTitle(item)}`}>
                              <IconButton aria-label="Decrease quantity" disabled={item.quantity <= 1} onClick={() => changeQty(item.id, item.quantity - 1)}>
                                <Icon aria-hidden="true">remove</Icon>
                              </IconButton>
                              <span className="cart-item__qty-val" aria-label={`${item.quantity} in cart`}>{item.quantity}</span>
                              <IconButton aria-label="Increase quantity" onClick={() => changeQty(item.id, item.quantity + 1)}>
                                <Icon aria-hidden="true">add</Icon>
                              </IconButton>
                            </div>
                            <IconButton aria-label={`Remove ${itemTitle(item)} from cart`} onClick={() => remove(item.id)}>
                              <Icon aria-hidden="true">delete_outline</Icon>
                            </IconButton>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <OutlinedButton
                onClick={() =>
                  clearCart(token)
                    .then(({ data }) => setCart(data))
                    .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not clear your cart.'))
                }
              >
                <Icon slot="icon" aria-hidden="true">delete_sweep</Icon>
                Clear cart
              </OutlinedButton>
            </section>

            <aside className="cart-page__summary" aria-label={content.cart.orderSummaryHeading}>
              <sky-card variant="outlined" className="cart-summary-card">
                <div className="cart-summary">
                  <h2 className="cart-summary__heading">{content.cart.orderSummaryHeading}</h2>
                  <div className="cart-summary__row">
                    <span>  {content.cart.subtotal}  ({totalItems} {pluralize(totalItems, 'item')})</span>
                    <span>{formatINR(subtotal)}</span>
                  </div>
                  <Divider />
                  <div className="cart-summary__row cart-summary__row--total">
                    <strong>{content.cart.total}</strong>
                    <strong>{formatINR(subtotal)}</strong>
                  </div>
                  <p className="field-hint"> {content.cart.serverPriceNote}</p>
                  <FilledButton className="cart-summary__checkout-btn" onClick={doCheckout}>
                   {content.cart.checkoutCta}
                    <Icon slot="trailing-icon" aria-hidden="true">arrow_forward</Icon>
                  </FilledButton>
                  <OutlinedButton className="cart-summary__continue-btn" onClick={() => navigate('/categories')}>
                    {content.cart.continueBrowsing}
                  </OutlinedButton>
                </div>
              </sky-card>
            </aside>
          </div>
        )}

        <Link to="/orders" className="field-hint">{content.cart.links.orders}</Link>
      </div>
    </div>
  );
}
export default Cart;

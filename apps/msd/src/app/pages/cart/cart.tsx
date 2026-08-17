import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FilledButton, OutlinedButton, IconButton, Icon, Divider } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getCart, updateCartItemQuantity, removeCartItem, clearCart, type Cart } from '../../../api/cart';
import { ApiRequestError } from '../../../api/rbac/client';
import { formatINR, pluralize } from '../../../utils/format';
import content from '../../../content.json';
import './cart.css';

/**
 * Real, backend-driven cart — `Cart`/`CartItem` (single vendor+branch per cart, product deals
 * only). Reuses `cart.css`/`cart-item__*`/`sky-info-card` unchanged from the page's previous
 * mock `localStorage` implementation — only the data source changed (the marketplace cart route
 * this absorbed was already built against the same markup for exactly this reason).
 */
export function Cart() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getCart(token)
      .then(({ data }) => setCart(data))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : content.cart.error.load))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const items = cart?.items ?? [];
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + Number(i.deal.salePrice) * i.quantity, 0);

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
            <sky-info-card icon="shopping_bag" heading={content.cart.emptyHeading} subheading={content.cart.emptySubheading} />
            <FilledButton onClick={() => navigate('/categories')}> {content.cart.emptyCtaLabel}</FilledButton>
          </div>
        ) : (
          <div className="cart-page__layout">
            <section className="cart-page__items" aria-label={content.cart.itemsAriaLabel}>
              {cart?.vendor && (
                <p className="field-hint">
                  {content.cart.allItemsFrom}{' '}
                  <strong>{cart.vendor.businessName}</strong>
                  {cart.branch && ` · ${cart.branch.name}`}
                </p>
              )}
              <ul className="cart-list">
                {items.map((item) => (
                  <li key={item.id} className="cart-item">
                    {(item.deal.product?.image ?? item.deal.images?.[0]) && (
                      <img
                        className="cart-item__img"
                        src={item.deal.product?.image ?? item.deal.images?.[0] ?? undefined}
                        alt={item.deal.product?.imageAlt ?? ''}
                        width={100}
                        height={100}
                        loading="lazy"
                      />
                    )}
                    <div className="cart-item__body">
                      <div className="cart-item__top">
                        <div>
                          <h3 className="cart-item__title">{item.deal.product?.name ?? item.deal.title}</h3>
                          <p className="cart-item__provider">{item.deal.title}</p>
                        </div>
                        <p className="cart-item__price">{formatINR(Number(item.deal.salePrice) * item.quantity)}</p>
                      </div>
                      <div className="cart-item__actions">
                        <div className="cart-item__qty" role="group" aria-label={`${content.cart.quantityLabel} ${item.deal.title}`}>
                          <IconButton aria-label={content.cart.decreaseQuantity} disabled={item.quantity <= 1} onClick={() => changeQty(item.id, item.quantity - 1)}>
                            <Icon aria-hidden="true">remove</Icon>
                          </IconButton>
                          <span className="cart-item__qty-val" aria-label={`${item.quantity} ${content.cart.quantityInCart}`}>{item.quantity}</span>
                          <IconButton aria-label={content.cart.increaseQuantity} onClick={() => changeQty(item.id, item.quantity + 1)}>
                            <Icon aria-hidden="true">add</Icon>
                          </IconButton>
                        </div>
                        <IconButton aria-label={`${content.cart.removeItem} ${item.deal.title} ${content.cart.fromCart}`} onClick={() => remove(item.id)}>
                          <Icon aria-hidden="true">delete_outline</Icon>
                        </IconButton>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <OutlinedButton onClick={() => clearCart(token).then(({ data }) => setCart(data))}>
                <Icon slot="icon" aria-hidden="true">delete_sweep</Icon>
                {content.cart.clearCart}
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

        <Link to="/bookings" className="field-hint">{content.cart.links.bookings}</Link>{' '}
        <Link to="/orders" className="field-hint">{content.cart.links.orders}</Link>
      </div>
    </div>
  );
}
export default Cart;

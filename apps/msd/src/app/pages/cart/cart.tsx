import { createElement, useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilledButton, OutlinedButton, IconButton, Icon, Divider } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getCart, updateCartItemQuantity, removeCartItem, clearCart, type Cart as CartData, type CartItem } from '../../../api/cart';
import { addToWishlist, addProductToWishlist } from '../../../api/wishlist';
import { ApiRequestError } from '../../../api/rbac/client';
import { formatINR, pluralize } from '../../../utils/format';
import { lineFromCartItem } from '../../../utils/cart-items';
import { PurchaseLineCard } from '../../components/purchase-line-card/purchase-line-card';
import { showSnackbar } from '../../../snackbar/snackbar';
import './cart.css';
import content from '../../../content.json';
import { Seo } from '../../seo/seo';

const t = content.cart;
const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
const errorText = (err: unknown, fallback: string) => (err instanceof ApiRequestError ? err.message : fallback);

/**
 * Real, backend-driven cart. Deal/Product/Therapist are purchasable together in ONE cart, ONE
 * checkout, ONE order — there is no separate Deal Cart / Therapist Cart / Product Cart, and no
 * separate Booking flow (see CartItem's own "three shapes" schema doc comment in msd-api). Every
 * line — whichever kind — comes back from the same `GET /cart` call and renders as one
 * `PurchaseLineCard` with its member inside (item 2.1). Lines can be selected (one or all) and
 * removed together; deals and products can move to the wishlist (therapists have no wishlist).
 */
export function Cart() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [cart, setCart] = useState<CartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getCart(token)
      .then(({ data }) => setCart(data))
      .catch((err) => setError(errorText(err, t.error.load)))
      .finally(() => setLoading(false));
  }, [token]);
  useEffect(() => {load(); }, [load]);
  const items = cart?.items ?? [];
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + Number(i.unitPrice) * i.quantity, 0);
  // Only ids still in the cart count, so a line removed elsewhere drops out of the selection.
  const selectedIds = items.filter((item) => selected.has(item.id)).map((item) => item.id);
  const allSelected = items.length > 0 && selectedIds.length === items.length;

  const toggle = (itemId: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  const toggleAll = (checked: boolean) => setSelected(new Set(checked ? items.map((item) => item.id) : []));

  const changeQty = async (itemId: string, quantity: number) => {
    if (quantity < 1) return;
    setError('');
    try {
      const { data } = await updateCartItemQuantity(token, itemId, quantity);
      setCart(data);
    } catch (err) {
      setError(errorText(err, t.error.updateQuantity));
    }
  };
  const remove = async (itemId: string) => {
    setError('');
    try {
      const { data } = await removeCartItem(token, itemId);
      setCart(data);
    } catch (err) {
      setError(errorText(err, t.error.removeItem));
    }
  };
  const removeSelected = async () => {
    if (selectedIds.length === 0) return;
    setError('');
    setBusy(true);
    try {
      // One call when every line goes; otherwise line by line (there is no bulk delete).
      let latest: CartData | null = null;
      if (allSelected) latest = (await clearCart(token)).data;
      else for (const id of selectedIds) latest = (await removeCartItem(token, id)).data;
      if (latest) setCart(latest);
      setSelected(new Set());
      showSnackbar(fill(t.removedItems, { count: selectedIds.length, items: pluralize(selectedIds.length, 'item') }), { variant: 'success' });
    } catch (err) {
      setError(errorText(err, t.error.removeSelected));
      load();
    } finally {
      setBusy(false);
    }
  };
  const moveToWishlist = async (item: CartItem) => {
    setError('');
    try {
      if (item.productId) await addProductToWishlist(token, item.productId);
      else if (item.dealId) await addToWishlist(token, item.dealId);
      else return;
      const { data } = await removeCartItem(token, item.id);
      setCart(data);
      showSnackbar(t.movedToWishlist, { variant: 'success', actionLabel: t.viewWishlist, onAction: () => navigate('/wishlist') });
    } catch (err) {
      setError(errorText(err, t.error.moveToWishlist));
    }
  };
  const doCheckout = () => {
    // The real order-creation call happens on /checkout itself, so a page refresh mid-payment
    // retries against the same Order instead of silently creating another one here.
    navigate('/checkout');
  };
  if (loading) return <p className="loading-state"> {t.loading}</p>;
  return (
    <div className="cart-page">
      <Seo title={content.meta.cart.title} description={content.meta.cart.description} path={content.meta.cart.path} noindex="follow" />
      <div className="cart-page__inner">
        {error && <p className="error-state" role="alert">{error}</p>}
        {items.length === 0 ? (
          <div className="cart-page__empty">
            <sky-info-card icon="shopping_bag" heading="Your cart is empty" subheading="Explore our wellness deals, products, and services to find something for you." />
            <div className="cart-page__empty-action">
              <FilledButton onClick={() => navigate('/')}> Explore Now</FilledButton>
            </div>
          </div>
        ) : (
          <div className="cart-page__layout">
            <section className="cart-page__items" aria-labelledby="cart-title">
              <div className="cart-items-header">
                <h2 id="cart-title" className="cart-page__title">{t.title}
                  {totalItems > 0 && <span className="cart-page__count">({totalItems} {pluralize(totalItems, 'item')})</span>}
                </h2>
              </div>
              <div className="cart-select-bar">
                <label className="cart-select-bar__all">
                  {createElement('md-checkbox', {
                    checked: allSelected,
                    indeterminate: selectedIds.length > 0 && !allSelected,
                    'touch-target': 'wrapper',
                    onChange: (e: ChangeEvent<HTMLElement & { checked: boolean }>) => toggleAll(e.currentTarget.checked),
                  })}
                  <span className="body-medium">{fill(t.selectAll, { count: items.length })}</span>
                </label>
                {createElement(
                  'md-text-button',
                  { disabled: selectedIds.length === 0 || busy, onClick: removeSelected },
                  <Icon slot="icon" aria-hidden="true">delete</Icon>,
                  selectedIds.length > 0 ? fill(t.removeSelectedCount, { count: selectedIds.length }) : t.removeSelected,
                )}
              </div>
              <ul className="cart-list">
                {items.map((item) => {
                  const line = lineFromCartItem(item);
                  return (
                    <PurchaseLineCard
                      key={item.id}
                      line={line}
                      select={createElement('md-checkbox', {
                        checked: selected.has(item.id),
                        'touch-target': 'wrapper',
                        'aria-label': fill(t.selectItem, { title: line.title }),
                        onChange: (e: ChangeEvent<HTMLElement & { checked: boolean }>) => toggle(item.id, e.currentTarget.checked),
                      })}
                      quantity={
                        <div className="cart-item__qty" role="group" aria-label={`${t.quantityLabel} ${line.title}`}>
                          <span className="cart-item__qty-label">{t.quantity}</span>
                          <div className="cart-item__qty-control">
                            <IconButton aria-label={t.decreaseQuantity} disabled={item.quantity <= 1} onClick={() => changeQty(item.id, item.quantity - 1)}>
                              <Icon aria-hidden="true">remove</Icon>
                            </IconButton>
                            <span className="cart-item__qty-val" aria-label={`${item.quantity} ${t.quantityInCart}`}>{item.quantity}</span>
                            <IconButton aria-label={t.increaseQuantity} onClick={() => changeQty(item.id, item.quantity + 1)}>
                              <Icon aria-hidden="true">add</Icon>
                            </IconButton>
                          </div>
                        </div>
                      }
                      actions={
                        <>
                          {!item.therapistId &&
                            createElement(
                              'md-text-button',
                              { 'aria-label': fill(t.moveToWishlistLabel, { title: line.title }), onClick: () => moveToWishlist(item) },
                              <Icon slot="icon" aria-hidden="true">favorite</Icon>,
                              t.moveToWishlist,
                            )}
                          {createElement(
                            'md-text-button',
                            { 'aria-label': `${t.removeItem} ${line.title} ${t.fromCart}`, onClick: () => remove(item.id) },
                            <Icon slot="icon" aria-hidden="true">delete_outline</Icon>,
                            t.removeItem,
                          )}
                        </>
                      }
                    />
                  );
                })}
              </ul>
            </section>
            <aside className="cart-page__summary" aria-label={t.orderSummaryHeading}>
              <sky-card variant="outlined" className="cart-summary-card">
                <div className="cart-summary">
                  <h2 className="cart-summary__heading">{t.orderSummaryHeading}</h2>
                  <div className="cart-summary__row">
                    <span>  {t.subtotal}  ({totalItems} {pluralize(totalItems, 'item')})</span>
                    <span>{formatINR(subtotal)}</span>
                  </div>
                  <Divider />
                  <div className="cart-summary__row cart-summary__row--total">
                    <strong>{t.total}</strong>
                    <strong>{formatINR(subtotal)}</strong>
                  </div>
                  <p className="field-hint"> {t.serverPriceNote}</p>
                  <FilledButton className="cart-summary__checkout-btn" onClick={doCheckout}>
                    {t.checkoutCta}
                    <Icon slot="trailing-icon" aria-hidden="true">arrow_forward</Icon>
                  </FilledButton>
                  <OutlinedButton className="cart-summary__continue-btn" onClick={() => navigate('/')}>
                    {t.continueBrowsing}
                  </OutlinedButton>
                </div>
              </sky-card>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
export default Cart;

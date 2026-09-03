import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FilledButton, OutlinedButton, IconButton, Icon, Divider } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getCart, updateCartItemQuantity, removeCartItem, clearCart, type Cart } from '../../../api/cart';
import { listBookings, cancelBooking, type Booking } from '../../../api/bookings';
import { ApiRequestError } from '../../../api/rbac/client';
import { formatINR, pluralize, formatBookingSchedule, bookingDisplayName } from '../../../utils/format';
import { resolveDealMedia, primaryImage } from '../../../utils/media';
import './cart.css';
import content from '../../../content.json';
/**
 * Real, backend-driven cart. Deal/Therapist/Product must be purchasable together in ONE cart,
 * ONE checkout, ONE order — there is no separate Deal Cart / Therapist Cart / Product Cart (see
 * this app's marketplace architecture plan). Product `CartItem`s and PENDING service `Booking`s
 * (a Deal or a Therapist booked directly — see Booking's own "exactly one of dealId/therapistId"
 * doc comment in msd-api) are two entirely separate backend models — Booking IS the commitment
 * the moment it's created, there's no cart-accumulation step for services — so this page fetches
 * both and displays them together with one combined total, feeding into checkout.tsx's own
 * unified multi-order checkout. Multi-vendor: items/bookings from any number of vendors/branches
 * may sit here (see `Cart`'s doc comment in `api/cart.ts`) — grouped by vendor purely for
 * display, still one page, one combined total.
 */
export function Cart() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [cart, setCart] = useState<Cart | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([getCart(token), listBookings(token, { status: 'PENDING', pageSize: 50 })])
      .then(([cartRes, bookingsRes]) => {
        setCart(cartRes.data);
        setBookings(bookingsRes.data);
      })
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load your cart.'))
      .finally(() => setLoading(false));
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);
  const items = cart?.items ?? [];
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0) + bookings.length;
  const productSubtotal = items.reduce((sum, i) => sum + Number(i.deal.salePrice) * i.quantity, 0);
  const bookingSubtotal = bookings.reduce((sum, b) => sum + Number(b.priceSnapshot) * b.quantity, 0);
  const subtotal = productSubtotal + bookingSubtotal;
  const removeBooking = async (booking: Booking) => {
    setError('');
    try {
      await cancelBooking(token, booking.id);
      setBookings((prev) => prev.filter((b) => b.id !== booking.id));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not remove this booking.');
    }
  };
  // Group by vendor purely for display — checkout still sends/creates one flat order.
  const vendorGroups = items.reduce<{ vendorId: string; vendorName: string; branchName: string | undefined; items: typeof items }[]>(
    (groups, item) => {
      const group = groups.find((g) => g.vendorId === item.deal.vendorId);
      if (group) {
        group.items.push(item);
      } else {
        groups.push({
          vendorId: item.deal.vendorId,
          vendorName: item.deal.vendor?.businessName ?? 'Vendor',
          branchName: item.deal.branch?.name,
          items: [item],
        });
      }
      return groups;
    }, [],
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
        {items.length === 0 && bookings.length === 0 ? (
          <div className="cart-page__empty">
            <sky-info-card icon="shopping_bag" heading="Your cart is empty" subheading="Browse categories to add products, deals, or therapists." />
            <FilledButton onClick={() => navigate('/categories')}>Browse Categories</FilledButton>
          </div>
        ) : (
          <div className="cart-page__layout">
            <section className="cart-page__items" aria-label="Cart items">
              {bookings.length > 0 && (
                <div className="cart-vendor-group">
                  <p className="cart-vendor-group__heading">
                    <Icon aria-hidden="true">event_available</Icon>
                    <strong>Bookings</strong>
                  </p>
                  <ul className="cart-list">
                    {bookings.map((booking) => (
                      <li key={booking.id} className="cart-item">
                        <div className="cart-item__body">
                          <div className="cart-item__top">
                            <div>
                              <h3 className="cart-item__title">{bookingDisplayName(booking)}</h3>
                              <p className="cart-item__provider">
                                {booking.vendor.businessName} · {booking.branch.name}
                                {booking.durationMinutesSnapshot ? ` · ${booking.durationMinutesSnapshot} min` : ''}
                                {' · '}
                                {formatBookingSchedule(booking.bookingDate, booking.timeSlot)}
                              </p>
                            </div>
                            <p className="cart-item__price">{formatINR(Number(booking.priceSnapshot) * booking.quantity)}</p>
                          </div>
                          <div className="cart-item__actions">
                            <IconButton aria-label={`Remove ${bookingDisplayName(booking)} from cart`} onClick={() => removeBooking(booking)}>
                              <Icon aria-hidden="true">delete_outline</Icon>
                            </IconButton>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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
                        {primaryImage(resolveDealMedia(item.deal)) && (
                          <img
                            className="cart-item__img"
                            src={primaryImage(resolveDealMedia(item.deal))}
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
                            <div className="cart-item__qty" role="group" aria-label={`Quantity for ${item.deal.title}`}>
                              <IconButton aria-label="Decrease quantity" disabled={item.quantity <= 1} onClick={() => changeQty(item.id, item.quantity - 1)}>
                                <Icon aria-hidden="true">remove</Icon>
                              </IconButton>
                              <span className="cart-item__qty-val" aria-label={`${item.quantity} in cart`}>{item.quantity}</span>
                              <IconButton aria-label="Increase quantity" onClick={() => changeQty(item.id, item.quantity + 1)}>
                                <Icon aria-hidden="true">add</Icon>
                              </IconButton>
                            </div>
                            <IconButton aria-label={`Remove ${item.deal.title} from cart`} onClick={() => remove(item.id)}>
                              <Icon aria-hidden="true">delete_outline</Icon>
                            </IconButton>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {items.length > 0 && (
                <OutlinedButton onClick={() => clearCart(token).then(({ data }) => setCart(data))}>
                  <Icon slot="icon" aria-hidden="true">delete_sweep</Icon>
                  Clear cart
                </OutlinedButton>
              )}
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

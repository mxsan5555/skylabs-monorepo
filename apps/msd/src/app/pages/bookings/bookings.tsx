import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FilledButton, OutlinedButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listBookings, cancelBooking, type Booking } from '../../../api/bookings';
import { ApiRequestError } from '../../../api/rbac/client';
import { formatBookingSchedule, bookingDisplayName } from '../../../utils/format';
import '../category/category.css';
import content from '../../../content.json';
/** Customer's own service bookings — reuses the admin-console's `entity-list`/`status-pill`
 *  classes (global, defined once in `styles.css`, not admin-scoped) for a consistent list look
 *  without inventing a new one. Relocated here from the old marketplace bookings route now that
 *  the marketplace route namespace is retired. */
export function Bookings() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    listBookings(token, { pageSize: 50 })
      .then(({ data }) => setBookings(data))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : content.bookings.error.load))
      .finally(() => setLoading(false));
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);
  const cancel = async (booking: Booking) => {
    if (!window.confirm(`Cancel your booking for "${bookingDisplayName(booking)}"?`)) return;
    setError('');
    try {
      await cancelBooking(token, booking.id);
      load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : content.bookings.error.cancel);
    }
  };
  const orderNow = (booking: Booking) => {
    // The real order-creation call happens on /checkout itself. If this booking already has an
    // order, checkout.tsx's own error handling surfaces that 409 plainly.
    navigate('/checkout', { state: { bookingId: booking.id } });
  };
  return (
    <div className="category-page">
      <title>{content.bookings.metaTitle}</title>
      <meta name="robots" content="noindex" />
      <header className="category-page__hero">
        <div className="category-page__hero-inner">
          <div>
            <h1 className="category-page__title"> {content.bookings.title}</h1>
            <p className="category-page__subtitle">  {content.bookings.subtitle}</p>
          </div>
        </div>
      </header>
      <section className="category-page__grid-wrap">
        <div className="category-page__grid-inner">
          {loading ? (
            <p className="loading-state"> {content.bookings.loading}</p>
          ) : error ? (
            <p className="error-state" role="alert">{error}</p>
          ) : bookings.length === 0 ? (
            <div className="category-page__empty">
              <sky-info-card icon="event_busy" heading={content.bookings.empty.title} subheading={content.bookings.empty.description} />
              <FilledButton onClick={() => navigate('/categories')}>{content.bookings.empty.ctaLabel}</FilledButton>
            </div>
          ) : (
            <ul className="entity-list">
              {bookings.map((booking) => (
                <li key={booking.id}>
                  <div className="entity-list__item">
                    <span className="role-list__name">
                      {bookingDisplayName(booking)}
                      <span className="field-hint">
                        {' '}
                        · {booking.vendor.businessName}
                        · {booking.branch.name}
                        · {content.bookings.currency}{booking.priceSnapshot}
                        {booking.durationMinutesSnapshot &&
                          ` · ${booking.durationMinutesSnapshot} ${content.bookings.durationSuffix}`}
                        {' '}
                        · {formatBookingSchedule(booking.bookingDate, booking.timeSlot)}
                      </span>
                    </span>
                    <span className={`status-pill ${booking.status === 'CANCELLED' ? 'status-pill--inactive' : 'status-pill--active'}`}>
                      {booking.status}
                    </span>
                  </div>
                  {booking.cancellationReason && <p className="error-state"> {content.bookings.cancelledPrefix} {booking.cancellationReason}</p>}
                  {(booking.status === 'PENDING' || booking.status === 'CONFIRMED') && (
                    <div className="page-head__actions">
                      <FilledButton onClick={() => orderNow(booking)}> {content.bookings.actions.createOrder}</FilledButton>
                      <OutlinedButton onClick={() => cancel(booking)}> {content.bookings.actions.cancelBooking}</OutlinedButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <Link to="/cart" className="field-hint"> {content.bookings.links.cart}</Link>{' '}
      <Link to="/orders" className="field-hint">{content.bookings.links.orders}</Link>
    </div>
  );
}
export default Bookings;

import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FilledButton, OutlinedButton, Icon, Divider, OutlinedTextField, Radio } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  checkout,
  createOrderFromBooking,
  getMyOrder,
  pay,
  payCod,
  verifyPayment,
  type Order,
  type OrderContactDetails,
  type PaymentIntent,
} from '../../../api/orders';
import { ApiRequestError } from '../../../api/rbac/client';
import { loadRazorpayScript } from '../../../utils/razorpay';
import { formatINR } from '../../../utils/format';
import content from '../../../content.json';
import './checkout.css';
const { checkout: checkoutContent } = content;

interface CheckoutLocationState {
  /** Retry payment for an Order that already exists (from the order-detail page's "Pay now"). */
  orderId?: string;
  /** Create a SERVICE order from an existing Booking ("Create order" on My Bookings). */
  bookingId?: string;
  /** Neither set = the default PRODUCT path: create an order from the caller's current Cart. */
}

type Step = 'details' | 'payment';
type PaymentMethod = 'online' | 'cod';

type FieldErrors = Partial<Record<keyof OrderContactDetails, string>>;

/**
 * The one real checkout — Phase 8's Order creation (Cart or Booking) followed by Phase 9's
 * Razorpay payment. Restored the "Customer Details" step ahead of payment (this file's own
 * `.checkout-steps`/`.checkout-form__fields`/`.checkout-form__field-wrapper` CSS classes were
 * never deleted from the earlier multi-step design — only unused since the Phase 9 rewrite
 * dropped them — so this reuses them rather than inventing new ones). The order's live pricing
 * summary sidebar (already always shown next to Payment) serves as the "review" — no separate
 * review screen was added, since the existing layout already puts every line item + total in
 * front of the customer before they pay. A "Date & Time" step is still correctly omitted: a
 * SERVICE order's date/time was already captured at Booking-creation time; a PRODUCT order never
 * had one.
 */
export function Checkout() {
  const { token, bootstrap } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as CheckoutLocationState;
  const isRetryPayment = !!state.orderId;

  const [step, setStep] = useState<Step>(isRetryPayment ? 'payment' : 'details');
  const [order, setOrder] = useState<Order | null>(null);
  const [paymentIntent, setPaymentIntent] = useState<PaymentIntent | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('online');
  const [loading, setLoading] = useState(isRetryPayment);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const initRef = useRef(false);

  // ── Customer Details form state — pre-filled from the caller's own profile (bootstrap.user)
  // once it loads; no separate Address API exists yet, so shipping fields start blank. ─────────
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [shippingCity, setShippingCity] = useState('');
  const [shippingState, setShippingState] = useState('');
  const [shippingPincode, setShippingPincode] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [detailsSubmitting, setDetailsSubmitting] = useState(false);
  const prefilledRef = useRef(false);

  useEffect(() => {
    if (prefilledRef.current || !bootstrap?.user) return;
    prefilledRef.current = true;
    setContactName(bootstrap.user.name ?? '');
    setContactPhone((bootstrap.user.phone ?? '').replace(/^\+91/, ''));
    setContactEmail(bootstrap.user.email ?? '');
  }, [bootstrap]);

  // Retry-payment path only ("Pay now" from order-detail) — fetches the already-existing order
  // directly and skips the Customer Details step entirely (details were already captured, or
  // predate this step, when the order was first created).
  useEffect(() => {
    if (initRef.current) return; // guards against a duplicate call under React StrictMode's double-invoke
    initRef.current = true;
    const { orderId } = state;
    if (!orderId) return;

    (async () => {
      setLoading(true);
      setError('');
      try {
        const currentOrder = (await getMyOrder(token, orderId)).data;
        setOrder(currentOrder);
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : 'Could not start checkout.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once an order exists and is still unpaid, lazily create a Razorpay intent — only while
  // Online is the selected method, so choosing COD never wastes a Razorpay API call.
  useEffect(() => {
    if (!order || order.status !== 'PENDING_PAYMENT' || paymentMethod !== 'online' || paymentIntent) return;
    (async () => {
      setError('');
      try {
        const intent = (await pay(token, order.id)).data;
        setPaymentIntent(intent);
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : 'Could not prepare payment.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, paymentMethod]);

  function validateDetails(): boolean {
    const errors: FieldErrors = {};
    if (!contactName.trim()) errors.contactName = 'Name is required.';
    if (!/^[6-9]\d{9}$/.test(contactPhone.trim())) errors.contactPhone = 'Enter a valid 10-digit mobile number.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) errors.contactEmail = 'Enter a valid email address.';
    if (!shippingAddress.trim()) errors.shippingAddress = 'Address is required.';
    if (!shippingCity.trim()) errors.shippingCity = 'City is required.';
    if (!shippingState.trim()) errors.shippingState = 'State is required.';
    if (!/^\d{6}$/.test(shippingPincode.trim())) errors.shippingPincode = 'Enter a valid 6-digit pincode.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  const submitDetails = async () => {
    if (!validateDetails()) return;
    setDetailsSubmitting(true);
    setError('');
    const contactDetails: OrderContactDetails = {
      contactName: contactName.trim(),
      contactPhone: contactPhone.trim(),
      contactEmail: contactEmail.trim(),
      shippingAddress: shippingAddress.trim(),
      shippingCity: shippingCity.trim(),
      shippingState: shippingState.trim(),
      shippingPincode: shippingPincode.trim(),
    };
    try {
      const currentOrder = state.bookingId
        ? (await createOrderFromBooking(token, state.bookingId, contactDetails)).data
        : (await checkout(token, contactDetails)).data;
      setOrder(currentOrder);
      setStep('payment');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not start checkout.');
    } finally {
      setDetailsSubmitting(false);
    }
  };

  const openRazorpay = async () => {
    if (!order || !paymentIntent) return;
    setError('');
    setPaying(true);
    try {
      await loadRazorpayScript();
      if (!window.Razorpay) throw new Error('Payment gateway unavailable.');
      const rzp = new window.Razorpay({
        key: paymentIntent.keyId,
        order_id: paymentIntent.providerOrderId,
        amount: Math.round(Number(paymentIntent.amount) * 100),
        currency: paymentIntent.currency,
        name: 'MSD',
        description: order.items.map((i) => i.itemName).join(', '),
        theme: { color: '#007C2B' },
        modal: { ondismiss: () => setPaying(false) },
        handler: (response) => {
          verifyPayment(token, order.id, response)
            .then(({ data }) => navigate(`/orders/${data.id}`))
            .catch((err) => {
              setError(
                err instanceof ApiRequestError
                  ? err.message
                  : 'Payment verification failed — if an amount was deducted, contact support with your order id.',
              );
              setPaying(false);
            });
        },
      });
      rzp.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the payment gateway.');
      setPaying(false);
    }
  };

  const placeCodOrder = async () => {
    if (!order) return;
    setError('');
    setPaying(true);
    try {
      const { data } = await payCod(token, order.id);
      navigate(`/orders/${data.id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not place your order. Please try again.');
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="checkout-page checkout-page--empty">
        <title>{content.meta.checkout.title}</title>
        <p className="loading-state">Preparing your order…</p>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="checkout-page checkout-page--empty">
        <title>{content.meta.checkout.title}</title>
        <p className="error-state" role="alert">{error}</p>
        <FilledButton onClick={() => navigate('/categories')}>Back to Categories</FilledButton>
      </div>
    );
  }

  return (
    <div className="checkout-page">
      <title>{content.meta.checkout.title}</title>
      <meta name="description" content={content.meta.checkout.description} />
      <meta name="robots" content="noindex" />

      <div className="checkout-page__inner">
        <header className="checkout-header">
          <h1 className="checkout-header__title">{checkoutContent.title}</h1>

          {!isRetryPayment && (
            <ol className="checkout-steps">
              <li className={`checkout-steps__step${step === 'payment' ? ' checkout-steps__step--done' : ''}`}>
                <span className="checkout-steps__num">{step === 'payment' ? <Icon aria-hidden="true">check</Icon> : 1}</span>
                <span className="checkout-steps__label">{checkoutContent.steps[0]}</span>
              </li>
              <li className={`checkout-steps__step${step === 'payment' ? ' checkout-steps__step--done' : ''}`}>
                <span className="checkout-steps__num">2</span>
                <span className="checkout-steps__label">{checkoutContent.steps[2]}</span>
              </li>
            </ol>
          )}
        </header>

        {step === 'details' ? (
          <div className="checkout-page__layout">
            <main className="checkout-page__form">
              <section aria-labelledby="step-details-heading">
                <h2 id="step-details-heading" className="checkout-form__heading">{checkoutContent.stepHeadings[0]}</h2>

                <div className="checkout-form__fields">
                  <div className="checkout-form__fields checkout-form__fields--row">
                    <div className="checkout-form__field-wrapper">
                      <OutlinedTextField
                        label="Full name"
                        value={contactName}
                        onInput={(e) => setContactName((e.target as unknown as { value: string }).value)}
                      />
                      {fieldErrors.contactName && <p className="checkout-form__error" role="alert">{fieldErrors.contactName}</p>}
                    </div>
                    <div className="checkout-form__field-wrapper">
                      <OutlinedTextField
                        label="Mobile number"
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        value={contactPhone}
                        onInput={(e) => setContactPhone((e.target as unknown as { value: string }).value.replace(/\D/g, '').slice(0, 10))}
                      />
                      {fieldErrors.contactPhone && <p className="checkout-form__error" role="alert">{fieldErrors.contactPhone}</p>}
                    </div>
                  </div>

                  <div className="checkout-form__field-wrapper">
                    <OutlinedTextField
                      label="Email"
                      type="email"
                      value={contactEmail}
                      onInput={(e) => setContactEmail((e.target as unknown as { value: string }).value)}
                    />
                    {fieldErrors.contactEmail && <p className="checkout-form__error" role="alert">{fieldErrors.contactEmail}</p>}
                  </div>

                  <div className="checkout-form__field-wrapper">
                    <OutlinedTextField
                      label="Address"
                      value={shippingAddress}
                      onInput={(e) => setShippingAddress((e.target as unknown as { value: string }).value)}
                    />
                    {fieldErrors.shippingAddress && <p className="checkout-form__error" role="alert">{fieldErrors.shippingAddress}</p>}
                  </div>

                  <div className="checkout-form__fields checkout-form__fields--row">
                    <div className="checkout-form__field-wrapper">
                      <OutlinedTextField
                        label="City"
                        value={shippingCity}
                        onInput={(e) => setShippingCity((e.target as unknown as { value: string }).value)}
                      />
                      {fieldErrors.shippingCity && <p className="checkout-form__error" role="alert">{fieldErrors.shippingCity}</p>}
                    </div>
                    <div className="checkout-form__field-wrapper">
                      <OutlinedTextField
                        label="State"
                        value={shippingState}
                        onInput={(e) => setShippingState((e.target as unknown as { value: string }).value)}
                      />
                      {fieldErrors.shippingState && <p className="checkout-form__error" role="alert">{fieldErrors.shippingState}</p>}
                    </div>
                    <div className="checkout-form__field-wrapper">
                      <OutlinedTextField
                        label="Pincode"
                        inputMode="numeric"
                        maxLength={6}
                        value={shippingPincode}
                        onInput={(e) => setShippingPincode((e.target as unknown as { value: string }).value.replace(/\D/g, '').slice(0, 6))}
                      />
                      {fieldErrors.shippingPincode && <p className="checkout-form__error" role="alert">{fieldErrors.shippingPincode}</p>}
                    </div>
                  </div>
                </div>

                {error && <p className="error-state" role="alert">{error}</p>}

                <div className="checkout-form__nav">
                  <FilledButton className="checkout-form__next-btn" onClick={submitDetails} disabled={detailsSubmitting}>
                    {detailsSubmitting ? 'Please wait…' : checkoutContent.nextLabel}
                    <Icon slot="trailing-icon" aria-hidden="true">arrow_forward</Icon>
                  </FilledButton>
                </div>
              </section>
            </main>
          </div>
        ) : !order ? null : (
          <div className="checkout-page__layout">
            <main className="checkout-page__form">
              <section aria-labelledby="step-pay-heading">
                <h2 id="step-pay-heading" className="checkout-form__heading">{checkoutContent.stepHeadings[2]}</h2>

                {order.status !== 'PENDING_PAYMENT' ? (
                  <p className="field-hint">This order is already {order.status.toLowerCase()}.</p>
                ) : (
                  <>
                    <div className="checkout-form__group">
                      <p className="checkout-form__group-label">Payment Method</p>
                      <div role="radiogroup" aria-label="Payment method" className="checkout-payment-methods">
                        <label className="checkout-payment-methods__opt">
                          <Radio
                            name="payment-method"
                            checked={paymentMethod === 'online'}
                            onChange={() => setPaymentMethod('online')}
                          />
                          <span>Online Payment (Razorpay)</span>
                        </label>
                        <label className="checkout-payment-methods__opt">
                          <Radio
                            name="payment-method"
                            checked={paymentMethod === 'cod'}
                            onChange={() => setPaymentMethod('cod')}
                          />
                          <span>Cash on Delivery</span>
                        </label>
                      </div>
                    </div>

                    <p className="field-hint">
                      You're paying {formatINR(Number(order.total))} to {order.vendorNameSnapshot} ({order.branchNameSnapshot}).
                    </p>

                    {paymentMethod === 'online' ? (
                      <>
                        <FilledButton className="checkout-form__next-btn" onClick={openRazorpay} disabled={paying || !paymentIntent}>
                          {paying ? 'Opening payment…' : `Pay ${formatINR(Number(order.total))}`}
                          <Icon slot="trailing-icon" aria-hidden="true">arrow_forward</Icon>
                        </FilledButton>
                        <p className="checkout-form__secure">
                          <Icon aria-hidden="true">lock</Icon>
                          Payments are handled securely by Razorpay — card/UPI/netbanking details never touch MSD's servers.
                        </p>
                      </>
                    ) : (
                      <FilledButton className="checkout-form__next-btn" onClick={placeCodOrder} disabled={paying}>
                        {paying ? 'Placing order…' : checkoutContent.placeOrderLabel}
                        <Icon slot="trailing-icon" aria-hidden="true">arrow_forward</Icon>
                      </FilledButton>
                    )}
                  </>
                )}

                {error && <p className="error-state" role="alert">{error}</p>}
              </section>
            </main>

            <aside className="checkout-page__summary" aria-label="Order summary">
              <sky-card variant="outlined">
                <div className="checkout-summary">
                  <h2 className="checkout-summary__heading">{checkoutContent.orderSummaryHeading}</h2>
                  <ul className="checkout-summary__items">
                    {order.items.map((item) => (
                      <li key={item.id} className="checkout-summary__item">
                        <div>
                          <p className="checkout-summary__item-title">{item.itemName}</p>
                          <p className="checkout-summary__item-qty">
                            × {item.quantity}
                            {item.durationMinutes && ` · ${item.durationMinutes} min`}
                          </p>
                        </div>
                        <p className="checkout-summary__item-price">{formatINR(Number(item.lineTotal))}</p>
                      </li>
                    ))}
                  </ul>
                  <Divider />
                  <div className="checkout-summary__total">
                    <strong>{content.cart.total}</strong>
                    <strong>{formatINR(Number(order.total))}</strong>
                  </div>
                  {order.shippingAddress && (
                    <>
                      <Divider />
                      <p className="field-hint">
                        Delivering to {order.contactName} · {order.shippingAddress}, {order.shippingCity} {order.shippingPincode}
                      </p>
                    </>
                  )}
                </div>
              </sky-card>
              {!isRetryPayment && (
                <OutlinedButton onClick={() => setStep('details')}>{checkoutContent.backLabel}</OutlinedButton>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
export default Checkout;

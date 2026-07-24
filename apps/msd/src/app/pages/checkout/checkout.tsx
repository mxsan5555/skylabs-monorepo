import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FilledButton,
  OutlinedButton,
  OutlinedTextField,
  FilterChip,
  ChipSet,
  Icon,
  LinearProgress,
  Divider,
  SkyCardReact,
} from '@skylabs-monorepo/shared-ui/react';
import { useCart } from '../../../cart/cart-context';
import { useCartDeals } from '../../../hooks/use-cart-deals';
import { useAuth } from '../../../auth/auth-context';
import { checkoutApi, type AvailabilitySlot } from '../../../api/checkout-api';
import { ApiError } from '../../../api/api-client';
import { formatINR, inputValue } from '../../../utils/format';
import type { CheckoutStep } from '../../../types';
import content from '../../../content.json';
import './checkout.css';

const { checkout: checkoutContent } = content;

const STEPS: CheckoutStep[] = ['details', 'datetime', 'payment'];

function stepIndex(s: CheckoutStep) {
  return STEPS.indexOf(s);
}

function buildDates(): { iso: string; label: string }[] {
  const dates: { iso: string; label: string }[] = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push({
      iso: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' }),
    });
  }
  return dates;
}

const DATE_OPTIONS = buildDates();

type PaymentState = 'idle' | 'opening' | 'cancelled' | 'failed' | 'unavailable';

export function Checkout() {
  const { serverCart, clearCart } = useCart();
  const { cartDeals, subtotal } = useCartDeals();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<CheckoutStep>('details');
  const [placed, setPlaced] = useState(false);

  // Step 1 — details
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [email, setEmail] = useState(user?.email ?? '');

  // Step 2 — date/time (a single slot applied to every cart item, matching the
  // existing single-slot checkout UX — per-item scheduling is a later addition).
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Step 3 — payment
  const [paymentState, setPaymentState] = useState<PaymentState>('idle');
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const firstDealSlug = cartDeals[0]?.deal.slug;

  useEffect(() => {
    if (!selectedDate || !firstDealSlug) return;
    setSlotsLoading(true);
    setSelectedTime('');
    checkoutApi
      .availability(firstDealSlug, selectedDate)
      .then((res) => setSlots(res.slots))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [selectedDate, firstDealSlug]);

  const currentStepIdx = stepIndex(step);
  const progress = (currentStepIdx + 1) / STEPS.length;

  function goBack() {
    if (step === 'datetime') setStep('details');
    else if (step === 'payment') setStep('datetime');
  }

  function canProceed() {
    if (step === 'details') return name.trim() && phone.trim() && email.trim();
    if (step === 'datetime') return !!selectedDate && !!selectedTime;
    return true;
  }

  async function startPayment() {
    if (!serverCart || serverCart.items.length === 0) return;
    setPaymentState('opening');
    setPaymentError(null);
    try {
      const items = serverCart.items.map((i) => ({
        cartItemId: i.id,
        bookingDate: selectedDate,
        bookingTime: selectedTime,
      }));
      const res = await checkoutApi.checkout({ name, phone, email }, items);

      const razorpay = new window.Razorpay({
        key: res.payment.keyId,
        order_id: res.payment.providerOrderId,
        amount: res.payment.amount.amount,
        currency: res.payment.amount.currency,
        name: 'MSD — MySpaDeal',
        description: `Order ${res.orderNumber}`,
        prefill: { name, email, contact: phone },
        theme: { color: '#007C2B' },
        handler: async (response) => {
          try {
            await checkoutApi.confirmPayment(res.orderId, response);
            setPlaced(true);
            clearCart();
          } catch {
            setPaymentState('failed');
            setPaymentError('We could not confirm your payment. Please contact support with your order number.');
          }
        },
        modal: {
          ondismiss: () => setPaymentState('cancelled'),
        },
      });
      razorpay.on('payment.failed', (response) => {
        setPaymentState('failed');
        setPaymentError(response.error.description);
      });
      razorpay.open();
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setPaymentState('unavailable');
      } else if (err instanceof ApiError && err.code === 'SLOT_UNAVAILABLE') {
        setPaymentState('failed');
        setPaymentError('That time slot was just taken — please pick another.');
        setStep('datetime');
      } else if (err instanceof ApiError && err.code === 'CART_CHANGED') {
        setPaymentState('failed');
        setPaymentError('Your cart changed — please review it and try again.');
      } else {
        setPaymentState('failed');
        setPaymentError('Something went wrong starting the payment. Please try again.');
      }
    }
  }

  function goNext() {
    if (step === 'details') setStep('datetime');
    else if (step === 'datetime') setStep('payment');
    else startPayment();
  }

  if ((!serverCart || serverCart.items.length === 0) && !placed) {
    return (
      <div className="checkout-page checkout-page--empty">
        <title>Checkout | MSD</title>
        <p>{checkoutContent.emptyCartMessage}</p>
        <FilledButton onClick={() => navigate('/explore')}>
          {content.cart.emptyCtaLabel}
        </FilledButton>
      </div>
    );
  }

  if (placed) {
    return (
      <div className="checkout-page checkout-page--success">
        <title>Booking Confirmed | MSD</title>
        <div className="checkout-success">
          <span className="checkout-success__icon" aria-hidden="true">
            <Icon>check_circle</Icon>
          </span>
          <h1 className="checkout-success__heading">{checkoutContent.successHeading}</h1>
          <p className="checkout-success__body">{checkoutContent.successBody}</p>
          <div className="checkout-form__nav">
            <OutlinedButton onClick={() => navigate('/account/bookings')}>View My Bookings</OutlinedButton>
            <FilledButton onClick={() => navigate('/')}>Back to Home</FilledButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-page">
      <title>{content.meta.checkout.title}</title>
      <meta name="description" content={content.meta.checkout.description} />
      <meta name="robots" content="noindex" />

      <div className="checkout-page__inner">
        {/* ── Step indicator ─────────────────────────────────────────────── */}
        <header className="checkout-header">
          <h1 className="checkout-header__title">{checkoutContent.title}</h1>
          <div className="checkout-steps" role="list" aria-label="Checkout steps">
            {checkoutContent.steps.map((label, i) => (
              <div
                key={label}
                className={`checkout-steps__step${i <= currentStepIdx ? ' checkout-steps__step--done' : ''}`}
                role="listitem"
                aria-current={i === currentStepIdx ? 'step' : undefined}
              >
                <span className="checkout-steps__num" aria-hidden="true">
                  {i < currentStepIdx ? <Icon>check</Icon> : i + 1}
                </span>
                <span className="checkout-steps__label">{label}</span>
              </div>
            ))}
          </div>
          <LinearProgress
            value={progress}
            aria-label={`Step ${currentStepIdx + 1} of ${STEPS.length}`}
          />
        </header>

        <div className="checkout-page__layout">
          {/* ── Step content ─────────────────────────────────────────────── */}
          <main className="checkout-page__form">
            {step === 'details' && (
              <section aria-labelledby="step-details-heading">
                <h2 id="step-details-heading" className="checkout-form__heading">
                  {checkoutContent.stepHeadings[0]}
                </h2>
                <div className="checkout-form__fields">
                  <OutlinedTextField
                    label={checkoutContent.fields.name}
                    type="text"
                    autocomplete="name"
                    required
                    value={name}
                    onInput={(e) => setName(inputValue(e as unknown as Event))}
                  >
                    <Icon slot="leading-icon" aria-hidden="true">person</Icon>
                  </OutlinedTextField>
                  <OutlinedTextField
                    label={checkoutContent.fields.phone}
                    type="tel"
                    autocomplete="tel"
                    required
                    value={phone}
                    onInput={(e) => setPhone(inputValue(e as unknown as Event))}
                  >
                    <Icon slot="leading-icon" aria-hidden="true">phone</Icon>
                  </OutlinedTextField>
                  <OutlinedTextField
                    label={checkoutContent.fields.email}
                    type="email"
                    autocomplete="email"
                    required
                    value={email}
                    onInput={(e) => setEmail(inputValue(e as unknown as Event))}
                  >
                    <Icon slot="leading-icon" aria-hidden="true">mail</Icon>
                  </OutlinedTextField>
                </div>
              </section>
            )}

            {step === 'datetime' && (
              <section aria-labelledby="step-dt-heading">
                <h2 id="step-dt-heading" className="checkout-form__heading">
                  {checkoutContent.stepHeadings[1]}
                </h2>
                <div className="checkout-form__group">
                  <p className="checkout-form__group-label">{checkoutContent.datetimeLabels.selectDate}</p>
                  <ChipSet className="checkout-dt__chips">
                    {DATE_OPTIONS.map((d) => (
                      <FilterChip
                        key={d.iso}
                        label={d.label}
                        selected={selectedDate === d.iso}
                        onClick={() => setSelectedDate(d.iso)}
                      />
                    ))}
                  </ChipSet>
                </div>
                <div className="checkout-form__group">
                  <p className="checkout-form__group-label">{checkoutContent.datetimeLabels.selectTime}</p>
                  {!selectedDate ? (
                    <p className="checkout-form__secure">Pick a date first.</p>
                  ) : slotsLoading ? (
                    <LinearProgress indeterminate aria-label="Loading available times" />
                  ) : slots.length === 0 ? (
                    <p className="checkout-form__secure">No slots available that day — try another date.</p>
                  ) : (
                    <ChipSet className="checkout-dt__chips">
                      {slots.map((s) => (
                        <FilterChip
                          key={s.time}
                          label={s.available ? s.time : `${s.time} (full)`}
                          disabled={!s.available}
                          selected={selectedTime === s.time}
                          onClick={() => setSelectedTime(s.time)}
                        />
                      ))}
                    </ChipSet>
                  )}
                </div>
              </section>
            )}

            {step === 'payment' && (
              <section aria-labelledby="step-pay-heading">
                <h2 id="step-pay-heading" className="checkout-form__heading">
                  {checkoutContent.stepHeadings[2]}
                </h2>

                {paymentState === 'unavailable' && (
                  <SkyCardReact variant="outlined">
                    <p style={{ padding: 16 }}>
                      Online payments aren't configured yet on this environment. Once Razorpay
                      test keys are added to the API's <code>.env.local</code>, this button will
                      open the payment widget.
                    </p>
                  </SkyCardReact>
                )}
                {paymentState === 'cancelled' && (
                  <p className="checkout-form__secure" role="status">
                    Payment window closed — your cart is safe. Tap "Pay now" to try again.
                  </p>
                )}
                {paymentState === 'failed' && paymentError && (
                  <p className="checkout-form__secure" role="alert">
                    {paymentError}
                  </p>
                )}

                <p className="checkout-form__secure">
                  <Icon aria-hidden="true">lock</Icon>
                  {checkoutContent.securePaymentNote}
                </p>
              </section>
            )}

            {/* ── Nav buttons ─────────────────────────────────────────────── */}
            <div className="checkout-form__nav">
              {currentStepIdx > 0 && (
                <OutlinedButton onClick={goBack}>
                  <Icon slot="icon" aria-hidden="true">arrow_back</Icon>
                  {checkoutContent.backLabel}
                </OutlinedButton>
              )}
              <FilledButton
                className="checkout-form__next-btn"
                onClick={goNext}
                disabled={!canProceed() || paymentState === 'opening'}
              >
                {step === 'payment' ? 'Pay now' : checkoutContent.nextLabel}
                <Icon slot="trailing-icon" aria-hidden="true">
                  {step === 'payment' ? 'lock' : 'arrow_forward'}
                </Icon>
              </FilledButton>
            </div>
          </main>

          {/* ── Order summary sidebar ────────────────────────────────────── */}
          <aside className="checkout-page__summary" aria-label="Order summary">
            <SkyCardReact variant="outlined">
              <div className="checkout-summary">
                <h2 className="checkout-summary__heading">{checkoutContent.orderSummaryHeading}</h2>
                <ul className="checkout-summary__items">
                  {cartDeals.map(({ item, deal }) => (
                    <li key={deal.id} className="checkout-summary__item">
                      <img
                        src={deal.image}
                        alt={deal.imageAlt}
                        width={52}
                        height={52}
                        loading="lazy"
                      />
                      <div>
                        <p className="checkout-summary__item-title">{deal.title}</p>
                        <p className="checkout-summary__item-qty">× {item.quantity}</p>
                      </div>
                      <p className="checkout-summary__item-price">
                        {formatINR(deal.price * item.quantity)}
                      </p>
                    </li>
                  ))}
                </ul>
                <Divider />
                <div className="checkout-summary__total">
                  <strong>{content.cart.total}</strong>
                  <strong>{formatINR(subtotal)}</strong>
                </div>
              </div>
            </SkyCardReact>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default Checkout;

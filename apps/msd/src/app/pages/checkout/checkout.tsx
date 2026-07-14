import { useState } from 'react';
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
import { formatINR, inputValue } from '../../../utils/format';
import type { CheckoutStep } from '../../../types';
import content from '../../../content.json';
import './checkout.css';

const { checkout: checkoutContent } = content;

const STEPS: CheckoutStep[] = ['details', 'datetime', 'payment'];

function stepIndex(s: CheckoutStep) {
  return STEPS.indexOf(s);
}

function buildDates(): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(
      d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' }),
    );
  }
  return dates;
}

const DATE_OPTIONS = buildDates();
const TIME_OPTIONS = [
  '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM',
];

export function Checkout() {
  const { items, clearCart } = useCart();
  const { cartDeals, subtotal } = useCartDeals();
  const navigate = useNavigate();
  const [step, setStep] = useState<CheckoutStep>('details');
  const [placed, setPlaced] = useState(false);

  // Step 1 — details
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Step 2 — date/time
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');

  // Step 3 — payment
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardName, setCardName] = useState('');

  const currentStepIdx = stepIndex(step);
  const progress = (currentStepIdx + 1) / STEPS.length;

  function goNext() {
    if (step === 'details') setStep('datetime');
    else if (step === 'datetime') setStep('payment');
    else {
      setPlaced(true);
      clearCart();
    }
  }

  function goBack() {
    if (step === 'datetime') setStep('details');
    else if (step === 'payment') setStep('datetime');
  }

  function canProceed() {
    if (step === 'details') return name.trim() && phone.trim() && email.trim();
    if (step === 'datetime') return !!selectedDate && !!selectedTime;
    if (step === 'payment') return cardNumber.trim() && expiry.trim() && cvv.trim() && cardName.trim();
    return false;
  }

  if (items.length === 0 && !placed) {
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
          <FilledButton onClick={() => navigate('/')}>Back to Home</FilledButton>
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
                        key={d}
                        label={d}
                        selected={selectedDate === d}
                        onClick={() => setSelectedDate(d)}
                      />
                    ))}
                  </ChipSet>
                </div>
                <div className="checkout-form__group">
                  <p className="checkout-form__group-label">{checkoutContent.datetimeLabels.selectTime}</p>
                  <ChipSet className="checkout-dt__chips">
                    {TIME_OPTIONS.map((t) => (
                      <FilterChip
                        key={t}
                        label={t}
                        selected={selectedTime === t}
                        onClick={() => setSelectedTime(t)}
                      />
                    ))}
                  </ChipSet>
                </div>
              </section>
            )}

            {step === 'payment' && (
              <section aria-labelledby="step-pay-heading">
                <h2 id="step-pay-heading" className="checkout-form__heading">
                  {checkoutContent.stepHeadings[2]}
                </h2>
                <div className="checkout-form__fields">
                  <OutlinedTextField
                    label={checkoutContent.fields.cardName}
                    type="text"
                    autocomplete="cc-name"
                    required
                    value={cardName}
                    onInput={(e) => setCardName(inputValue(e as unknown as Event))}
                  >
                    <Icon slot="leading-icon" aria-hidden="true">person</Icon>
                  </OutlinedTextField>
                  <OutlinedTextField
                    label={checkoutContent.fields.cardNumber}
                    type="text"
                    inputmode="numeric"
                    autocomplete="cc-number"
                    required
                    maxlength={19}
                    value={cardNumber}
                    onInput={(e) => setCardNumber(inputValue(e as unknown as Event))}
                  >
                    <Icon slot="leading-icon" aria-hidden="true">credit_card</Icon>
                  </OutlinedTextField>
                  <div className="checkout-form__fields checkout-form__fields--row">
                    <OutlinedTextField
                      label={checkoutContent.fields.expiry}
                      type="text"
                      inputmode="numeric"
                      autocomplete="cc-exp"
                      required
                      maxlength={5}
                      value={expiry}
                      onInput={(e) => setExpiry(inputValue(e as unknown as Event))}
                    />
                    <OutlinedTextField
                      label={checkoutContent.fields.cvv}
                      type="password"
                      inputmode="numeric"
                      autocomplete="cc-csc"
                      required
                      maxlength={4}
                      value={cvv}
                      onInput={(e) => setCvv(inputValue(e as unknown as Event))}
                    />
                  </div>
                </div>
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
                disabled={!canProceed()}
              >
                {step === 'payment' ? checkoutContent.placeOrderLabel : checkoutContent.nextLabel}
                <Icon slot="trailing-icon" aria-hidden="true">
                  {step === 'payment' ? 'check' : 'arrow_forward'}
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

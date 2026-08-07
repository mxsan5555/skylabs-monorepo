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
} from '@skylabs-monorepo/shared-ui/react';
import { useCart } from '../../../cart/cart-context';
import { useCartItems } from "../../../hooks/use-cart-items";
import { formatINR, inputValue } from '../../../utils/format';
import type { CheckoutStep } from '../../../types';
import content from '../../../content.json';
import './checkout.css';
import { saveBooking } from '../../../utils/booking-storage';
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
const validateName = (value: string) =>
  /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/.test(value.trim());

const validatePhone = (value: string) =>
  /^[6-9]\d{9}$/.test(value);

const validateEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const validateCardNumber = (value: string) =>
  /^\d{16}$/.test(value.replace(/\s/g, ''));

const validateExpiry = (value: string) => {
  if (!/^\d{2}\/\d{2}$/.test(value)) return false;

  const [month, year] = value.split('/').map(Number);

  if (month < 1 || month > 12) return false;

  const now = new Date();
  const currentYear = now.getFullYear() % 100;
  const currentMonth = now.getMonth() + 1;

  if (year < currentYear) return false;
  if (year === currentYear && month < currentMonth) return false;

  return true;
};

const validateCvv = (value: string) =>
  /^\d{3,4}$/.test(value);
export function Checkout() {
  const { items, clearCart } = useCart();
  const { cartItems, subtotal } = useCartItems();
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
  const [errors, setErrors] = useState({
    name: '',
    phone: '',
    email: '',
    cardName: '',
    cardNumber: '',
    expiry: '',
    cvv: '',
  });
  function clearError(field: keyof typeof errors) {
    setErrors((prev) => ({
      ...prev,
      [field]: '',
    }));
  }
  function validateDetails() {
    const newErrors = {
      name: '',
      phone: '',
      email: '',
      cardName: '',
      cardNumber: '',
      expiry: '',
      cvv: '',
    };

    if (!name.trim()) {
      newErrors.name = 'Please enter your full name.';
    } else if (!validateName(name)) {
      newErrors.name = 'Please enter a valid name.';
    }

    if (!phone.trim()) {
      newErrors.phone = 'Please enter your mobile number.';
    } else if (!validatePhone(phone)) {
      newErrors.phone = 'Please enter a valid 10-digit mobile number.';
    }

    if (!email.trim()) {
      newErrors.email = 'Please enter your email address.';
    } else if (!validateEmail(email)) {
      newErrors.email = 'Please enter a valid email address.';
    }

    setErrors(newErrors);

    return !newErrors.name && !newErrors.phone && !newErrors.email;
  }
  function validatePayment() {
    const newErrors = {
      name: '',
      phone: '',
      email: '',
      cardName: '',
      cardNumber: '',
      expiry: '',
      cvv: '',
    };

    if (!cardName.trim()) {
      newErrors.cardName = 'Please enter the name on your card.';
    } else if (!validateName(cardName)) {
      newErrors.cardName = 'Please enter a valid cardholder name.';
    }

    if (!cardNumber.trim()) {
      newErrors.cardNumber = 'Please enter your card number.';
    } else if (!validateCardNumber(cardNumber)) {
      newErrors.cardNumber = 'Please enter a valid 16-digit card number.';
    }

    if (!expiry.trim()) {
      newErrors.expiry = 'Please enter your card expiry date.';
    } else if (!validateExpiry(expiry)) {
      newErrors.expiry = 'Please enter a valid, non-expired MM/YY.';
    }

    if (!cvv.trim()) {
      newErrors.cvv = 'Please enter your CVV.';
    } else if (!validateCvv(cvv)) {
      newErrors.cvv = 'CVV must contain 3 or 4 digits.';
    }

    setErrors(newErrors);

    return (
      !newErrors.cardName &&
      !newErrors.cardNumber &&
      !newErrors.expiry &&
      !newErrors.cvv
    );
  }
  function goNext() {
    if (step === 'details') {
      if (!validateDetails()) return;
      setStep('datetime');
    } else if (step === 'datetime') {
      if (!selectedDate || !selectedTime) return;
      setStep('payment');
    } else {
      if (!validatePayment()) return;

      const booking = {
        id: `BK-${Date.now()}`,
        customer: {
          name,
          phone,
          email,
        },
        date: selectedDate,
        time: selectedTime,
        items: cartItems.map((entry) => ({
          type: entry.type,
          id: entry.type === 'deal'
            ? entry.deal.id
            : entry.product.id,
          title: entry.type === 'deal'
            ? entry.deal.title
            : entry.product.name,
          image: entry.type === 'deal'
            ? entry.deal.image
            : entry.product.image,
          imageAlt: entry.type === 'deal'
            ? entry.deal.imageAlt
            : entry.product.imageAlt,
          price: entry.type === 'deal'
            ? entry.deal.price
            : entry.product.price,
          quantity: entry.item.quantity,
        })),
        total: subtotal,
        status: 'confirmed' as const,
        createdAt: new Date().toISOString(),
      };

      saveBooking(booking);
      setPlaced(true);
      clearCart();
    }
  }
  function goBack() {
    if (step === 'datetime') setStep('details');
    else if (step === 'payment') setStep('datetime');
  }

  function canProceed() {
    if (step === 'details') {
      return (
        validateName(name) &&
        validatePhone(phone) &&
        validateEmail(email)
      );
    }

    if (step === 'datetime') {
      return !!selectedDate && !!selectedTime;
    }

    if (step === 'payment') {
      return (
        validateName(cardName) &&
        validateCardNumber(cardNumber) &&
        validateExpiry(expiry) &&
        validateCvv(cvv)
      );
    }

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
          <FilledButton onClick={() => navigate('/account/bookings')}>
            View My Bookings
          </FilledButton>
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
                    onInput={(e) => {
                      const target = e.currentTarget as HTMLInputElement;

                      const value = target.value
                        .replace(/[^A-Za-z\s'-]/g, '')
                        .slice(0, 50);

                      target.value = value;
                      setName(value);
                      clearError('name');
                    }}
                  >
                    <Icon slot="leading-icon" aria-hidden="true">
                      person
                    </Icon>
                  </OutlinedTextField>

                  {errors.name && (
                    <p className="checkout-form__error">
                      {errors.name}
                    </p>
                  )}
                  <OutlinedTextField
                    label={checkoutContent.fields.phone}
                    type="tel"
                    inputMode="numeric"
                    autocomplete="tel"
                    required
                    maxLength={10}
                    value={phone}
                    onInput={(e) => {
                      const target = e.currentTarget as HTMLInputElement;

                      const value = target.value
                        .replace(/\D/g, '')
                        .slice(0, 10);

                      target.value = value;
                      setPhone(value);
                      clearError('phone');
                    }}
                  >
                    <Icon slot="leading-icon" aria-hidden="true">
                      phone
                    </Icon>
                  </OutlinedTextField>

                  {errors.phone && (
                    <p className="checkout-form__error">
                      {errors.phone}
                    </p>
                  )}
                  <OutlinedTextField
                    label={checkoutContent.fields.email}
                    type="email"
                    autocomplete="email"
                    required
                    value={email}
                    onInput={(e) => {
                      const target = e.currentTarget as HTMLInputElement;
                      setEmail(target.value);
                      clearError('email');
                    }}
                  >
                    <Icon slot="leading-icon" aria-hidden="true">
                      mail
                    </Icon>
                  </OutlinedTextField>

                  {errors.email && (
                    <p className="checkout-form__error">
                      {errors.email}
                    </p>
                  )}
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
                    onInput={(e) => {
                      const target = e.currentTarget as HTMLInputElement;

                      const value = target.value
                        .replace(/[^A-Za-z\s'-]/g, '')
                        .slice(0, 50);

                      target.value = value;
                      setCardName(value);
                      clearError('cardName');
                    }}
                  >
                    <Icon slot="leading-icon" aria-hidden="true">
                      person
                    </Icon>
                  </OutlinedTextField>

                  {errors.cardName && (
                    <p className="checkout-form__error">
                      {errors.cardName}
                    </p>
                  )}
                  <OutlinedTextField
                    label={checkoutContent.fields.cardNumber}
                    type="text"
                    inputMode="numeric"
                    autocomplete="cc-number"
                    required
                    maxLength={16}
                    value={cardNumber}
                    onInput={(e) => {
                      const target = e.currentTarget as HTMLInputElement;

                      const value = target.value
                        .replace(/\D/g, '')
                        .slice(0, 16);

                      target.value = value;
                      setCardNumber(value);
                      clearError('cardNumber');
                    }}
                  >
                    <Icon slot="leading-icon" aria-hidden="true">
                      credit_card
                    </Icon>
                  </OutlinedTextField>

                  {errors.cardNumber && (
                    <p className="checkout-form__error">
                      {errors.cardNumber}
                    </p>
                  )}
                  <div className="checkout-form__fields checkout-form__fields--row">
                    <div className="checkout-form__field-wrapper">
                      <OutlinedTextField
                        label={checkoutContent.fields.expiry}
                        type="text"
                        inputMode="numeric"
                        autocomplete="cc-exp"
                        required
                        maxLength={5}
                        value={expiry}
                        onInput={(e) => {
                          const target = e.currentTarget as HTMLInputElement;

                          const digits = target.value
                            .replace(/\D/g, '')
                            .slice(0, 4);

                          const value =
                            digits.length > 2
                              ? `${digits.slice(0, 2)}/${digits.slice(2)}`
                              : digits;

                          target.value = value;
                          setExpiry(value);
                          clearError('expiry');
                        }}
                      />

                      {errors.expiry && (
                        <p className="checkout-form__error">
                          {errors.expiry}
                        </p>
                      )}
                    </div>

                    <div className="checkout-form__field-wrapper">
                      <OutlinedTextField
                        label={checkoutContent.fields.cvv}
                        type="password"
                        inputMode="numeric"
                        autocomplete="cc-csc"
                        required
                        maxLength={4}
                        value={cvv}
                        onInput={(e) => {
                          const target = e.currentTarget as HTMLInputElement;

                          const value = target.value
                            .replace(/\D/g, '')
                            .slice(0, 4);

                          target.value = value;
                          setCvv(value);
                          clearError('cvv');
                        }}
                      />

                      {errors.cvv && (
                        <p className="checkout-form__error">
                          {errors.cvv}
                        </p>
                      )}
                    </div>
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
            <sky-card variant="outlined">
              <div className="checkout-summary">
                <h2 className="checkout-summary__heading">{checkoutContent.orderSummaryHeading}</h2>
                <ul className="checkout-summary__items">
                  {cartItems.map((entry) => {
                    const data = entry.type === 'deal' ? entry.deal! : entry.product!;
                    return (
                      <li
                        key={entry.type === 'deal' ? entry.deal!.id : entry.product!.id}
                        className="checkout-summary__item"
                      >
                        <img
                          src={data.image}
                          alt={entry.type === 'deal' ? entry.deal!.imageAlt : entry.product!.name}
                          width={52}
                          height={52}
                          loading="lazy"
                        />
                        <div>
                          <p className="checkout-summary__item-title">{entry.type === 'deal' ? entry.deal!.title : entry.product!.name}</p>
                          <p className="checkout-summary__item-qty">× {entry.item.quantity}</p>
                        </div>
                        <p className="checkout-summary__item-price">
                          {formatINR((entry.type === 'deal' ? entry.deal!.price : entry.product!.price) * entry.item.quantity)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
                <Divider />
                <div className="checkout-summary__total">
                  <strong>{content.cart.total}</strong>
                  <strong>{formatINR(subtotal)}</strong>
                </div>
              </div>
            </sky-card>
          </aside>
        </div>
      </div>
    </div>
  );
}
export default Checkout;

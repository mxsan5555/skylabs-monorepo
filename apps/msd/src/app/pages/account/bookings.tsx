import { useEffect, useState } from 'react';
import { FilledButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { useNavigate } from 'react-router-dom';
import { AdminPage } from '../../admin/admin-page';
import { getBookings } from '../../../utils/booking-storage';
import { formatINR } from '../../../utils/format';
import type { Booking } from '../../../types';
import './bookings.css';
import content from '../../../content.json';

const { bookings: bookingsContent } = content;
export default function Bookings() {
    const navigate = useNavigate();
    const [bookings, setBookings] = useState<Booking[]>([]);
    useEffect(() => { setBookings(getBookings()); }, []);
    return (
        <>
            <title>{bookingsContent.metaTitle}</title>
            <meta name="robots" content="noindex" />
            <AdminPage
                title="My Bookings"
                subtitle="View and manage your spa bookings."
            >
                <section className="bookings-page">
                    <header className="bookings-page__header">
                        <div>
                            <h1 className="bookings-page__title">{bookingsContent.title}</h1>
                            <p className="bookings-page__subtitle">   {bookingsContent.subtitle} </p>
                        </div>
                        {bookings.length > 0 && (
                            <FilledButton onClick={() => navigate('/explore')}>
                                <Icon slot="leading-icon" aria-hidden="true">  add </Icon>
                                {bookingsContent.bookAnotherLabel}
                            </FilledButton>
                        )}
                    </header>
                    {bookings.length === 0 ? (
                        <div className="bookings-empty">
                            <div className="bookings-empty__icon" aria-hidden="true">
                                <Icon>calendar_month</Icon>
                            </div>
                            <h2 className="bookings-empty__title"> {bookingsContent.empty.title} </h2>
                            <p className="bookings-empty__text"> {bookingsContent.empty.description} </p>
                            <FilledButton onClick={() => navigate('/explore')}> {bookingsContent.empty.ctaLabel} </FilledButton>
                        </div>
                    ) : (
                        <div className="bookings-list">
                            {bookings.map((booking) => (
                                <article key={booking.id} className="booking-card"
                                >
                                    <header className="booking-card__header">
                                        <div className="booking-card__heading">
                                            <span className="booking-card__label">{bookingsContent.card.bookingIdLabel}</span>
                                            <h2 className="booking-card__id">{booking.id} </h2>
                                        </div>
                                        <span className="booking-card__status">
                                            <Icon aria-hidden="true">check_circle</Icon>
                                            {booking.status}
                                        </span>
                                    </header>
                                    <div className="booking-card__details">
                                        <div className="booking-card__detail">
                                            <Icon aria-hidden="true"> calendar_month </Icon>
                                            <div>
                                                <span>{bookingsContent.card.dateLabel}</span>
                                                <strong>{booking.date}</strong>
                                            </div>
                                        </div>
                                        <div className="booking-card__detail">
                                            <Icon aria-hidden="true"> schedule </Icon>
                                            <div>
                                                <span>{bookingsContent.card.timeLabel}</span>
                                                <strong>{booking.time}</strong>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="booking-card__divider" />
                                    <div className="booking-card__services">
                                        <h3 className="booking-card__section-title"> {bookingsContent.card.servicesTitle}</h3>
                                        <div className="booking-card__items">
                                            {booking.items.map((item) => (
                                                <div
                                                    key={`${booking.id}-${item.type}-${item.id}`}
                                                    className="booking-item"
                                                >
                                                    <img
                                                        src={item.image}
                                                        alt={item.imageAlt}
                                                        className="booking-item__image"
                                                        width={72}
                                                        height={72}
                                                        loading="lazy"
                                                    />
                                                    <div className="booking-item__content">
                                                        <h4 className="booking-item__title">{item.title}</h4>
                                                        <span className="booking-item__quantity"> {bookingsContent.card.quantityLabel}:{' '} {item.quantity}</span>
                                                    </div>
                                                    <strong className="booking-item__price">
                                                        {formatINR(item.price * item.quantity,)}
                                                    </strong>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <footer className="booking-card__footer">
                                        <span> {bookingsContent.card.totalLabel}</span>
                                        <strong>{formatINR(booking.total)}</strong>
                                    </footer>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </AdminPage>
        </>
    );
}



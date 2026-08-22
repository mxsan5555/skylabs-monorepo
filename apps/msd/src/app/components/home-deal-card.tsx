import type { Deal } from '../../types';
import { DealCard } from './deal-card';
import './home-deal-card.css';
import '@skylabs-monorepo/shared-ui/carousel';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { useRef } from 'react';
interface HomeDealCardProps {
    deal: Deal;
    favoriteActive: boolean;
    onFavorite: () => void;
}

export function HomeDealCard({
    deal,
    favoriteActive,
    onFavorite,
}: HomeDealCardProps) {
    const swiperRef = useRef<any>(null);
    return (
        <div className="home-deal-card">
            <div className="home-deal-card__image">
                <swiper-container
                    ref={swiperRef}
                    navigation="false"
                    pagination="false"
                    loop="true"
                    grab-cursor="true"
                >
                    {(deal.gallery?.length ? deal.gallery : [deal.image]).map((image) => (
                        <swiper-slide key={image}>
                            <img
                                src={image}
                                alt={deal.imageAlt}
                            />
                        </swiper-slide>
                    ))}
                </swiper-container>
                <button
                    className="slider-btn slider-btn--prev"
                    onClick={() => swiperRef.current?.swiper.slidePrev()}
                >
                    <Icon>arrow_circle_left</Icon>
                </button>

                <button
                    className="slider-btn slider-btn--next"
                    onClick={() => swiperRef.current?.swiper.slideNext()}
                >
                    <Icon>arrow_circle_right</Icon>
                </button>
            </div>

            <DealCard
                deal={deal}
                favoriteActive={favoriteActive}
                onFavorite={onFavorite}
            />
        </div>
    );
}
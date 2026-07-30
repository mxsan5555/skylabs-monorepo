import { SkyProductCardWC } from './sky-product-card-wc';
import type { Deal } from '../../types';
import { formatINR } from '../../utils/format';

interface DealCardProps {
  deal: Deal;
  favoriteActive: boolean;
  onFavorite: () => void;
}

export function DealCard({
  deal,
  favoriteActive,
  onFavorite,
}: DealCardProps) {
  return (
    <SkyProductCardWC
      image={deal.image}
      imageAlt={deal.imageAlt}
      badge={deal.badge}
      favorite
      favoriteActive={favoriteActive}
      onFavorite={onFavorite}
      eyebrow={deal.providerName}
      heading={deal.title}
      location={deal.location}
      distance={`${deal.distance} km`}
      rating={deal.rating}
      reviews={deal.reviews}
      originalPrice={
        deal.originalPrice
          ? formatINR(deal.originalPrice)
          : undefined
      }
      price={formatINR(deal.price)}
      discount={
        deal.discount
          ? `-${deal.discount}%`
          : undefined
      }
      priceNote={deal.priceNote}
      href={`/deal/${deal.slug}`}
    />
  );
}

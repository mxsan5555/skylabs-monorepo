import { SkyProductCardReact } from '@skylabs-monorepo/shared-ui/react';
import type { Deal } from '../../types';
import { formatINR } from '../../utils/format';

interface DealCardProps {
  deal: Deal;
  favoriteActive: boolean;
  onFavorite: () => void;
}

export function DealCard({ deal, favoriteActive, onFavorite }: DealCardProps) {
  return (
    <SkyProductCardReact
      image={deal.image}
      imageAlt={deal.imageAlt}
      badge={deal.badge}
      heading={deal.title}
      eyebrow={deal.providerName}
      location={`${deal.duration} ${deal.durationUnit}`}
      price={formatINR(deal.price)}
      originalPrice={deal.originalPrice ? formatINR(deal.originalPrice) : undefined}
      rating={deal.rating}
      reviews={deal.reviews}
      favorite={true}
      favoriteActive={favoriteActive}
      href={`/deal/${deal.id}`}
      onFavorite={onFavorite}
    />
  );
}

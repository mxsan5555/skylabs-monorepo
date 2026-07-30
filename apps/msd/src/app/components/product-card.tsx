import { useRef } from 'react';
import '@skylabs-monorepo/shared-ui/carousel';
import { SkyProductCardReact, FilledTonalIconButton, Icon, FilledButton, } from '@skylabs-monorepo/shared-ui/react';
import type { Product } from '../../types';
import { formatINR } from '../../utils/format';
import './product-card.css';
import '@skylabs-monorepo/shared-ui';
interface ProductCardProps {
    product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
    const swiperRef = useRef<any>(null);
    const discount =
        product.originalPrice > product.price
            ? Math.round(
                ((product.originalPrice - product.price) /
                    product.originalPrice) *
                100
            )
            : 0;

    return (
        <sky-product-card
            imageAlt={product.name}
            eyebrow={product.brand}
            heading={product.name}
            rating={product.rating}
            reviews={product.reviews}
            originalPrice={formatINR(product.originalPrice)}
            price={formatINR(product.price)}
            discount={discount ? `-${discount}%` : undefined}
            href={`/products/${product.slug}`}
        >
            <div slot="media" className="product-card-slider">
                <swiper-container
                    ref={swiperRef}
                    navigation={false}
                    pagination={false}
                    loop={true}
                    grab-cursor={true}
                >
                    {(product.gallery?.length
                        ? product.gallery
                        : [product.image]
                    ).map((img) => (
                        <swiper-slide key={img}>
                            <img
                                src={img}
                                alt={product.name}
                                className="product-card__image"
                            />
                        </swiper-slide>
                    ))}
                </swiper-container>

                <FilledTonalIconButton
                    className="slider-btn slider-btn--prev"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        swiperRef.current?.swiper.slidePrev();
                    }}
                >
                    <Icon>navigate_before</Icon>
                </FilledTonalIconButton>

                <FilledTonalIconButton
                    className="slider-btn slider-btn--next"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        swiperRef.current?.swiper.slideNext();
                    }}
                >
                    <Icon>navigate_next</Icon>
                </FilledTonalIconButton>
            </div>
            <FilledButton
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    window.open(product.affiliateUrl, '_blank');
                }}
            >
                Buy Now
            </FilledButton>
        </sky-product-card>

    );
}

export default ProductCard;
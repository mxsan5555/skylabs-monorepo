import type { Product } from '../types';
import Toner from '../assets/toner.jpg';
import Toner1 from '../assets/toner1.jpg';
import Toner2 from '../assets/toner2.jpg';
import Toner3 from '../assets/toner3.jpg';
import Toner4 from '../assets/toner4.jpg';
import Suns from '../assets/suns.jpg';
import Suns1 from '../assets/suns1.jpg';
import Suns2 from '../assets/suns2.jpg';
import Suns3 from '../assets/suns3.jpg';
import Suns4 from '../assets/suns4.jpg';
import Suns5 from '../assets/suns5.jpg';
import Serum from '../assets/serum.jpg';
import Serum1 from '../assets/serum1.jpg';
import Serum2 from '../assets/serum2.jpg';
import Serum3 from '../assets/serum3.jpg';
import Serum4 from '../assets/serum4.jpg';
import Cream from '../assets/cream.jpg';
import Cream1 from '../assets/cream1.jpg';
import Cream2 from '../assets/cream2.jpg';
import Cream3 from '../assets/cream3.jpg';
export const products: Product[] = [
    {
        id: "1",
        slug: "vitamin-c-face-serum",
        name: "Vitamin C Face Serum",
        brand: "Celigin",
        image: Toner,
        gallery: [Toner, Toner1, Toner2, Toner3, Toner4],
        price: 699,
        originalPrice: 999,
        rating: 4.8,
        reviews: 154,
        category: "Skin Care",
        shortDescription: "Brightening serum",
        description:
            "Vitamin C Face Serum helps brighten dull skin while reducing pigmentation.",

        benefits: [
            "Brightens skin",
            "Reduces pigmentation",
            "Hydrates skin",
            "Suitable for all skin types"
        ],

        ingredients: [
            "Vitamin C",
            "Hyaluronic Acid",
            "Niacinamide"
        ],

        howToUse: [
            "Cleanse your face.",
            "Apply 2-3 drops.",
            "Massage gently.",
            "Use sunscreen during daytime."
        ],
        affiliateUrl: "https://www.celiginglobal.com/"
    },
    {
        id: "2",
        slug: "hydrating-face-sunscreen",
        name: "Hydrating Face Sunscreen",
        brand: "Celigin",
        image: Suns,
        gallery: [Suns, Suns1, Suns2, Suns3, Suns4, Suns5],
        price: 799,
        originalPrice: 1099,
        rating: 4.9,
        reviews: 210,
        category: "Skin Care",
        shortDescription: "Deep hydration",
        description:
            "Vitamin C Face Serum helps brighten dull skin while reducing pigmentation.",

        benefits: [
            "Brightens skin",
            "Reduces pigmentation",
            "Hydrates skin",
            "Suitable for all skin types"
        ],

        ingredients: [
            "Vitamin C",
            "Hyaluronic Acid",
            "Niacinamide"
        ],

        howToUse: [
            "Cleanse your face.",
            "Apply 2-3 drops.",
            "Massage gently.",
            "Use sunscreen during daytime."
        ],
        affiliateUrl: "https://www.celiginglobal.com/"
    },

    {
        id: "3",
        slug: "daily-face-serum",
        name: "Daily Face serum",
        brand: "Celigin",
        image: Serum,
        gallery: [Serum, Serum1, Serum2, Serum3, Serum4],
        price: 499,
        originalPrice: 699,
        rating: 4.6,
        reviews: 93,
        category: "Serum",
        shortDescription: "Gentle serum",
        description:
            "Vitamin C Face Serum helps brighten dull skin while reducing pigmentation.",

        benefits: [
            "Brightens skin",
            "Reduces pigmentation",
            "Hydrates skin",
            "Suitable for all skin types"
        ],

        ingredients: [
            "Vitamin C",
            "Hyaluronic Acid",
            "Niacinamide"
        ],

        howToUse: [
            "Cleanse your face.",
            "Apply 2-3 drops.",
            "Massage gently.",
            "Use sunscreen during daytime."
        ],
        affiliateUrl: "https://www.celiginglobal.com/"
    },
    {
        id: "4",
        slug: "face-cream",
        name: "Face cream",
        brand: "Celigin",
        image: Cream,
        gallery: [Cream, Cream1, Cream2, Cream3],
        price: 499,
        originalPrice: 699,
        rating: 4.6,
        reviews: 93,
        category: "Serum",
        shortDescription: "Gentle serum",
        description:
            "Vitamin C Face Serum helps brighten dull skin while reducing pigmentation.",

        benefits: [
            "Brightens skin",
            "Reduces pigmentation",
            "Hydrates skin",
            "Suitable for all skin types"
        ],

        ingredients: [
            "Vitamin C",
            "Hyaluronic Acid",
            "Niacinamide"
        ],

        howToUse: [
            "Cleanse your face.",
            "Apply 2-3 drops.",
            "Massage gently.",
            "Use sunscreen during daytime."
        ],
        affiliateUrl: "https://www.celiginglobal.com/"
    }
];
export function getProductBySlug(slug: string) {
    return products.find((p) => p.slug === slug);
}
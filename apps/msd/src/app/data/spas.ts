export interface Spa {
  id: number;
  name: string;
  duration: string;
  tag?: string;
  image: string[];
  imageAlt: string;
  badge: string;
  eyebrow: string;
  heading: string;
  location: string;
  city: string;
  distance: string;
  rating: number;
  reviews: number;
  originalPrice: string;
  price: string;
  discount: string;
  priceNote: string;
  description: string;
  highlights: string[];
  amenities: string[];
  services: string[];
  terms: string[];
  timings: {
    day: string;
    open: string;
    close: string;
  }[];
  faqs: {
  question: string;
  answer: string;
}[];
  lat: number;
  lng: number;

}
export const spas: Spa[] = [
  {
    id: 1,
    name: 'Swedish Massage',
    duration: '60 Minutes',
    tag: 'Best Value',
    image: ['https://picsum.photos/seed/spa/600/400',
      'https://picsum.photos/seed/spa1/900/600',
      'https://picsum.photos/seed/spa2/900/600',
      'https://picsum.photos/seed/spa3/900/600',
    ],
    imageAlt: 'Massage therapy',
    badge: 'Popular Gift',
    eyebrow: 'Just Relax Spa',
    heading: 'Enjoy a 90-minute VIP facial and body massage package',
    location: 'Sector 55, Noida, Uttar Pradesh',
    city: 'Noida',
    distance: '4.5 km',
    rating: 4.8,
    reviews: 520,
    originalPrice: '₹3,499',
    price: '₹2,499',
    discount: '-29%',
    priceNote: 'Weekend Special Offer',
    description:
      "Relax with a luxurious 90-minute body massage designed to reduce stress and improve circulation.",
    highlights: [
      "90-minute massage session",
      "Steam bath included",
      "Complimentary herbal tea",
      "Certified therapists",
    ],
    amenities: [
      'Free Parking',
      'Air Conditioned Rooms',
      'Steam Bath',
      'Free WiFi',
      'Couple Room',
      'Premium Oils',
      'Certified Therapists',
      'Herbal Tea',
    ],
    services: [
      'Swedish Massage',
      'Deep Tissue Massage',
      'Head Massage',
      'Foot Massage',
      'Aromatherapy',
      'Body Scrub',
    ],

    terms: [
      'Prior appointment is mandatory.',
      'Valid for one person only.',
      'Cancellation allowed up to 24 hours before appointment.',
      'Offer cannot be combined with other discounts.',
      'Government taxes may apply.',
    ],
    timings: [
  { day: 'Monday', open: '10:00 AM', close: '09:00 PM' },
  { day: 'Tuesday', open: '10:00 AM', close: '09:00 PM' },
  { day: 'Wednesday', open: '10:00 AM', close: '09:00 PM' },
  { day: 'Thursday', open: '10:00 AM', close: '09:00 PM' },
  { day: 'Friday', open: '10:00 AM', close: '09:00 PM' },
  { day: 'Saturday', open: '10:00 AM', close: '10:00 PM' },
  { day: 'Sunday', open: '10:00 AM', close: '08:00 PM' },
],

faqs: [
  {
    question: 'Do I need to book an appointment?',
    answer:
      'Yes, we recommend booking your appointment in advance to ensure availability.',
  },
  {
    question: 'Is parking available?',
    answer:
      'Yes, complimentary parking is available for all customers.',
  },
  {
    question: 'Can I reschedule my appointment?',
    answer:
      'Yes, appointments can be rescheduled up to 24 hours before your scheduled time.',
  },
  {
    question: 'Are couples packages available?',
    answer:
      'Yes, we offer special couple spa packages. Please check the available packages while booking.',
  },
  {
    question: 'What should I bring to my appointment?',
    answer:
      'Just bring a valid ID and arrive 10–15 minutes early. Towels, robes, and toiletries are provided.',
  },
],
    lat: 28.5706,
    lng: 77.3272,
  },

  {
    id: 2,
    name: 'Premium Massage',
    duration: '90 Minutes',
    tag: 'Most Popular',
    image: ['https://picsum.photos/seed/noidaspa1/600/400'],
    imageAlt: 'Luxury spa in Noida',
    badge: 'Top Rated',
    eyebrow: 'Aroma Wellness Spa',
    heading: 'Full Body Massage & Aromatherapy Session',
    location: 'Sector 18, Noida, Uttar Pradesh',
    city: 'Noida',
    distance: '3.2 km',
    rating: 4.8,
    reviews: 542,
    originalPrice: '₹3,500',
    price: '₹2,499',
    discount: '-29%',
    priceNote: 'Weekend Special Offer',
    description:
      'Escape the stress of everyday life with a rejuvenating spa experience. Enjoy a relaxing massage using premium oils in a peaceful and hygienic environment.',

    highlights: [
      '90-minute full body massage',
      'Steam bath included',
      'Professional certified therapist',
      'Complimentary herbal tea',
      'Private treatment room',
    ],
    amenities: [
      'Free Parking',
      'Air Conditioned Rooms',
      'Steam Bath',
      'Free WiFi',
      'Couple Room',
      'Premium Oils',
      'Certified Therapists',
      'Herbal Tea',
    ],
    services: [
      'Swedish Massage',
      'Deep Tissue Massage',
      'Head Massage',
      'Foot Massage',
      'Aromatherapy',
      'Body Scrub',
    ],

    terms: [
      'Prior appointment is mandatory.',
      'Valid for one person only.',
      'Cancellation allowed up to 24 hours before appointment.',
      'Offer cannot be combined with other discounts.',
      'Government taxes may apply.',
    ],
    timings: [
  { day: 'Monday', open: '10:00 AM', close: '09:00 PM' },
  { day: 'Tuesday', open: '10:00 AM', close: '09:00 PM' },
  { day: 'Wednesday', open: '10:00 AM', close: '09:00 PM' },
  { day: 'Thursday', open: '10:00 AM', close: '09:00 PM' },
  { day: 'Friday', open: '10:00 AM', close: '09:00 PM' },
  { day: 'Saturday', open: '10:00 AM', close: '10:00 PM' },
  { day: 'Sunday', open: '10:00 AM', close: '08:00 PM' },
],

faqs: [
  {
    question: 'Do I need to book an appointment?',
    answer:
      'Yes, we recommend booking your appointment in advance to ensure availability.',
  },
  {
    question: 'Is parking available?',
    answer:
      'Yes, complimentary parking is available for all customers.',
  },
  {
    question: 'Can I reschedule my appointment?',
    answer:
      'Yes, appointments can be rescheduled up to 24 hours before your scheduled time.',
  },
  {
    question: 'Are couples packages available?',
    answer:
      'Yes, we offer special couple spa packages. Please check the available packages while booking.',
  },
  {
    question: 'What should I bring to my appointment?',
    answer:
      'Just bring a valid ID and arrive 10–15 minutes early. Towels, robes, and toiletries are provided.',
  },
],
    lat: 28.5689,
    lng: 77.3248,
  },

  {
    id: 3,
    name: 'Couple Spa',
    duration: '120 Minutes',
    tag: 'Special Offer',
    image: ['https://picsum.photos/seed/noidaspa2/600/400'],
    imageAlt: 'Premium spa in Noida',
    badge: 'Couple Package',
    eyebrow: 'Royal Thai Spa',
    heading: 'Couple Spa Therapy with Steam & Jacuzzi',
    location: 'Sector 62, Noida, Uttar Pradesh',
    city: 'Noida',
    distance: '5.8 km',
    rating: 4.6,
    reviews: 389,
    originalPrice: '₹5,000',
    price: '₹3,799',
    discount: '-24%',
    priceNote: 'Free Herbal Tea Included',
    description:
      'Escape the stress of everyday life with a rejuvenating spa experience. Enjoy a relaxing massage using premium oils in a peaceful and hygienic environment.',

    highlights: [
      '90-minute full body massage',
      'Steam bath included',
      'Professional certified therapist',
      'Complimentary herbal tea',
      'Private treatment room',
    ],
    amenities: [
      'Free Parking',
      'Air Conditioned Rooms',
      'Steam Bath',
      'Free WiFi',
      'Couple Room',
      'Premium Oils',
      'Certified Therapists',
      'Herbal Tea',
    ],
    timings: [
  { day: 'Monday', open: '10:00 AM', close: '09:00 PM' },
  { day: 'Tuesday', open: '10:00 AM', close: '09:00 PM' },
  { day: 'Wednesday', open: '10:00 AM', close: '09:00 PM' },
  { day: 'Thursday', open: '10:00 AM', close: '09:00 PM' },
  { day: 'Friday', open: '10:00 AM', close: '09:00 PM' },
  { day: 'Saturday', open: '10:00 AM', close: '10:00 PM' },
  { day: 'Sunday', open: '10:00 AM', close: '08:00 PM' },
],

faqs: [
  {
    question: 'Do I need to book an appointment?',
    answer:
      'Yes, we recommend booking your appointment in advance to ensure availability.',
  },
  {
    question: 'Is parking available?',
    answer:
      'Yes, complimentary parking is available for all customers.',
  },
  {
    question: 'Can I reschedule my appointment?',
    answer:
      'Yes, appointments can be rescheduled up to 24 hours before your scheduled time.',
  },
  {
    question: 'Are couples packages available?',
    answer:
      'Yes, we offer special couple spa packages. Please check the available packages while booking.',
  },
  {
    question: 'What should I bring to my appointment?',
    answer:
      'Just bring a valid ID and arrive 10–15 minutes early. Towels, robes, and toiletries are provided.',
  },
],
    lat: 28.6282,
    lng: 77.3649,
  },

  {
    id: 4,
    image: ['https://picsum.photos/seed/blueterra-spa/600/400'],
    imageAlt: 'Spa Bangalore',
    badge: 'Best Seller',
    eyebrow: 'Blue Terra Spa',
    heading: 'Signature Balinese Massage & Wellness Therapy',
    location: 'Indiranagar, Bengaluru, Karnataka',
    city: 'Bengaluru',
    distance: '2.8 km',
    rating: 4.6,
    reviews: 315,
    originalPrice: '₹2,999',
    price: '₹2,199',
    discount: '-27%',
    priceNote: 'Limited Time Offer',
    description:
      'Escape the stress of everyday life with a rejuvenating spa experience. Enjoy a relaxing massage using premium oils in a peaceful and hygienic environment.',

    highlights: [
      '90-minute full body massage',
      'Steam bath included',
      'Professional certified therapist',
      'Complimentary herbal tea',
      'Private treatment room',
    ],
    lat: 12.9784,
    lng: 77.6408,
  },

  {
    id: 5,
    image: ['https://picsum.photos/seed/fourfountains-mumbai/600/400'],
    imageAlt: 'Spa Mumbai',
    badge: 'Luxury Experience',
    eyebrow: 'Four Fountains De-Stress Spa',
    heading: 'Luxury Relaxation Massage with Body Polish',
    location: 'Powai, Mumbai, Maharashtra',
    city: 'Mumbai',
    distance: '5.1 km',
    rating: 4.7,
    reviews: 610,
    originalPrice: '₹4,299',
    price: '₹3,299',
    discount: '-23%',
    priceNote: 'Premium Wellness Package',
    description:
      'Escape the stress of everyday life with a rejuvenating spa experience. Enjoy a relaxing massage using premium oils in a peaceful and hygienic environment.',

    highlights: [
      '90-minute full body massage',
      'Steam bath included',
      'Professional certified therapist',
      'Complimentary herbal tea',
      'Private treatment room',
    ],
    lat: 19.1176,
    lng: 72.9060,
  },
  {
    id: 6,
    image: ['https://picsum.photos/seed/spa6/600/400'],
    imageAlt: 'Luxury spa',
    badge: 'Top Rated',
    eyebrow: 'Serenity Wellness Spa',
    heading: 'Deep Tissue Massage & Relaxation Therapy',
    location: 'Sector 75, Noida, Uttar Pradesh',
    city: 'Noida',
    distance: '2.1 km',
    rating: 4.7,
    reviews: 412,
    originalPrice: '₹3,200',
    price: '₹2,399',
    discount: '-25%',
    priceNote: 'Weekday Offer',
    description:
      'Escape the stress of everyday life with a rejuvenating spa experience. Enjoy a relaxing massage using premium oils in a peaceful and hygienic environment.',

    highlights: [
      '90-minute full body massage',
      'Steam bath included',
      'Professional certified therapist',
      'Complimentary herbal tea',
      'Private treatment room',
    ],
    lat: 28.5765,
    lng: 77.3876,
  },
  {
    id: 7,
    image: ['https://picsum.photos/seed/spa7/600/400'],
    imageAlt: 'Spa Gurgaon',
    badge: 'Premium',
    eyebrow: 'Urban Retreat Spa',
    heading: 'Aromatherapy Massage & Steam Bath',
    location: 'DLF Phase 3, Gurugram, Haryana',
    city: 'Gurugram',
    distance: '3.4 km',
    rating: 4.8,
    reviews: 589,
    originalPrice: '₹4,000',
    price: '₹2,999',
    discount: '-25%',
    priceNote: 'Free Head Massage',
    description:
      'Escape the stress of everyday life with a rejuvenating spa experience. Enjoy a relaxing massage using premium oils in a peaceful and hygienic environment.',

    highlights: [
      '90-minute full body massage',
      'Steam bath included',
      'Professional certified therapist',
      'Complimentary herbal tea',
      'Private treatment room',
    ],
    lat: 28.4947,
    lng: 77.0910,
  },
  {
    id: 8,
    image: ['https://picsum.photos/seed/spa8/600/400'],
    imageAlt: 'Spa Delhi',
    badge: 'Popular',
    eyebrow: 'Zen Thai Spa',
    heading: 'Traditional Thai Massage Experience',
    location: 'Saket, New Delhi',
    city: 'Delhi',
    distance: '4.0 km',
    rating: 4.6,
    reviews: 356,
    originalPrice: '₹3,800',
    price: '₹2,699',
    discount: '-29%',
    priceNote: 'Limited Seats',
    description:
      'Escape the stress of everyday life with a rejuvenating spa experience. Enjoy a relaxing massage using premium oils in a peaceful and hygienic environment.',

    highlights: [
      '90-minute full body massage',
      'Steam bath included',
      'Professional certified therapist',
      'Complimentary herbal tea',
      'Private treatment room',
    ],
    lat: 28.5245,
    lng: 77.2066,
  },
  {
    id: 9,
    image: ['https://picsum.photos/seed/spa9/600/400'],
    imageAlt: 'Spa Noida',
    badge: 'Hot Deal',
    eyebrow: 'Lotus Healing Spa',
    heading: 'Relaxing Swedish Massage Therapy',
    location: 'Sector 137, Noida, Uttar Pradesh',
    city: 'Noida',
    distance: '3.1 km',
    rating: 4.5,
    reviews: 278,
    originalPrice: '₹2,999',
    price: '₹2,099',
    discount: '-30%',
    priceNote: 'Today Only',
    description:
      'Escape the stress of everyday life with a rejuvenating spa experience. Enjoy a relaxing massage using premium oils in a peaceful and hygienic environment.',

    highlights: [
      '90-minute full body massage',
      'Steam bath included',
      'Professional certified therapist',
      'Complimentary herbal tea',
      'Private treatment room',
    ],
    lat: 28.5094,
    lng: 77.4059,
  },
  {
    id: 10,
    image: ['https://picsum.photos/seed/spa10/600/400'],
    imageAlt: 'Spa Noida',
    badge: 'Premium',
    eyebrow: 'Aura Spa & Wellness',
    heading: 'Luxury Spa With Herbal Treatments',
    location: 'Sector 50, Noida, Uttar Pradesh',
    city: 'Noida',
    distance: '2.8 km',
    rating: 4.8,
    reviews: 610,
    originalPrice: '₹4,299',
    price: '₹3,199',
    discount: '-26%',
    priceNote: 'Premium Package',
    description:
      'Escape the stress of everyday life with a rejuvenating spa experience. Enjoy a relaxing massage using premium oils in a peaceful and hygienic environment.',

    highlights: [
      '90-minute full body massage',
      'Steam bath included',
      'Professional certified therapist',
      'Complimentary herbal tea',
      'Private treatment room',
    ],
    lat: 28.5708,
    lng: 77.3644,
  },
  {
    id: 11,
    image: ['https://picsum.photos/seed/spa11/600/400'],
    imageAlt: 'Spa Delhi',
    badge: 'Popular',
    eyebrow: 'The Wellness Hub',
    heading: 'Signature Body Massage & Steam',
    location: 'Connaught Place, Delhi',
    city: 'Delhi',
    distance: '6.2 km',
    rating: 4.7,
    reviews: 521,
    originalPrice: '₹3,899',
    price: '₹2,799',
    discount: '-28%',
    priceNote: 'Weekend Offer',
    description:
      'Escape the stress of everyday life with a rejuvenating spa experience. Enjoy a relaxing massage using premium oils in a peaceful and hygienic environment.',

    highlights: [
      '90-minute full body massage',
      'Steam bath included',
      'Professional certified therapist',
      'Complimentary herbal tea',
      'Private treatment room',
    ],
    lat: 28.6315,
    lng: 77.2167,
  },
  {
    id: 12,
    image: ['https://picsum.photos/seed/spa12/600/400'],
    imageAlt: 'Spa Gurugram',
    badge: 'Luxury',
    eyebrow: 'Golden Touch Spa',
    heading: 'Hot Stone Massage Experience',
    location: 'Sector 29, Gurugram',
    city: 'Gurugram',
    distance: '4.7 km',
    rating: 4.9,
    reviews: 712,
    originalPrice: '₹5,000',
    price: '₹3,699',
    discount: '-26%',
    priceNote: 'Free Refreshments',
    description:
      'Escape the stress of everyday life with a rejuvenating spa experience. Enjoy a relaxing massage using premium oils in a peaceful and hygienic environment.',

    highlights: [
      '90-minute full body massage',
      'Steam bath included',
      'Professional certified therapist',
      'Complimentary herbal tea',
      'Private treatment room',
    ],
    lat: 28.4682,
    lng: 77.0727,
  },
  {
    id: 13,
    image: ['https://picsum.photos/seed/spa13/600/400'],
    imageAlt: 'Spa Noida',
    badge: 'Best Seller',
    eyebrow: 'Peaceful Escape Spa',
    heading: 'Couple Spa & Jacuzzi Therapy',
    location: 'Sector 104, Noida',
    city: 'Noida',
    distance: '2.4 km',
    rating: 4.6,
    reviews: 402,
    originalPrice: '₹4,499',
    price: '₹3,299',
    discount: '-27%',
    priceNote: 'Couple Special',
    description:
      'Escape the stress of everyday life with a rejuvenating spa experience. Enjoy a relaxing massage using premium oils in a peaceful and hygienic environment.',

    highlights: [
      '90-minute full body massage',
      'Steam bath included',
      'Professional certified therapist',
      'Complimentary herbal tea',
      'Private treatment room',
    ],
    lat: 28.5412,
    lng: 77.3667,
  },
  {
    id: 14,
    image: ['https://picsum.photos/seed/spa14/600/400'],
    imageAlt: 'Spa Delhi',
    badge: 'Trending',
    eyebrow: 'Bliss Spa Studio',
    heading: 'Thai Massage & Wellness Package',
    location: 'Lajpat Nagar, Delhi',
    city: 'Delhi',
    distance: '5.0 km',
    rating: 4.5,
    reviews: 288,
    originalPrice: '₹3,500',
    price: '₹2,499',
    discount: '-29%',
    priceNote: 'Special Savings',
    description:
      'Escape the stress of everyday life with a rejuvenating spa experience. Enjoy a relaxing massage using premium oils in a peaceful and hygienic environment.',

    highlights: [
      '90-minute full body massage',
      'Steam bath included',
      'Professional certified therapist',
      'Complimentary herbal tea',
      'Private treatment room',
    ],
    lat: 28.5677,
    lng: 77.2433,
  },
  {
    id: 15,
    image: ['https://picsum.photos/seed/spa15/600/400'],
    imageAlt: 'Spa Bangalore',
    badge: 'Premium',
    eyebrow: 'Lavender Spa Retreat',
    heading: 'Deep Relaxation Body Therapy',
    location: 'Koramangala, Bengaluru',
    city: 'Bengaluru',
    distance: '4.2 km',
    rating: 4.8,
    reviews: 501,
    originalPrice: '₹4,199',
    price: '₹2,999',
    discount: '-29%',
    priceNote: 'Popular Choice',
    description:
      'Escape the stress of everyday life with a rejuvenating spa experience. Enjoy a relaxing massage using premium oils in a peaceful and hygienic environment.',

    highlights: [
      '90-minute full body massage',
      'Steam bath included',
      'Professional certified therapist',
      'Complimentary herbal tea',
      'Private treatment room',
    ],
    lat: 12.9352,
    lng: 77.6245,
  },
  {
    id: 16,
    image: ['https://picsum.photos/seed/spa16/600/400'],
    imageAlt: 'Spa Mumbai',
    badge: 'Luxury',
    eyebrow: 'Ocean Breeze Spa',
    heading: 'Body Polish & Spa Therapy',
    location: 'Andheri West, Mumbai',
    city: 'Mumbai',
    distance: '3.8 km',
    rating: 4.7,
    reviews: 444,
    originalPrice: '₹4,500',
    price: '₹3,299',
    discount: '-27%',
    priceNote: 'Limited Offer',
    description:
      'Escape the stress of everyday life with a rejuvenating spa experience. Enjoy a relaxing massage using premium oils in a peaceful and hygienic environment.',

    highlights: [
      '90-minute full body massage',
      'Steam bath included',
      'Professional certified therapist',
      'Complimentary herbal tea',
      'Private treatment room',
    ],
    lat: 19.1365,
    lng: 72.8276,
  },
  {
    id: 17,
    image: ['https://picsum.photos/seed/spa17/600/400'],
    imageAlt: 'Spa Noida',
    badge: 'Top Rated',
    eyebrow: 'Harmony Spa',
    heading: 'Aroma Oil Massage Session',
    location: 'Sector 76, Noida',
    city: 'Noida',
    distance: '1.9 km',
    rating: 4.8,
    reviews: 634,
    originalPrice: '₹3,999',
    price: '₹2,899',
    discount: '-28%',
    priceNote: 'Customer Favourite',
    description:
      'Escape the stress of everyday life with a rejuvenating spa experience. Enjoy a relaxing massage using premium oils in a peaceful and hygienic environment.',

    highlights: [
      '90-minute full body massage',
      'Steam bath included',
      'Professional certified therapist',
      'Complimentary herbal tea',
      'Private treatment room',
    ],
    lat: 28.5748,
    lng: 77.3895,
  },
  {
    id: 18,
    image: ['https://picsum.photos/seed/spa18/600/400'],
    imageAlt: 'Spa Delhi',
    badge: 'Popular',
    eyebrow: 'Revive Wellness Spa',
    heading: 'Signature Relaxation Package',
    location: 'Rajouri Garden, Delhi',
    city: 'Delhi',
    distance: '5.7 km',
    rating: 4.6,
    reviews: 320,
    originalPrice: '₹3,699',
    price: '₹2,699',
    discount: '-27%',
    priceNote: 'Limited Time',
    description:
      'Escape the stress of everyday life with a rejuvenating spa experience. Enjoy a relaxing massage using premium oils in a peaceful and hygienic environment.',

    highlights: [
      '90-minute full body massage',
      'Steam bath included',
      'Professional certified therapist',
      'Complimentary herbal tea',
      'Private treatment room',
    ],
    lat: 28.6425,
    lng: 77.1222,
  },
  {
    id: 19,
    image: ['https://picsum.photos/seed/spa19/600/400'],
    imageAlt: 'Spa Gurugram',
    badge: 'Exclusive',
    eyebrow: 'Nature Bliss Spa',
    heading: 'Steam Bath & Massage Combo',
    location: 'Golf Course Road, Gurugram',
    city: 'Gurugram',
    distance: '4.4 km',
    rating: 4.9,
    reviews: 805,
    originalPrice: '₹5,499',
    price: '₹3,999',
    discount: '-27%',
    priceNote: 'Premium Experience',
    description:
      'Escape the stress of everyday life with a rejuvenating spa experience. Enjoy a relaxing massage using premium oils in a peaceful and hygienic environment.',

    highlights: [
      '90-minute full body massage',
      'Steam bath included',
      'Professional certified therapist',
      'Complimentary herbal tea',
      'Private treatment room',
    ],
    lat: 28.4384,
    lng: 77.1025,
  },
  {
    id: 20,
    image: ['https://picsum.photos/seed/spa20/600/400'],
    imageAlt: 'Spa Noida',
    badge: 'Hot Deal',
    eyebrow: 'Elite Spa Lounge',
    heading: 'Thai Massage & Herbal Therapy',
    location: 'Sector 78, Noida',
    city: 'Noida',
    distance: '2.3 km',
    rating: 4.7,
    reviews: 471,
    originalPrice: '₹3,799',
    price: '₹2,699',
    discount: '-29%',
    priceNote: 'Today Only',
    description:
      'Escape the stress of everyday life with a rejuvenating spa experience. Enjoy a relaxing massage using premium oils in a peaceful and hygienic environment.',

    highlights: [
      '90-minute full body massage',
      'Steam bath included',
      'Professional certified therapist',
      'Complimentary herbal tea',
      'Private treatment room',
    ],
    lat: 28.5618,
    lng: 77.3884,
  },
  {
    id: 21,
    image: ['https://picsum.photos/seed/spa21/600/400'],
    imageAlt: 'Spa Delhi',
    badge: 'Trending',
    eyebrow: 'Royal Wellness Spa',
    heading: 'Relaxation Therapy & Steam',
    location: 'Dwarka, Delhi',
    city: 'Delhi',
    distance: '6.0 km',
    rating: 4.5,
    reviews: 290,
    originalPrice: '₹3,200',
    price: '₹2,299',
    discount: '-28%',
    priceNote: 'Best Value',
    description:
      'Escape the stress of everyday life with a rejuvenating spa experience. Enjoy a relaxing massage using premium oils in a peaceful and hygienic environment.',

    highlights: [
      '90-minute full body massage',
      'Steam bath included',
      'Professional certified therapist',
      'Complimentary herbal tea',
      'Private treatment room',
    ],
    lat: 28.5921,
    lng: 77.0461,
  },
  {
    id: 22,
    image: ['https://picsum.photos/seed/spa22/600/400'],
    imageAlt: 'Spa Bangalore',
    badge: 'Premium',
    eyebrow: 'Tranquil Spa Studio',
    heading: 'Balinese Massage Experience',
    location: 'Whitefield, Bengaluru',
    city: 'Bengaluru',
    distance: '3.7 km',
    rating: 4.8,
    reviews: 522,
    originalPrice: '₹4,299',
    price: '₹3,099',
    discount: '-28%',
    priceNote: 'Premium Deal',
    description:
      'Escape the stress of everyday life with a rejuvenating spa experience. Enjoy a relaxing massage using premium oils in a peaceful and hygienic environment.',

    highlights: [
      '90-minute full body massage',
      'Steam bath included',
      'Professional certified therapist',
      'Complimentary herbal tea',
      'Private treatment room',
    ],
    lat: 12.9698,
    lng: 77.7500,
  },
  {
    id: 23,
    image: ['https://picsum.photos/seed/spa23/600/400'],
    imageAlt: 'Spa Mumbai',
    badge: 'Luxury',
    eyebrow: 'Heavenly Spa Retreat',
    heading: 'Luxury Body Massage Package',
    location: 'Bandra West, Mumbai',
    city: 'Mumbai',
    distance: '4.9 km',
    rating: 4.8,
    reviews: 601,
    originalPrice: '₹5,000',
    price: '₹3,699',
    discount: '-26%',
    priceNote: 'Weekend Luxury',
    description:
      'Escape the stress of everyday life with a rejuvenating spa experience. Enjoy a relaxing massage using premium oils in a peaceful and hygienic environment.',

    highlights: [
      '90-minute full body massage',
      'Steam bath included',
      'Professional certified therapist',
      'Complimentary herbal tea',
      'Private treatment room',
    ],
    lat: 19.0596,
    lng: 72.8295,
  },
  {
    id: 24,
    image: ['https://picsum.photos/seed/spa24/600/400'],
    imageAlt: 'Spa Noida',
    badge: 'Popular',
    eyebrow: 'Urban Bliss Spa',
    heading: 'Swedish Massage & Steam Therapy',
    location: 'Sector 150, Noida',
    city: 'Noida',
    distance: '4.1 km',
    rating: 4.6,
    reviews: 361,
    originalPrice: '₹3,499',
    price: '₹2,499',
    discount: '-29%',
    priceNote: 'Popular Package',
    description:
      'Escape the stress of everyday life with a rejuvenating spa experience. Enjoy a relaxing massage using premium oils in a peaceful and hygienic environment.',

    highlights: [
      '90-minute full body massage',
      'Steam bath included',
      'Professional certified therapist',
      'Complimentary herbal tea',
      'Private treatment room',
    ],
    lat: 28.4743,
    lng: 77.4835,
  },
  {
    id: 25,
    image: ['https://picsum.photos/seed/spa25/600/400'],
    imageAlt: 'Spa Gurugram',
    badge: 'Best Seller',
    eyebrow: 'Aura Luxury Spa',
    heading: 'Deep Tissue Massage & Spa Experience',
    location: 'Sector 56, Gurugram',
    city: 'Gurugram',
    distance: '3.5 km',
    rating: 4.9,
    reviews: 730,
    originalPrice: '₹4,899',
    price: '₹3,499',
    discount: '-29%',
    priceNote: 'Most Booked',
    description:
      'Escape the stress of everyday life with a rejuvenating spa experience. Enjoy a relaxing massage using premium oils in a peaceful and hygienic environment.',

    highlights: [
      '90-minute full body massage',
      'Steam bath included',
      'Professional certified therapist',
      'Complimentary herbal tea',
      'Private treatment room',
    ],
    lat: 28.4228,
    lng: 77.1056,
  }
];
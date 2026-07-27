/**
 * Blog data + access functions for msd.
 *
 * Static content for now; the function signatures mirror the future API
 * (`listPosts` → `GET /posts?page`, `getPost` → `GET /posts/:slug`), so swapping
 * to the backend is a one-file change — pages never read the raw array.
 */
import type { BlogCategory, BlogPost, BlogQuery, Paginated } from '../types';

export const PAGE_SIZE = 4;

const CATEGORIES: BlogCategory[] = [
  { id: 'c1', slug: 'wellness', name: 'Wellness' },
  { id: 'c2', slug: 'massage-tips', name: 'Massage Tips' },
  { id: 'c3', slug: 'self-care', name: 'Self-care' },
];

const cover = (seed: string) =>
  `https://picsum.photos/seed/msd-${seed}/800/480`;

const POSTS: BlogPost[] = [
  {
    id: 'p1',
    slug: 'deep-tissue-vs-swedish-massage',
    title: 'Deep tissue vs Swedish massage: which one is right for you?',
    excerpt:
      'Two of the most requested treatments, side by side — how they differ and when to book each.',
    categorySlug: 'massage-tips',
    publishedAt: '2026-05-28',
    coverImage: cover('deep-tissue'),
    imageAlt: 'Therapist performing a back massage',
    author: 'Dr. Anita Rao',
    readMinutes: 6,
    tags: ['deep-tissue', 'swedish', 'beginners'],
    body: [
      {
        type: 'paragraph',
        text: 'Swedish and deep tissue are the two treatments new clients ask about most. They share long, flowing strokes, but the intent and pressure differ enough to matter for your body.',
      },
      { type: 'heading', text: 'How they differ' },
      {
        type: 'list',
        items: [
          'Swedish uses lighter pressure to relax muscles and improve circulation.',
          'Deep tissue targets knots and chronic tension with slower, firmer strokes.',
          'Recovery from deep tissue can include a day of mild soreness.',
        ],
      },
      {
        type: 'paragraph',
        text: 'If you are booking your first session, start with Swedish. Move to deep tissue once you know how your body responds.',
      },
      {
        type: 'quote',
        text: 'The best massage is the one you actually rebook — comfort beats intensity.',
      },
    ],
  },
  {
    id: 'p2',
    slug: 'five-stretches-before-your-appointment',
    title: 'Five gentle stretches to do before your appointment',
    excerpt:
      'A five-minute warm-up that helps your therapist reach deeper tension faster.',
    categorySlug: 'self-care',
    publishedAt: '2026-05-20',
    coverImage: cover('stretches'),
    imageAlt: 'Person stretching on a yoga mat',
    author: 'Marco Bianchi',
    readMinutes: 4,
    tags: ['stretching', 'preparation'],
    body: [
      {
        type: 'paragraph',
        text: 'Arriving a little loose helps your session go further. These five stretches take about five minutes and need no equipment.',
      },
      {
        type: 'list',
        items: [
          'Neck rolls — slow half circles, both directions.',
          'Shoulder shrugs — lift, hold, release.',
          'Seated spinal twist — hold each side for 20 seconds.',
          'Standing forward fold — let your arms hang.',
          'Wrist and ankle circles — ten each way.',
        ],
      },
      {
        type: 'paragraph',
        text: 'Breathe slowly through each one. If anything pinches, ease off — stretching should never hurt.',
      },
    ],
  },
  {
    id: 'p3',
    slug: 'how-often-should-you-get-a-massage',
    title: 'How often should you actually get a massage?',
    excerpt:
      'Weekly, monthly, or only when something hurts — what the evidence and the therapists say.',
    categorySlug: 'wellness',
    publishedAt: '2026-05-12',
    coverImage: cover('frequency'),
    imageAlt: 'Calendar and a rolled towel on a spa table',
    author: 'Dr. Anita Rao',
    readMinutes: 5,
    tags: ['routine', 'wellness'],
    body: [
      {
        type: 'paragraph',
        text: 'There is no single right answer — it depends on your goals, budget, and stress levels. Here is a simple way to think about it.',
      },
      { type: 'heading', text: 'A rough guide' },
      {
        type: 'list',
        items: [
          'General stress relief: once a month.',
          'Active training or chronic pain: every one to two weeks.',
          'A specific injury: follow your therapist or physio plan.',
        ],
      },
      {
        type: 'paragraph',
        text: 'Consistency matters more than frequency. A monthly session you keep beats a weekly one you skip.',
      },
    ],
  },
  {
    id: 'p4',
    slug: 'what-to-expect-at-your-first-session',
    title: 'What to expect at your first session',
    excerpt:
      'From the intake form to aftercare — a calm walkthrough so nothing feels unfamiliar.',
    categorySlug: 'wellness',
    publishedAt: '2026-05-04',
    coverImage: cover('first-session'),
    imageAlt: 'Welcoming spa reception area',
    author: 'Priya Menon',
    readMinutes: 7,
    tags: ['beginners', 'guide'],
    body: [
      {
        type: 'paragraph',
        text: 'A first massage can feel like a lot of unknowns. It does not need to. Here is the whole flow, start to finish.',
      },
      { type: 'heading', text: 'Before you start' },
      {
        type: 'paragraph',
        text: 'You will fill out a short health intake so your therapist can tailor pressure and avoid sensitive areas. Mention anything — recent injuries, allergies to oils, areas to skip.',
      },
      {
        type: 'quote',
        text: 'You stay in control the whole time. “A little lighter” is always a welcome request.',
      },
    ],
  },
  {
    id: 'p5',
    slug: 'reading-the-fine-print-on-spa-deals',
    title: 'Reading the fine print on spa deals',
    excerpt:
      'Codes, blackout dates, and gratuity — how to spot a genuinely good offer.',
    categorySlug: 'self-care',
    publishedAt: '2026-04-26',
    coverImage: cover('deals'),
    imageAlt: 'Close-up of a discount voucher',
    author: 'Marco Bianchi',
    readMinutes: 3,
    tags: ['deals', 'value'],
    body: [
      {
        type: 'paragraph',
        text: 'A headline discount is only as good as its conditions. Three things tell you whether a deal is worth booking.',
      },
      {
        type: 'list',
        items: [
          'Does the price include gratuity, or is it added later?',
          'Are there blackout dates around weekends and holidays?',
          'Is the code single-use, or can you rebook at the same rate?',
        ],
      },
    ],
  },
  {
    id: 'p6',
    slug: 'aftercare-the-24-hours-that-matter',
    title: 'Aftercare: the 24 hours that matter most',
    excerpt:
      'Hydrate, move gently, and skip the gym — small choices that make the benefits last.',
    categorySlug: 'self-care',
    publishedAt: '2026-04-18',
    coverImage: cover('aftercare'),
    imageAlt: 'Glass of water beside a folded towel',
    author: 'Priya Menon',
    readMinutes: 4,
    tags: ['aftercare', 'recovery'],
    body: [
      {
        type: 'paragraph',
        text: 'What you do after a session shapes how good you feel the next day. None of it is complicated.',
      },
      {
        type: 'list',
        items: [
          'Drink water — massage moves fluid around and you will feel it.',
          'Keep moving gently; avoid intense workouts for a day.',
          'Warm bath or heat pad for any tender spots.',
        ],
      },
    ],
  },
];

/**
 * GET /posts?... — filter, sort, paginate. One source of truth for the list grid
 * and its pagination. Pure over the static array; becomes the API call later.
 */
export function queryPosts(q: BlogQuery = {}): Paginated<BlogPost> {
  const {
    search = '',
    sort = 'newest',
    categories = [],
    reading = 'any',
    authors = [],
    tags = [],
    page = 1,
    pageSize = PAGE_SIZE,
  } = q;
  const term = search.trim().toLowerCase();

  const filtered = POSTS.filter((p) => {
    if (term && !`${p.title} ${p.excerpt}`.toLowerCase().includes(term))
      return false;
    if (categories.length && !categories.includes(p.categorySlug)) return false;
    if (authors.length && !authors.includes(p.author)) return false;
    if (tags.length && !p.tags.some((t) => tags.includes(t))) return false;
    if (reading === 'short' && p.readMinutes > 4) return false;
    if (reading === 'long' && p.readMinutes < 5) return false;
    return true;
  });

  filtered.sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title);
    const byDate = a.publishedAt.localeCompare(b.publishedAt);
    return sort === 'oldest' ? byDate : -byDate;
  });

  const start = (page - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
  };
}

/** Facet option lists, derived from the data (no hardcoded lists). */
export function categoryList(): BlogCategory[] {
  return [...CATEGORIES];
}
export function authorList(): string[] {
  return [...new Set(POSTS.map((p) => p.author))].sort();
}
export function tagList(): string[] {
  return [...new Set(POSTS.flatMap((p) => p.tags))].sort();
}

/** GET /posts/:slug */
export function getPost(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}

/** Resolve a category slug to its display name (falls back to the slug). */
export function categoryName(slug: string): string {
  return CATEGORIES.find((c) => c.slug === slug)?.name ?? slug;
}

/** Locale-aware date formatting — one source of truth for both blog pages. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

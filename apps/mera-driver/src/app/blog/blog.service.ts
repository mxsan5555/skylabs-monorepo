import { Injectable } from '@angular/core';
import type {
  BlogCategory,
  BlogPost,
  BlogQuery,
  Paginated,
} from '../models';

/**
 * Blog data + access for mera-driver.
 *
 * Static content for now; the methods mirror the future API (`listPosts` →
 * `GET /posts?page`, `getPost` → `GET /posts/:slug`), so swapping to HttpClient
 * is a one-file change — components never read the raw array.
 */
@Injectable({ providedIn: 'root' })
export class BlogService {
  readonly pageSize = 4;

  private readonly categories: BlogCategory[] = [
    { id: 'c1', slug: 'travel', name: 'Travel' },
    { id: 'c2', slug: 'safety', name: 'Safety' },
    { id: 'c3', slug: 'driver-stories', name: 'Driver Stories' },
  ];

  private readonly posts: BlogPost[] = [
    {
      id: 'p1',
      slug: 'airport-pickups-without-the-stress',
      title: 'Airport pickups without the stress',
      excerpt:
        'Flight delays, meeting points, and wait times — how to make an airport ride effortless.',
      categorySlug: 'travel',
      publishedAt: '2026-05-29',
      coverImage: cover('airport'),
      imageAlt: 'Car waiting outside an airport terminal',
      author: 'Rahul Verma',
      readMinutes: 5,
      tags: ['airport', 'travel', 'tips'],
      body: [
        {
          type: 'paragraph',
          text: 'Airport rides have more moving parts than a normal trip — flights shift, terminals are large, and parking is tight. A little planning removes almost all of the friction.',
        },
        { type: 'heading', text: 'Before you book' },
        {
          type: 'list',
          items: [
            'Add your flight number so the driver can track delays.',
            'Pick a clear meeting point — arrivals curb or a named door.',
            'Allow a few minutes of free wait time for baggage.',
          ],
        },
        {
          type: 'quote',
          text: 'A driver who can see your flight is a driver who is already on the way.',
        },
      ],
    },
    {
      id: 'p2',
      slug: 'what-makes-a-five-star-ride',
      title: 'What makes a five-star ride',
      excerpt:
        'Small touches from both sides that turn an ordinary trip into a great one.',
      categorySlug: 'driver-stories',
      publishedAt: '2026-05-21',
      coverImage: cover('five-star'),
      imageAlt: 'Driver smiling in the rear-view mirror',
      author: 'Sana Kapoor',
      readMinutes: 4,
      tags: ['ratings', 'service'],
      body: [
        {
          type: 'paragraph',
          text: 'Great rides are rarely about the car. They are about the small, human details that make a stranger feel looked after.',
        },
        {
          type: 'list',
          items: [
            'A clean cabin and a quick “where would you like the temperature?”',
            'The route confirmed up front, no surprises.',
            'Help with bags, offered not assumed.',
          ],
        },
      ],
    },
    {
      id: 'p3',
      slug: 'riding-safely-after-dark',
      title: 'Riding safely after dark',
      excerpt:
        'Share your trip, verify the plate, and trust your instincts — a quick safety checklist.',
      categorySlug: 'safety',
      publishedAt: '2026-05-13',
      coverImage: cover('night'),
      imageAlt: 'City street at night with car lights',
      author: 'Rahul Verma',
      readMinutes: 6,
      tags: ['safety', 'night'],
      body: [
        {
          type: 'paragraph',
          text: 'Most trips are uneventful, and a few habits keep them that way — especially late at night.',
        },
        { type: 'heading', text: 'A 30-second checklist' },
        {
          type: 'list',
          items: [
            'Match the car, plate, and driver photo before you get in.',
            'Share your live trip with someone you trust.',
            'Sit in the back and keep a door unlocked.',
          ],
        },
        {
          type: 'paragraph',
          text: 'If anything feels off, you never owe anyone an explanation for ending a trip early.',
        },
      ],
    },
    {
      id: 'p4',
      slug: 'planning-a-multi-stop-day',
      title: 'Planning a multi-stop day',
      excerpt:
        'Errands, meetings, and a school run in one booking — how multi-stop trips work.',
      categorySlug: 'travel',
      publishedAt: '2026-05-05',
      coverImage: cover('multistop'),
      imageAlt: 'Map with several pinned locations',
      author: 'Priya Nair',
      readMinutes: 5,
      tags: ['multi-stop', 'planning'],
      body: [
        {
          type: 'paragraph',
          text: 'When your day has several stops, one booking with a planned route beats three separate rides — for cost and for sanity.',
        },
        {
          type: 'list',
          items: [
            'Add every stop in order before you confirm.',
            'Flag any stop where the driver should wait.',
            'Keep the final destination accurate for the fare estimate.',
          ],
        },
      ],
    },
    {
      id: 'p5',
      slug: 'a-day-in-the-life-of-a-driver',
      title: 'A day in the life of a driver',
      excerpt:
        'From the morning rush to the late shift — what the road looks like from the front seat.',
      categorySlug: 'driver-stories',
      publishedAt: '2026-04-27',
      coverImage: cover('day-in-life'),
      imageAlt: 'Driver checking a phone before a shift',
      author: 'Sana Kapoor',
      readMinutes: 7,
      tags: ['stories', 'community'],
      body: [
        {
          type: 'paragraph',
          text: 'Every shift is a string of short stories — a nervous flyer, a first date, a parent running late. Drivers see a city wake up and wind down.',
        },
        {
          type: 'quote',
          text: 'You are never just moving people from A to B; you are part of their day.',
        },
      ],
    },
    {
      id: 'p6',
      slug: 'understanding-your-fare',
      title: 'Understanding your fare',
      excerpt:
        'Base fare, distance, time, and surge — a plain-English breakdown of what you pay.',
      categorySlug: 'travel',
      publishedAt: '2026-04-19',
      coverImage: cover('fare'),
      imageAlt: 'Phone showing a trip fare estimate',
      author: 'Priya Nair',
      readMinutes: 4,
      tags: ['fares', 'value'],
      body: [
        {
          type: 'paragraph',
          text: 'A fare is just a few simple parts added together. Knowing them makes every estimate easy to read.',
        },
        {
          type: 'list',
          items: [
            'Base fare: a fixed amount for starting the trip.',
            'Distance and time: the bulk of most fares.',
            'Surge: a multiplier when demand is high — shown before you confirm.',
          ],
        },
      ],
    },
  ];

  total(): number {
    return this.posts.length;
  }

  /**
   * GET /posts?... — filter, sort, paginate. One source of truth for the list
   * grid and its pagination. Pure over the static array; becomes the API call.
   */
  queryPosts(q: BlogQuery = {}): Paginated<BlogPost> {
    const {
      search = '',
      sort = 'newest',
      categories = [],
      reading = 'any',
      authors = [],
      tags = [],
      page = 1,
      pageSize = this.pageSize,
    } = q;
    const term = search.trim().toLowerCase();

    const filtered = this.posts.filter((p) => {
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
  categoryList(): BlogCategory[] {
    return [...this.categories];
  }
  authorList(): string[] {
    return [...new Set(this.posts.map((p) => p.author))].sort();
  }
  tagList(): string[] {
    return [...new Set(this.posts.flatMap((p) => p.tags))].sort();
  }

  /** GET /posts/:slug */
  getPost(slug: string): BlogPost | undefined {
    return this.posts.find((p) => p.slug === slug);
  }

  /** Resolve a category slug to its display name (falls back to the slug). */
  categoryName(slug: string): string {
    return this.categories.find((c) => c.slug === slug)?.name ?? slug;
  }
}

function cover(seed: string): string {
  return `https://picsum.photos/seed/mera-${seed}/800/480`;
}

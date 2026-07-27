# Skill: Skylabs Content Management

Writing standards and content locations for msd and mera-driver.

## msd Content Locations
| What | Where |
|------|-------|
| All consumer UI copy | `apps/msd/src/content.json` |
| Deal listings (static) | `apps/msd/src/data/deals.ts` |
| Categories (static) | `apps/msd/src/data/categories.ts` |
| Blog articles | `apps/msd/src/blog/` (JSON or MDX per article) |
| SEO copy (title, description) | Inside each page component |

## mera-driver Content Locations
| What | Where |
|------|-------|
| UI strings | Angular component templates (inline) |
| Page titles | Route `title` field in `app.routes.ts` |
| SEO descriptions | Angular `Meta` service in each component |

## content.json Structure (msd)
Top-level keys map to page sections. Never delete a key without searching all usages first.
```json
{
  "hero": {
    "headline": "Find Your Perfect Massage Deal",
    "subheadline": "Browse 50+ curated wellness deals. Book in under 2 minutes.",
    "ctaLabel": "See deals"
  },
  "categories": {
    "sectionTitle": "Browse by Type",
    "sectionSubtitle": "From Swedish to deep tissue — find your match"
  },
  "deals": {
    "sectionTitle": "Today's Deals",
    "emptyStateMessage": "No deals match your filters. Try adjusting them."
  },
  "footer": {
    "tagline": "Wellness at the right price."
  }
}
```
To add a new section: add a new top-level key with an object of string values.

## Blog Post Schema (msd)
```ts
interface BlogPost {
  slug: string;          // lowercase, hyphens: "5-benefits-of-swedish-massage"
  title: string;         // Max 60 chars for SEO; answers a specific question
  summary: string;       // 140–155 chars; used for cards + meta description
  body: string;          // Markdown; 600–1200 words; H2/H3 structure
  author: string;        // Full name
  publishedAt: string;   // "2026-07-18" (ISO 8601)
  category: string;      // matches a category slug
  tags: string[];        // 3–5 lowercase tags
  image?: string;        // "/assets/blog/slug.jpg"
}
```

### Blog Body Structure
```markdown
## [Key benefit or question — H2]
[2–3 short paragraphs. First paragraph answers the H2 directly.]

## [Second point — H2]
...

## [Practical tips — H2]
- Tip 1 (specific, not vague)
- Tip 2
- Tip 3
```

## Voice Rules (both apps)

### Always
- Active voice: "Book your driver now" not "A driver can be booked"
- Numbers over vague quantities: "14 deals available" not "many deals"
- Specific over generic: "30-minute Swedish massage at ₹999" not "a great deal"
- Direct CTAs: "Book now", "See deals", "Get started" — not "Click here" or "Learn more"
- Contractions are fine: "you'll", "we've", "it's"

### Never
- Em dashes — rewrite with a comma or split into two sentences
- Banned words: delve, leverage, robust, seamless, furthermore, moreover, "it's worth noting", "in today's landscape", "let's dive in", "in conclusion", "unlock the potential", "game-changer", "cutting-edge"
- Passive constructions where active is possible
- Placeholder copy: "Coming soon", "TBD", "Lorem ipsum" — write real copy or leave the field empty

## msd Brand Voice
- Reader: someone who wants to relax, treat themselves, or book a gift
- Tone: warm, caring, trustworthy — like a knowledgeable friend recommending a spa
- Lead with the benefit: "Unwind this weekend" before "Browse 50+ deals"
- Wellness language that feels inviting, not clinical: "ease tension" not "reduce muscle inflammation"

## mera-driver Brand Voice
- Reader: someone who needs a reliable driver, either now or scheduled
- Tone: confident, professional, no-fuss — like a service you can count on
- Lead with speed and reliability: "Your driver in 10 minutes"
- Avoid overly casual language; this is a professional transport service

## Writing Checklist
- [ ] Active voice throughout
- [ ] No banned words or phrases
- [ ] Numbers where any quantity is mentioned
- [ ] CTA is a direct verb phrase
- [ ] Summary/meta description is 140–155 chars
- [ ] Blog H2 headings answer specific questions
- [ ] No placeholder copy remains
- [ ] Brand voice matches the app (warm for msd, professional for mera-driver)

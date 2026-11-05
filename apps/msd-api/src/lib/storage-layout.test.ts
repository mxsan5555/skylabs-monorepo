import { describe, it, expect } from 'vitest';
import { bucketForKey, storageFolder } from './storage-layout';

describe('storage layout (docs/msd/ARCHITECTURE.md §12.3)', () => {
  it('groups everything a member owns under members/<memberId>/', () => {
    expect(storageFolder.memberProfile('m1')).toBe('members/m1/profile');
    expect(storageFolder.memberDeal('m1', 'd1')).toBe('members/m1/deals/d1');
    expect(storageFolder.memberTherapist('m1', 't1')).toBe('members/m1/therapists/t1');
    expect(storageFolder.memberProduct('m1', 'p1')).toBe('members/m1/products/p1');
    expect(storageFolder.memberDocuments('m1')).toBe('members/m1/documents');
  });

  it('has one folder per customer, CTA banner, static content item and master', () => {
    expect(storageFolder.customerProfile('c1')).toBe('customers/c1/profile');
    expect(storageFolder.ctaBanner('b1')).toBe('cta-banners/b1');
    expect(storageFolder.staticContent('blog', 'post1')).toBe('static-content/blog/post1');
    expect(storageFolder.staticContent('about-us', 'a1')).toBe('static-content/about-us/a1');
    expect(storageFolder.master('categories', 'cat1')).toBe('masters/categories/cat1');
  });

  it('puts home slider images under the state slug, or global', () => {
    expect(storageFolder.homeSlider('Uttar Pradesh', 's1')).toBe('home-slider/uttar-pradesh/s1');
    expect(storageFolder.homeSlider(null, 's1')).toBe('home-slider/global/s1');
  });

});

describe('bucketForKey', () => {
  it('sends member documents to the private bucket and everything else to the public one', () => {
    expect(bucketForKey('members/m1/documents/a.pdf')).toBe('private');
    expect(bucketForKey('vendor-documents/m1/a.pdf')).toBe('public');
    expect(bucketForKey('members/m1/deals/d1/a.jpg')).toBe('public');
    expect(bucketForKey('deals/d1/a.jpg')).toBe('public');
  });
});

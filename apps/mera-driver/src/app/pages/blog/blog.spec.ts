import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { Blog } from './blog';
import { BlogService } from '../../blog/blog.service';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Blog Component', () => {
  let component: Blog;
  let routerMock: any;
  let blogServiceMock: any;
  let queryParamsSubject: any;

  beforeEach(() => {
    routerMock = {
      navigate: vi.fn(),
    };

    blogServiceMock = {
      pageSize: 4,
      categoryList: vi.fn().mockReturnValue([
        { id: 'c1', slug: 'travel', name: 'Travel' },
        { id: 'c2', slug: 'safety', name: 'Safety' }
      ]),
      authorList: vi.fn().mockReturnValue(['John Doe', 'Jane Smith']),
      queryPosts: vi.fn().mockReturnValue({
        total: 10,
        items: [
          { id: 'p1', slug: 'post-1', title: 'Post 1', excerpt: 'Excerpt 1', categorySlug: 'travel', publishedAt: '2026-05-29' }
        ]
      })
    };

    // Use a simple mock for queryParamMap observable
    const mockParamMap = convertToParamMap({ page: '1', category: '', sort: 'newest', search: '' });

    TestBed.configureTestingModule({
      providers: [
        Blog,
        { provide: Router, useValue: routerMock },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: of(mockParamMap),
            snapshot: {
              queryParamMap: mockParamMap
            }
          }
        },
        { provide: BlogService, useValue: blogServiceMock },
      ],
    });

    component = TestBed.inject(Blog);
  });

  it('should initialize component and fetch categories and posts list', () => {
    expect(blogServiceMock.categoryList).toHaveBeenCalled();
    expect(component['categories'].length).toBe(2);
    expect(component['items']().length).toBe(1);
    expect(component['items']()[0].title).toBe('Post 1');
    expect(component['totalPosts']()).toBe(10);
    expect(component['totalPages']()).toBe(3); // Math.ceil(10 / 4)
    expect(component['pageNumbers']()).toEqual([1, 2, 3]);
  });

  it('should trigger navigation on goTo page call', () => {
    component['goTo'](2);

    expect(routerMock.navigate).toHaveBeenCalledWith([], {
      relativeTo: expect.any(Object),
      queryParams: { page: 2 },
      queryParamsHandling: 'merge'
    });

    component['goTo'](1);
    expect(routerMock.navigate).toHaveBeenCalledWith([], {
      relativeTo: expect.any(Object),
      queryParams: { page: null }, // page 1 sets queryParam to null for clean URL
      queryParamsHandling: 'merge'
    });
  });

  it('should trigger navigation on onCategoryChange', () => {
    const mockEvent = {
      target: { value: 'safety' }
    } as any as Event;

    component['onCategoryChange'](mockEvent);

    expect(routerMock.navigate).toHaveBeenCalledWith([], {
      relativeTo: expect.any(Object),
      queryParams: { category: 'safety', page: null },
      queryParamsHandling: 'merge'
    });
  });

  it('should trigger navigation on onSortChange', () => {
    const mockEvent = {
      target: { value: 'oldest' }
    } as any as Event;

    component['onSortChange'](mockEvent);

    expect(routerMock.navigate).toHaveBeenCalledWith([], {
      relativeTo: expect.any(Object),
      queryParams: { sort: 'oldest', page: null },
      queryParamsHandling: 'merge'
    });
  });

  it('should trigger navigation on onSearchInput', () => {
    const mockEvent = {
      target: { value: 'driving' }
    } as any as Event;

    component['onSearchInput'](mockEvent);

    expect(routerMock.navigate).toHaveBeenCalledWith([], {
      relativeTo: expect.any(Object),
      queryParams: { search: 'driving', page: null },
      queryParamsHandling: 'merge'
    });
  });
});

import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  computed,
  inject,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { BlogService } from '../../blog/blog.service';
import type { BlogSort } from '../../models';

/**
 * Blog index: paginated article previews. The current page comes from the
 * `?page` query param (bookmarkable). Data comes from BlogService (static now,
 * API later); the component never hardcodes content.
 */
@Component({
  selector: 'md-blog',
  imports: [RouterLink, DatePipe],
  templateUrl: './blog.html',
  styleUrl: './blog.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Blog {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly blog = inject(BlogService);

  private readonly queryPage = toSignal(
    this.route.queryParamMap.pipe(map((p) => Number(p.get('page')) || 1)),
    {
      initialValue:
        Number(this.route.snapshot.queryParamMap.get('page')) || 1,
    },
  );

  private readonly queryCategory = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('category') || '')),
    {
      initialValue:
        this.route.snapshot.queryParamMap.get('category') || '',
    },
  );

  private readonly querySort = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('sort') || 'newest')),
    {
      initialValue:
        this.route.snapshot.queryParamMap.get('sort') || 'newest',
    },
  );

  protected readonly selectedCategory = computed(() => this.queryCategory());
  protected readonly selectedSort = computed(() => this.querySort());

  protected readonly categories = this.blog.categoryList();

  protected readonly queryResult = computed(() => {
    const rawPage = Math.max(1, this.queryPage());
    const cat = this.selectedCategory();
    const s = this.selectedSort() as BlogSort;
    const res = this.blog.queryPosts({
      page: rawPage,
      categories: cat ? [cat] : [],
      sort: s,
    });

    const total = res.total;
    const limit = Math.max(1, Math.ceil(total / this.blog.pageSize));
    if (rawPage > limit && total > 0) {
      return this.blog.queryPosts({
        page: limit,
        categories: cat ? [cat] : [],
        sort: s,
      });
    }
    return res;
  });

  protected readonly items = computed(() => this.queryResult().items);
  protected readonly totalPosts = computed(() => this.queryResult().total);

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalPosts() / this.blog.pageSize)),
  );

  protected readonly page = computed(() =>
    Math.min(Math.max(1, this.queryPage()), this.totalPages()),
  );

  protected readonly pageNumbers = computed(() =>
    Array.from({ length: this.totalPages() }, (_, i) => i + 1),
  );

  protected goTo(n: number): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: n > 1 ? n : null },
      queryParamsHandling: 'merge',
    });
  }

  protected onCategoryChange(event: Event): void {
    const target = event.target as any;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { category: target.value || null, page: null },
      queryParamsHandling: 'merge',
    });
  }

  protected onSortChange(event: Event): void {
    const target = event.target as any;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { sort: target.value === 'newest' ? null : target.value, page: null },
      queryParamsHandling: 'merge',
    });
  }
}

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

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.blog.total() / this.blog.pageSize)),
  );
  protected readonly page = computed(() =>
    Math.min(Math.max(1, this.queryPage()), this.totalPages()),
  );
  protected readonly items = computed(() => this.blog.queryPosts({ page: this.page() }).items);
  protected readonly pageNumbers = computed(() =>
    Array.from({ length: this.totalPages() }, (_, i) => i + 1),
  );

  protected goTo(n: number): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: n > 1 ? { page: n } : {},
    });
  }
}

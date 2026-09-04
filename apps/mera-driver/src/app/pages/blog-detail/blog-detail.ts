import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  computed,
  effect,
  inject,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { BlogService } from '../../blog/blog.service';

/** Blog detail: a single article, looked up by `:slug`. */
@Component({
  selector: 'md-blog-detail',
  imports: [RouterLink, DatePipe],
  templateUrl: './blog-detail.html',
  styleUrl: './blog-detail.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class BlogDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  protected readonly blog = inject(BlogService);

  private readonly slug = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('slug'))),
    { initialValue: this.route.snapshot.paramMap.get('slug') },
  );

  protected readonly post = computed(() => {
    const s = this.slug();
    return s ? this.blog.getPost(s) : undefined;
  });

  constructor() {
    // Per-article SEO title + description (the route can't know the slug's title).
    effect(() => {
      const post = this.post();
      if (post) {
        this.titleService.setTitle(`${post.title} · mera-driver`);
        this.meta.updateTag({ name: 'description', content: post.excerpt });
      } else {
        this.titleService.setTitle('Article not found · mera-driver');
      }
    });
  }
}

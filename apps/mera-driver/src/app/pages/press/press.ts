import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import '@skylabs-monorepo/shared-ui';
import pressDefaults from '../../../../public/data/press.json';

export interface PressArticle {
  id: string;
  image: string;
  snippet: string;
  publisher: string;
  publishedDate: string;
  author?: string;
  readTime?: string;
  tags?: string[];
  content?: string[];
}

export interface PressContent {
  badge: string;
  title: string;
  linkText: string;
  subtitle: string;
  articles: PressArticle[];
}

@Component({
  selector: 'md-press',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './press.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Press implements OnInit {
  private readonly http = inject(HttpClient);

  // Strongly-typed Dynamic Content Signal initialized from JSON defaults
  protected readonly content = signal<PressContent>(pressDefaults as PressContent);

  ngOnInit(): void {
    this.http.get<PressContent>('/data/press.json').subscribe({
      next: (data) => {
        if (data) {
          this.content.set(data);
        }
      },
      error: (err) => {
        console.warn('Failed to load /data/press.json dynamically, fallback to defaults', err);
      },
    });
  }
}

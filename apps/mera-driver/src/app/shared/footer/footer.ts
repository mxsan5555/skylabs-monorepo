import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { RouterLink } from '@angular/router';

/** One link in a footer column. Internal links use `to` (+ optional `fragment`); external / mailto links use `href`. */
interface FooterLink {
  label: string;
  to?: string;
  fragment?: string;
  href?: string;
}

interface FooterColumn {
  heading: string;
  links: FooterLink[];
}

/**
 * Site footer for the marketing shell (PublicLayout).
 *
 * Four columns — Driver, Customer, mera-driver (company), and Get the app
 * (store buttons + language) — over a bottom bar with legal links,
 * copyright, and social icons. Data-driven so columns stay easy to edit.
 */
@Component({
  selector: 'md-footer',
  imports: [RouterLink],
  templateUrl: './footer.html',
  styleUrl: './footer.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Footer {
  protected readonly year = new Date().getFullYear();

  protected readonly columns: FooterColumn[] = [
    {
      heading: 'Driver',
      links: [
        { label: 'Become a Driver', to: '/sign-in' },
        { label: 'Driver requirements', to: '/', fragment: 'requirements' },
        { label: 'Earnings', to: '/', fragment: 'earnings' },
        { label: 'Safety & Trust', to: '/', fragment: 'safety' },
        { label: 'Driver blog', to: '/blog' },
        { label: 'Help', href: 'mailto:hello@mera-driver.app' },
      ],
    },
    {
      heading: 'Customer',
      links: [
        { label: 'Book a ride', to: '/ride' },
        { label: 'Pricing', to: '/', fragment: 'pricing' },
        { label: 'Cities', to: '/', fragment: 'cities' },
        { label: 'Safety & Trust', to: '/', fragment: 'safety' },
        { label: 'Gift a ride', to: '/', fragment: 'gift' },
        { label: 'Help', href: 'mailto:hello@mera-driver.app' },
      ],
    },
    {
      heading: 'mera-driver',
      links: [
        { label: 'About us', to: '/', fragment: 'about' },
        { label: 'Careers', to: '/', fragment: 'careers' },
        { label: 'Blog', to: '/blog' },
        { label: 'Business', to: '/', fragment: 'business' },
        { label: 'Component showcase', to: '/showcase' },
        { label: 'Press', to: '/', fragment: 'press' },
      ],
    },
  ];

  /** Store badges. `href` is a placeholder until the apps ship. */
  protected readonly apps: { label: string; icon: string; href: string }[] = [
    { label: 'Download on the App Store', icon: 'phone_iphone', href: '#' },
    { label: 'Get it on Google Play', icon: 'android', href: '#' },
  ];

  protected readonly social: { label: string; icon: string; href: string }[] = [
    { label: 'mera-driver on X', icon: 'tag', href: '#' },
    { label: 'mera-driver on Instagram', icon: 'photo_camera', href: '#' },
    { label: 'mera-driver on LinkedIn', icon: 'work', href: '#' },
  ];
}

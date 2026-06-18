import { useEffect, useRef, useState } from 'react';
import './showcase.css';
// Opt-in: registers <swiper-container> / <swiper-slide> for the carousel demos.
import '@skylabs-monorepo/shared-ui/carousel';
import {
  applyTheme,
  type ThemeMode,
  FilledButton,
  FilledTonalButton,
  OutlinedButton,
  TextButton,
  ElevatedButton,
  Switch,
  Checkbox,
  Radio,
  OutlinedTextField,
  FilledTextField,
  Dialog,
  ChipSet,
  AssistChip,
  FilterChip,
  Slider,
  LinearProgress,
  CircularProgress,
  Tabs,
  PrimaryTab,
  Icon,
  FilledIconButton,
  List,
  ListItem,
  Divider,
  SkyBadgeReact,
} from '@skylabs-monorepo/shared-ui/react';

/** A Swiper Element instance once registered (has the imperative init API). */
type SwiperEl = HTMLElement & {
  initialize: () => void;
  [key: string]: unknown;
};

/**
 * Apply Swiper params that are OBJECTS (e.g. `pagination: { type: 'fraction' }`).
 *
 * Flat params (slides-per-view, loop, …) work fine as JSX attributes, but React
 * doesn't reliably merge nested `pagination-*` attributes into the pagination
 * object before Swiper auto-initializes. So for object params we render the
 * container with `init="false"`, assign the params as properties, then call
 * `initialize()` — Swiper's documented escape hatch. `params` must be a stable
 * (module-scope) reference so this runs once.
 */
function useSwiperParams(params: Record<string, unknown>) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current as SwiperEl | null;
    if (!el) return;
    Object.assign(el, params);
    el.initialize();
  }, [params]);
  return ref;
}

// Object-param configs for demos 8 and 9 (see useSwiperParams above).
const PAGINATION_DYNAMIC = {
  loop: true,
  pagination: { dynamicBullets: true },
};
const PAGINATION_FRACTION = {
  navigation: true,
  pagination: { type: 'fraction' },
};

/**
 * Demo page for msd. Every control here is a Material 3 web component coming
 * from @skylabs-monorepo/shared-ui, themed by msd's own (green) palette. The
 * toggle calls applyTheme() to switch the <html> theme class live.
 */
export function Showcase() {
  const [mode, setMode] = useState<ThemeMode>('light');
  const dialogRef = useRef<
    HTMLElement & { show: () => void; close: () => void }
  >(null);

  const toggleMode = () => {
    const next: ThemeMode = mode === 'light' ? 'dark' : 'light';
    setMode(next);
    applyTheme(next);
  };

  // Demos 8 & 9 use object params, applied imperatively (see useSwiperParams).
  const dynamicRef = useSwiperParams(PAGINATION_DYNAMIC);
  const fractionRef = useSwiperParams(PAGINATION_FRACTION);

  // Demo slides. `auto` adds a fixed width so `slides-per-view="auto"` works.
  const slideNums = [1, 2, 3, 4, 5, 6, 7, 8];
  const slides = (auto = false) =>
    slideNums.map((n) => (
      <swiper-slide
        key={n}
        className={auto ? 'demo-slide demo-slide--auto' : 'demo-slide'}
      >
        {n}
      </swiper-slide>
    ));

  return (
    <main className="showcase">
      <title>Component showcase · MSD</title>
      <header className="showcase__bar">
        <div className="showcase__title">
          <h1>msd</h1>
          <SkyBadgeReact>M3</SkyBadgeReact>
        </div>
        <label className="showcase__toggle">
          <span>{mode === 'dark' ? 'Dark' : 'Light'}</span>
          <Switch selected={mode === 'dark'} onChange={toggleMode} />
        </label>
      </header>

      <section className="showcase__card">
        <h2>Buttons</h2>
        <div className="showcase__row">
          <FilledButton>Filled</FilledButton>
          <FilledTonalButton>Tonal</FilledTonalButton>
          <ElevatedButton>Elevated</ElevatedButton>
          <OutlinedButton>Outlined</OutlinedButton>
          <TextButton>Text</TextButton>
          <FilledIconButton aria-label="Add to favorites">
            <Icon aria-hidden="true">favorite</Icon>
          </FilledIconButton>
        </div>
      </section>

      <section className="showcase__card">
        <h2>Selection</h2>
        <div className="showcase__row">
          <label className="showcase__inline">
            <Checkbox checked /> Checkbox
          </label>
          <label className="showcase__inline">
            <Radio name="demo" value="a" checked /> Radio A
          </label>
          <label className="showcase__inline">
            <Radio name="demo" value="b" /> Radio B
          </label>
        </div>
        <ChipSet>
          <AssistChip label="Assist" />
          <FilterChip label="Filter" selected />
          <FilterChip label="Another" />
        </ChipSet>
      </section>

      <section className="showcase__card">
        <h2>Inputs</h2>
        <div className="showcase__row">
          <OutlinedTextField label="Outlined" value="Hello" />
          <FilledTextField label="Filled" placeholder="Type here" />
        </div>
        <Slider value={50} ticks labeled aria-label="Demo value" />
      </section>

      <section className="showcase__card">
        <h2>Tabs &amp; Progress</h2>
        <Tabs>
          <PrimaryTab>Overview</PrimaryTab>
          <PrimaryTab>Activity</PrimaryTab>
          <PrimaryTab>Settings</PrimaryTab>
        </Tabs>
        <div className="showcase__row">
          <LinearProgress value={0.6} />
          <CircularProgress value={0.6} />
        </div>
      </section>

      <section className="showcase__card">
        <h2>Dialog</h2>
        <FilledButton onClick={() => dialogRef.current?.show()}>
          Open dialog
        </FilledButton>
        <Dialog ref={dialogRef}>
          <div slot="headline">Themed dialog</div>
          <div slot="content">
            This dialog and every control on this page share msd's green M3
            theme.
          </div>
          <div slot="actions">
            <TextButton onClick={() => dialogRef.current?.close()}>
              Got it
            </TextButton>
          </div>
        </Dialog>
      </section>

      <section className="showcase__card">
        <h2>List</h2>

        <List>
          <ListItem>Fruits</ListItem>
          <Divider />
          <ListItem>Apple</ListItem>
          <ListItem>Banana</ListItem>
          <ListItem>
            <div slot="headline">Cucumber</div>
            <div slot="supporting-text">
              Cucumbers are long green fruits that are just as long as this
              multi-line description
            </div>
          </ListItem>
          <ListItem
            type="link"
            href="https://google.com/search?q=buy+kiwis&tbm=shop"
            target="_blank"
          >
            <div slot="headline">Shop for Kiwis</div>
            <div slot="supporting-text">
              This will link you out in a new tab
            </div>
            <Icon slot="end">open_in_new</Icon>
          </ListItem>
        </List>
      </section>

      <section className="showcase__card">
        <h2>Carousel (Swiper Element)</h2>

        <h3 className="demo-carousel__label">1. Default</h3>
        <swiper-container
          className="demo-carousel"
          navigation="true"
          pagination="true"
        >
          {slides()}
        </swiper-container>

        <h3 className="demo-carousel__label">2. Scrollbar</h3>
        <swiper-container className="demo-carousel" scrollbar="true">
          {slides()}
        </swiper-container>

        <h3 className="demo-carousel__label">3. Space between</h3>
        <swiper-container
          className="demo-carousel"
          slides-per-view="3"
          space-between="30"
        >
          {slides()}
        </swiper-container>

        <h3 className="demo-carousel__label">4. Slides per view: auto</h3>
        <swiper-container
          className="demo-carousel"
          slides-per-view="auto"
          space-between="16"
        >
          {slides(true)}
        </swiper-container>

        <h3 className="demo-carousel__label">5. Scroll container (free mode)</h3>
        <swiper-container
          className="demo-carousel"
          slides-per-view="auto"
          space-between="16"
          free-mode="true"
          scrollbar="true"
        >
          {slides(true)}
        </swiper-container>

        <h3 className="demo-carousel__label">6. Infinite loop</h3>
        <swiper-container
          className="demo-carousel"
          loop="true"
          navigation="true"
          slides-per-view="3"
          space-between="16"
        >
          {slides()}
        </swiper-container>

        <h3 className="demo-carousel__label">7. Grab cursor</h3>
        <swiper-container
          className="demo-carousel"
          grab-cursor="true"
          slides-per-view="3"
          space-between="16"
        >
          {slides()}
        </swiper-container>

        <h3 className="demo-carousel__label">8. Pagination: dynamic</h3>
        <swiper-container ref={dynamicRef} className="demo-carousel" init="false">
          {slides()}
        </swiper-container>

        <h3 className="demo-carousel__label">9. Pagination: fraction</h3>
        <swiper-container
          ref={fractionRef}
          className="demo-carousel"
          init="false"
        >
          {slides()}
        </swiper-container>

        <h3 className="demo-carousel__label">10. Centered + auto</h3>
        <swiper-container
          className="demo-carousel"
          slides-per-view="auto"
          centered-slides="true"
          space-between="16"
        >
          {slides(true)}
        </swiper-container>
      </section>
    </main>
  );
}

export default Showcase;

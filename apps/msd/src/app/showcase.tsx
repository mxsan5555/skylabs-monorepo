import { useRef, useState } from 'react';
import './app.css';
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
  SkyBadgeReact,
} from '@skylabs-monorepo/shared-ui/react';

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
    </main>
  );
}

export default Showcase;

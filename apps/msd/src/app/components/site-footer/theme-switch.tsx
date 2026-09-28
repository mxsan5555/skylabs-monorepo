import { useEffect, useId, useState } from 'react';
import { readThemePreference, setThemePreference, type ThemePreference } from '../../../theme/theme-preference';
import content from '../../../content.json';

const t = content.nav.footer.theme;
const OPTIONS: ThemePreference[] = ['light', 'dark', 'system'];

/** Light / dark / system as a native radio group (keyboard arrows work for free). */
export function ThemeSwitch() {
  const name = useId();
  // Start from the server's value ('light') so hydration matches, then show the saved choice.
  const [value, setValue] = useState<ThemePreference>('light');
  useEffect(() => setValue(readThemePreference()), []);
  return (
    <fieldset className="theme-switch">
      <legend className="label-large">{t.legend}</legend>
      {OPTIONS.map((option) => (
        <label key={option} className="theme-switch__option label-large">
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            onChange={() => {
              setValue(option);
              setThemePreference(option);
            }}
          />
          {t[option]}
        </label>
      ))}
    </fieldset>
  );
}

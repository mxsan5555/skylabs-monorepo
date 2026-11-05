import { createElement, useEffect, useState, type ChangeEvent } from 'react';
import { listCatalogLocations } from '../../../../api/catalog';

export const GLOBAL_LABEL = 'Global / Default';
/** Select value for the Global/Default slider or banners (a select option cannot hold `null`). */
export const GLOBAL_OPTION = '__global__';

/** `undefined` = nothing chosen yet, `null` = Global/Default, a name = that state. */
export type ChosenState = string | null | undefined;

export function toOptionValue(state: ChosenState): string {
  return state === undefined ? '' : state === null ? GLOBAL_OPTION : state;
}

export function fromOptionValue(raw: string): ChosenState {
  return raw === '' ? undefined : raw === GLOBAL_OPTION ? null : raw;
}

/** Every state that has an active branch (the states a deal or product can belong to). */
export function useBranchStates(): string[] {
  const [states, setStates] = useState<string[]>([]);
  useEffect(() => {
    listCatalogLocations()
      .then(({ data }) => setStates([...new Set((data ?? []).map((l) => l.state))].sort()))
      .catch(() => setStates([]));
  }, []);
  return states;
}

/**
 * "Choose the state first" picker shared by the Home hero and CTA banner consoles
 * (docs/msd/PLANNING.md §6, §7): Choose a state, Global / Default, then every state with an
 * active branch.
 */
export function StatePicker({
  states,
  value,
  onChange,
}: {
  states: string[];
  value: ChosenState;
  onChange: (state: ChosenState) => void;
}) {
  const option = (optionValue: string, label: string) =>
    createElement('md-select-option', { key: optionValue || 'none', value: optionValue }, createElement('div', { slot: 'headline' }, label));
  return createElement(
    'md-outlined-select',
    {
      label: 'State',
      required: true,
      'supporting-text': 'Choose the state first',
      value: toOptionValue(value),
      onChange: (e: ChangeEvent<HTMLElement & { value: string }>) => onChange(fromOptionValue(e.currentTarget.value)),
    },
    [option('', 'Choose a state'), option(GLOBAL_OPTION, GLOBAL_LABEL), ...states.map((state) => option(state, state))],
  );
}

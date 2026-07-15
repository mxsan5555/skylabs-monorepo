export const formatINR = (n: number): string =>
  `₹${n.toLocaleString('en-IN')}`;

export const pluralize = (count: number, singular: string, plural = `${singular}s`): string =>
  count === 1 ? singular : plural;

export const inputValue = (e: Event): string =>
  (e.target as unknown as { value: string }).value;

/**
 * Structured logs for msd-api (P2-10): one JSON line per event (`level`, `time`, `event`, then
 * the fields), with every sensitive key redacted at any depth. Never pass a request body or
 * headers wholesale; pass the few fields an operator needs.
 */
export const REDACTED = '[redacted]';
const CIRCULAR = '[circular]';
const MAX_DEPTH = 6;

/** Keys whose values never reach a log, compared lower-case without `_` or `-`. */
const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'password',
  'otp',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'clientsecret',
  'documentnumber',
  'bankaccountnumber',
  'aadhaar',
  'aadhaarnumber',
  'pannumber',
  'signature',
]);

const isSensitive = (key: string) => SENSITIVE_KEYS.has(key.toLowerCase().replace(/[_-]/g, ''));

/** A copy of `value` with sensitive keys masked; errors become `{ name, message, stack }`. */
export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return CIRCULAR;
  if (depth >= MAX_DEPTH) return '[truncated]';
  seen.add(value);
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1, seen));
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => [key, isSensitive(key) ? REDACTED : redact(v, depth + 1, seen)]),
  );
}

/** A request URL with the values of sensitive query params masked. */
export function redactUrl(url: string): string {
  const [path, query] = url.split('?', 2);
  if (!query) return url;
  const params = new URLSearchParams(query);
  for (const key of [...params.keys()]) if (isSensitive(key)) params.set(key, REDACTED);
  return `${path}?${params.toString()}`;
}

type Level = 'info' | 'warn' | 'error';
type Sink = (line: string, level: Level) => void;

const defaultSink: Sink = (line, level) => (level === 'info' ? process.stdout : process.stderr).write(`${line}\n`);
let sink: Sink = defaultSink;

/** Replaces where lines go (tests capture them); `null` restores stdout/stderr. */
export function setLogSink(next: ((line: string, level: Level) => void) | null): void {
  sink = next ?? defaultSink;
}

function write(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const entry = { level, time: new Date().toISOString(), event, ...(redact(fields) as Record<string, unknown>) };
  sink(JSON.stringify(entry), level);
}

export const logger = {
  info: (event: string, fields?: Record<string, unknown>) => write('info', event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => write('warn', event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write('error', event, fields),
};

import type { Driver } from '../../../core/drivers/drivers-api.service';

export interface ResumeField {
  label: string;
  value: string;
}

export interface ResumeSection {
  title: string;
  fields: ResumeField[];
}

function has(v: string | undefined | null): v is string {
  return !!v && v.trim().length > 0;
}

function field(label: string, value: string | undefined | null): ResumeField | null {
  return has(value) ? { label, value } : null;
}

function compact(fields: (ResumeField | null)[]): ResumeField[] {
  return fields.filter((f): f is ResumeField => f !== null);
}

/**
 * Builds the read-only Resume/Profile Preview content from the actual Driver record —
 * shared by the on-screen preview dialog and the print/PDF window, so both always show
 * the same data with no duplication. Never includes staff-only fields (`status`'s
 * underlying verification workflow, `policeVerifiedStatus`/`policeVerifiedNo`,
 * `sourceType`) as *editable* anything — this is read-only either way, but keeping the
 * same field set as the driver's own self-service profile keeps the resume honest about
 * what the driver actually maintains themselves.
 */
export function buildResumeSections(d: Driver): ResumeSection[] {
  return [
    {
      title: 'Basic Information',
      fields: compact([
        field('Full name', `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim()),
        field('Phone', d.phone),
        field('Email', d.email),
        field('Date of birth', d.dob),
        field('Gender', d.gender),
        field('Address', [d.address, d.state, d.country].filter(has).join(', ')),
      ]),
    },
    {
      title: 'KYC / Driver Information',
      fields: compact([
        field('Driving licence no.', d.dlNo),
        field('Licence details', d.licenseDetails),
        field('DL issue date', d.dlIssueDate),
        field('DL expiry date', d.dlExpiryDate),
        field('Vehicle type', d.vehicleType),
        field('Documents on file', [
          ...(d.personalDocs ?? []),
          ...(d.healthDocs ?? []),
          ...(d.educationDocs ?? []),
          ...(d.policeDocs ?? []),
        ]
          .map((doc) => doc.type)
          .filter(has)
          .join(', ')),
      ]),
    },
    {
      title: 'Languages',
      fields: compact([field('Languages spoken', d.language)]),
    },
    {
      title: 'Bank / Payout Details',
      fields: compact([
        field('Payment mode', d.preferredPaymentMode),
        field('Bank name', d.bankName),
        field('Account number', d.bankAccountNo),
        field('IFSC code', d.ifscCode),
        field('UPI ID', d.upiIdOrChequeNo),
      ]),
    },
  ];
}

/** Full standalone HTML document for the print/PDF window — the browser's native
 *  "Save as PDF" print destination is the download mechanism (no new PDF library). */
export function buildResumeHtml(d: Driver): string {
  const sections = buildResumeSections(d);
  const name = `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() || 'Driver';
  const rows = (fields: ResumeField[]) =>
    fields.map((f) => `<tr><th>${escapeHtml(f.label)}</th><td>${escapeHtml(f.value)}</td></tr>`).join('');
  const sectionsHtml = sections
    .filter((s) => s.fields.length > 0)
    .map((s) => `<h2>${escapeHtml(s.title)}</h2><table>${rows(s.fields)}</table>`)
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(name)} — Driver Resume</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 32px; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  .subtitle { color: #555; margin: 0 0 24px; font-size: 13px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.04em; color: #333; margin: 20px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; width: 200px; padding: 4px 8px 4px 0; font-weight: 600; color: #444; vertical-align: top; }
  td { padding: 4px 0; vertical-align: top; }
  .status { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #e8f5e9; color: #2e7d32; font-size: 12px; font-weight: 600; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
  <h1>${escapeHtml(name)}</h1>
  <p class="subtitle">Driver Resume — Status: <span class="status">${escapeHtml(d.status ?? 'Non-Verified')}</span></p>
  ${sectionsHtml}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

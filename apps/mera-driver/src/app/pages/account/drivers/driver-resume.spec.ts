import { buildResumeSections, buildResumeHtml } from './driver-resume';
import type { Driver } from '../../../core/drivers/drivers-api.service';

const BASE: Driver = {
  name: 'Ravi Kumar',
  phone: '9000000000',
  vehicle: '',
  firstName: 'Ravi',
  lastName: 'Kumar',
  status: 'Verified',
  policeVerifiedStatus: 'Yes',
  policeVerifiedNo: 'PV-12345',
  sourceType: 'WalkIn',
};

describe('buildResumeSections', () => {
  it('omits fields that are empty/undefined rather than showing blanks', () => {
    const sections = buildResumeSections(BASE);
    const basic = sections.find((s) => s.title === 'Basic Information')!;
    expect(basic.fields.some((f) => f.label === 'Email')).toBe(false); // no email set
    expect(basic.fields.some((f) => f.label === 'Full name')).toBe(true);
  });

  it('includes populated fields with their real values', () => {
    const driver: Driver = { ...BASE, email: 'ravi@example.com', dob: '1990-01-01' };
    const basic = buildResumeSections(driver).find((s) => s.title === 'Basic Information')!;
    expect(basic.fields).toContainEqual({ label: 'Email', value: 'ravi@example.com' });
    expect(basic.fields).toContainEqual({ label: 'Date of birth', value: '1990-01-01' });
  });

  it('never surfaces staff-only fields (status/police/sourceType) as resume content', () => {
    const sections = buildResumeSections(BASE);
    const allLabels = sections.flatMap((s) => s.fields.map((f) => f.label));
    expect(allLabels).not.toContain('Police Verified Status');
    expect(allLabels).not.toContain('Police Verified No');
    expect(allLabels).not.toContain('Source Type');
  });

  it('aggregates document types from all four document categories', () => {
    const driver: Driver = {
      ...BASE,
      personalDocs: [{ type: 'Aadhaar', regNo: '', file: '' }],
      policeDocs: [{ type: 'PCC', regNo: '', file: '' }],
    };
    const kyc = buildResumeSections(driver).find((s) => s.title === 'KYC / Driver Information')!;
    const docsField = kyc.fields.find((f) => f.label === 'Documents on file');
    expect(docsField?.value).toBe('Aadhaar, PCC');
  });

  it('a driver with no data at all produces only sections with content (none, here)', () => {
    const empty: Driver = { name: '', phone: '', vehicle: '' };
    const sections = buildResumeSections(empty);
    expect(sections.every((s) => s.fields.length === 0)).toBe(true);
  });
});

describe('buildResumeHtml', () => {
  it('produces a standalone HTML document containing the driver name and status', () => {
    const html = buildResumeHtml({ ...BASE, email: 'ravi@example.com' });
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Ravi Kumar');
    expect(html).toContain('Verified');
  });

  it('escapes HTML-significant characters in field values (no injection via driver data)', () => {
    const driver: Driver = { ...BASE, firstName: '<script>alert(1)</script>', lastName: '' };
    const html = buildResumeHtml(driver);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

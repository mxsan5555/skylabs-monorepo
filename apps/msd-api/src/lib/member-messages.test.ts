import { describe, it, expect, vi } from 'vitest';

vi.mock('../config/env', () => ({ env: { supportEmail: 'help@msd.test', supportPhone: '+911234567890' } }));

import {
  suspendedMessage,
  inactiveReadOnlyMessage,
  documentsReminderMessage,
  documentsReminderSubject,
} from './member-messages';
import { REMINDER_COUNT } from '../services/member-reminder-policy';

describe('member messages', () => {
  it('suspended message carries the reason, the support contact and the way back', () => {
    const text = suspendedMessage('Documents not completed');
    expect(text).toContain('suspended');
    expect(text).toContain('Documents not completed');
    expect(text).toContain('help@msd.test');
    expect(text).toContain('+911234567890');
    expect(text).toContain('reactivate');
  });

  it('suspended message still reads well with no reason on record', () => {
    expect(suspendedMessage(null)).toContain('not recorded');
  });

  it('read only message tells the member they can view but not change', () => {
    expect(inactiveReadOnlyMessage()).toMatch(/view only/i);
  });
});

describe('documents reminder message', () => {
  const dueAt = new Date('2026-10-15T04:30:00Z');

  it('names the step, the exact documents, the due date and the support contact', () => {
    const text = documentsReminderMessage({ sequence: 1, missing: ['AADHAAR', 'GST'], dueAt });
    expect(text).toContain(`Reminder 1 of ${REMINDER_COUNT}`);
    expect(text).toContain('Aadhaar card, GST number');
    expect(text).toContain('15 Oct 2026');
    expect(text).toContain('help@msd.test');
    expect(text).not.toContain('suspend');
  });

  it('warns about suspension on the final reminder only', () => {
    expect(documentsReminderMessage({ sequence: REMINDER_COUNT, missing: ['PAN'], dueAt })).toContain('may suspend your account');
    expect(documentsReminderSubject(REMINDER_COUNT)).toMatch(/^Final reminder/);
    expect(documentsReminderSubject(1)).toMatch(/^Reminder/);
  });

  it('reads as a plain reminder for a manual send', () => {
    const text = documentsReminderMessage({ sequence: null, missing: ['PAN'], dueAt: null });
    expect(text).toMatch(/^Reminder: /);
    expect(text).not.toContain('due on');
  });
});

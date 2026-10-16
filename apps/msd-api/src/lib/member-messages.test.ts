import { describe, it, expect, vi } from 'vitest';

vi.mock('../config/env', () => ({ env: { supportEmail: 'help@msd.test', supportPhone: '+911234567890' } }));

import { suspendedMessage, inactiveReadOnlyMessage } from './member-messages';

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

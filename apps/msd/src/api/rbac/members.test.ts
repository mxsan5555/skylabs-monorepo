import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMember, changeMemberStatus, deleteMember, listMembers, reviewMemberDocument } from './members';

// vi.hoisted runs before the imports above, so `client.ts` reads this VITE_API_URL at import time.
const fetchMock = vi.hoisted(() => {
  vi.stubEnv('VITE_API_URL', 'http://api.test');
  const mock = vi.fn();
  vi.stubGlobal('fetch', mock);
  return mock;
});

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => ({ data, error: null }) };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(ok({}));
});

describe('members api', () => {
  it('creates a member with POST /members', async () => {
    await createMember('t', { businessName: 'Glow', ownerFirstName: 'A', ownerLastName: 'R', ownerEmail: 'a@x.com', ownerMobile: '9876543210' });
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/members');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  it('changes status with PATCH and the reason in the body', async () => {
    await changeMemberStatus('t', 'm1', 'SUSPENDED', 'Documents not completed');
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/members/m1/status');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ status: 'SUSPENDED', reason: 'Documents not completed' });
  });

  it('deletes with a JSON body', async () => {
    await deleteMember('t', 'm1', 'Cleanup after suspension');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ reason: 'Cleanup after suspension' });
  });

  it('builds the list query from the filter', async () => {
    await listMembers('t', { page: 2, pageSize: 10, search: 'glow', documents: 'incomplete' });
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/members?page=2&pageSize=10&search=glow&documents=incomplete');
  });

  it('reviews a document', async () => {
    await reviewMemberDocument('t', 'm1', 'PAN', { decision: 'REJECTED', reason: 'Scan is blurry' });
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/members/m1/documents/PAN/review');
  });
});

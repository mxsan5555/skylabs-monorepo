import { describe, expect, it, vi } from 'vitest';
import { buildDlRequest, dlConfiguration, formatDlDob, IDSPAY_DL_URL, requireDlContract, sendDlRequest } from './dl.provider';

const config = { url: IDSPAY_DL_URL, apiId: 'fixture-id', apiKey: 'fixture-key', tokenId: 'fixture-token' };
describe('IDSPay srv2 request structure (no production calls)', () => {
  it('reports missing configuration without exposing secrets', () => {
    expect(() => dlConfiguration({ IDSPAY_DL_API_KEY: 'private' })).toThrow('IDSPAY_DL_API_ID, IDSPAY_DL_TOKEN_ID');
  });
  it('rejects an alternative provider endpoint', () => {
    expect(() => dlConfiguration({ IDSPAY_DL_API_ID: 'id', IDSPAY_DL_API_KEY: 'key', IDSPAY_DL_TOKEN_ID: 'token', IDSPAY_DL_API_URL: 'https://example.org' })).toThrow('supplied IDSPay');
  });
  it('constructs only the supplied JSON fields from saved values', () => {
    expect(buildDlRequest({ dlNo: ' DL1420110012345 ', dob: '1990-02-01' }, config)).toEqual({ api_id: 'fixture-id', api_key: 'fixture-key', token_id: 'fixture-token', dlNumber: 'DL1420110012345', dob: '01-02-1990' });
  });
  it.each(['2001-02-29', '2024-02-30', '31-04-1990', '2099-01-01', '', '01/02/1990'])('rejects invalid DOB %s', value => {
    expect(() => formatDlDob(value)).toThrow();
  });
  it('formats leap dates and already formatted dates explicitly', () => {
    expect(formatDlDob('2000-02-29')).toBe('29-02-2000');
    expect(formatDlDob('29-02-2000')).toBe('29-02-2000');
  });
  it('uses the user-confirmed POST/raw JSON contract and preserves internal DL spacing',async()=>{const c=dlConfiguration({IDSPAY_DL_API_URL:' '+IDSPAY_DL_URL+' ',IDSPAY_DL_API_ID:' id ',IDSPAY_DL_API_KEY:' key ',IDSPAY_DL_TOKEN_ID:' token '});const contract=requireDlContract();const transport=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({result_code:103,http_response_code:200})});const body=buildDlRequest({dlNo:' UP53 20260001705 ',dob:'2004-04-24'},c);await sendDlRequest(c,body,contract.method,transport,10000,{},contract.headers);expect(transport).toHaveBeenCalledWith(IDSPAY_DL_URL,expect.objectContaining({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_id:'id',api_key:'key',token_id:'token',dlNumber:'UP53 20260001705',dob:'24-04-2004'})}));});
  it('does not treat undocumented HTTP success as verified', async () => {
    const transport = vi.fn().mockResolvedValue({ ok: true });
    expect((await sendDlRequest(config, buildDlRequest({ dlNo: 'DL1420110012345', dob: '1990-01-01' }, config), 'POST', transport)).status).toBe('Manual review required');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('returns a restricted failure and makes no automatic retries', async () => {
    const transport = vi.fn().mockRejectedValue(new Error('fixture-key fixture-token sensitive response'));
    const result = await sendDlRequest(config, buildDlRequest({ dlNo: 'DL1420110012345', dob: '1990-01-01' }, config), 'POST', transport);
    expect(result).toEqual({ status: 'Provider failed', reason: 'Provider could not be reached' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('aborts a bounded request', async () => {
    const transport = vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('abort')))));
    const result = await sendDlRequest(config, buildDlRequest({ dlNo: 'DL1420110012345', dob: '1990-01-01' }, config), 'POST', transport as unknown as typeof fetch, 5);
    expect(result.reason).toBe('Provider request timed out');
  });
});

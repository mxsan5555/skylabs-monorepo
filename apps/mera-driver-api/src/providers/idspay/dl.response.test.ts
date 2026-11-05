import { describe, expect, it, vi } from 'vitest';
import { normalizeDlDate, normalizeDlNumber, parseDlResponse, type DlEvidence, type DlResponsePolicy } from './dl.response';
import { buildDlRequest, IDSPAY_DL_URL, sendDlRequest } from './dl.provider';

// Synthetic negative/structural cases from the field rules in the user's prompt.
// These are structural fixtures, never proof of a live provider result.
const request = { dlNo: 'UP53 20260001705', dob: '2004-04-24' };
const today = new Date('2026-10-01T12:00:00Z');
const data = () => ({ dl_number: 'up53-20260001705', dob: '24/04/2004', details_of_driving_licence: { status: 'ACTIVE' } });
const envelope = (value: unknown = data()) => ({ status: { code: 200, type: 'success' }, data: value });
const evidence = (): DlEvidence => ({ active: true, validity: [{ category: 'non_transport', from: '01-01-2026', to: '01-10-2026' }], vehicleClasses: ['LMV'] });
// Policy-layer input, deliberately not invented provider field names.
const policy = (value: DlEvidence = evidence()): DlResponsePolicy => ({ today, validityCategory: 'non_transport', requiredVehicleClass: 'LMV', projectEvidence: () => value });

describe('strict DL normalization', () => {
  it('normalizes licence spacing/hyphens/case and explicit Indian/ISO DOB', () => {
    expect(normalizeDlNumber(' up53-20260001705 ')).toBe('UP5320260001705');
    expect(normalizeDlDate('24-04-2004')).toBe('2004-04-24');
    expect(normalizeDlDate('2004/04/24')).toBe('2004-04-24');
  });
  it.each(['2001-02-29', '31-04-2004', '2004-04/24', '24/04-2004', '2004', '**-04-2004', '2004-04-24T00:00:00Z', ''])('rejects malformed/masked dates %s', value => expect(normalizeDlDate(value)).toBeNull());
  it.each(['UP53XXXX001705', 'UP53******1705', 'UP53...', 'REDACTED', ''])('rejects masked/incomplete identifiers %s', value => expect(normalizeDlNumber(value)).toBeNull());
});

describe('fail-closed offline envelope parsing', () => {
  it.each([null, [], '200 OK', {}, { status: { code: 200 } }, { status: { code: '200', type: 'success' }, data: data() }, { status: { code: 200, type: 'error' }, data: data() }])('never infers verification from HTTP-looking/contradictory envelopes', raw => {
    expect(parseDlResponse(raw, request, { today }).status).toBe('Manual review required');
  });
  it('recognizes a found record and matching identity fields without claiming confirmed identity or verification', () => {
    expect(parseDlResponse(envelope(), request, { today })).toMatchObject({ status: 'Manual review required', recordFound: true, identityMatch: null, checks: { licenceNumber: true, dob: true, validity: null, vehicleClass: null } });
  });
  it.each([undefined, null, {}, { dl_number: 'UP5320260001705', dob: '24-04-2004' }])('missing required data/details is manual review', value => {
    expect(parseDlResponse({ status: { code: 200, type: 'success' }, data: value }, request, { today }).status).toBe('Manual review required');
  });
  it('maps numeric no-record code 103 and rejects contradictory or unknown codes', () => {
    expect(parseDlResponse({ result_code: 103 }, request).status).toBe('Invalid / no record found');
    expect(parseDlResponse({ data: { result_code: 103 } }, request).status).toBe('Invalid / no record found');
    expect(parseDlResponse({ ...envelope(), result_code: 103 }, request).status).toBe('Manual review required');
    expect(parseDlResponse({ result_code: 103, data: { result_code: 999 } }, request).status).toBe('Manual review required');
    expect(parseDlResponse({ ...envelope(), result_code: 999 }, request).status).toBe('Manual review required');
    expect(parseDlResponse({ result_code: '103' }, request).status).toBe('Manual review required');
  });
  it.each([{ dl_number: 'UP53XXXX001705' }, { dl_number: 'UP5320260001' }, { dob: '**-04-2004' }, { dob: '31-04-2004' }, { dob: '2099-04-24' }])('masked/truncated/malformed identity never matches', changed => {
    expect(parseDlResponse(envelope({ ...data(), ...changed }), request, policy())).toMatchObject({ status: 'Manual review required', identityMatch: null });
  });
  it.each([{ dl_number: 'UP5320260001706' }, { dob: '25-04-2004' }])('full valid identity mismatch is separately reported', changed => {
    expect(parseDlResponse(envelope({ ...data(), ...changed }), request, policy())).toMatchObject({ status: 'Mismatch/Invalid', identityMatch: false });
  });
  it('checks expiry inclusively on the supplied review day but never verifies an unconfirmed fixture', () => {
    expect(parseDlResponse(envelope(), request, policy())).toMatchObject({ status: 'Manual review required', checks: { validity: true } });
    expect(parseDlResponse(envelope(), request, { ...policy(), today: new Date('2026-10-02') })).toMatchObject({ status: 'Expired', checks: { validity: false } });
  });
  it('uses only the applicable validity and does not substitute a later transport expiry', () => {
    const value = evidence(); value.validity = [{ category: 'non_transport', to: '30-09-2026' }, { category: 'transport', to: '01-01-2030' }];
    expect(parseDlResponse(envelope(), request, policy(value)).status).toBe('Expired');
    expect(parseDlResponse(envelope(), request, { ...policy(value), validityCategory: undefined }).status).toBe('Manual review required');
  });
  it.each(['31-02-2030', 'REDACTED', '2030', '01-01/2030'])('malformed validity cannot verify or establish expiry', to => {
    const value = evidence(); value.validity = [{ category: 'non_transport', to }];
    expect(parseDlResponse(envelope(), request, policy(value)).status).toBe('Manual review required');
  });
  it('rejects reversed, conflicting or future validity rather than inferring validity', () => {
    for (const validity of [[{ category: 'non_transport' as const, from: '2030-01-01', to: '2029-01-01' }], [{ category: 'non_transport' as const, to: '2030-01-01' }, { category: 'non_transport' as const, to: '2031-01-01' }], [{ category: 'non_transport' as const, from: '2027-01-01', to: '2030-01-01' }]]) {
      expect(parseDlResponse(envelope(), request, policy({ ...evidence(), validity })).status).toBe('Manual review required');
    }
  });
  it('requires actual active status and complete, applicable vehicle-class evidence', () => {
    for (const value of [{ ...evidence(), active: null }, { ...evidence(), active: false }, { ...evidence(), validity: [] }, { ...evidence(), vehicleClasses: null }, { ...evidence(), vehicleClasses: ['XXX'] }]) {
      expect(parseDlResponse(envelope(), request, policy(value)).status).toBe('Manual review required');
    }
    expect(parseDlResponse(envelope(), request, policy({ ...evidence(), vehicleClasses: ['MCWG'] })).status).toBe('Mismatch/Invalid');
  });
  it('returns only restricted checks/reason; never raw identity, photos, addresses or credentials', () => {
    const raw = envelope({ ...data(), name: 'PRIVATE HOLDER', address: 'PRIVATE ADDRESS', photo: 'PRIVATE PHOTO', api_key: 'SECRET_KEY', token_id: 'SECRET_TOKEN' });
    const summary = JSON.stringify(parseDlResponse(raw, request, policy()));
    for (const secret of ['PRIVATE', 'SECRET', request.dob, request.dlNo, data().dl_number, data().dob]) expect(summary).not.toContain(secret);
  });
  it('handles unreadable JSON and applies the parser to injected transport without making a real API call', async () => {
    const config = { url: IDSPAY_DL_URL, apiId: 'fixture', apiKey: 'fixture', tokenId: 'fixture' };
    const body = buildDlRequest(request, config);
    const noRecord = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result_code: 103 }) });
    expect((await sendDlRequest(config, body, 'POST', noRecord)).status).toBe('Invalid / no record found');
    const invalidJson = vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error('private response'); } });
    expect((await sendDlRequest(config, body, 'POST', invalidJson)).status).toBe('Manual review required');
    expect(noRecord).toHaveBeenCalledTimes(1); expect(invalidJson).toHaveBeenCalledTimes(1);
  });
});

// The supplied response schema is illustrated with masked values. Positive cases below
// substitute synthetic identities and dates solely to exercise the confirmed field map.
describe('supplied srv2 response field map (offline fixtures)',()=>{
 const saved={dlNo:'UP53 20260001705',dob:'2004-04-24'};
 const success=()=>({status:{code:200,type:'success'},data:{dl_number:'UP5320260001705',dob:'24-04-2004',dl_validity:{non_transport:{from:'01-01-2026',to:'09-08-2040'},transport:{from:'NA',to:'NA'}},details_of_driving_licence:{date_of_issue:'01-01-2026',status:'Active',name:'Synthetic Fixture Driver'},badge_details:[{class_of_vehicle:['LMV','MCWG']}]}});
 it('maps complete matching synthetic data without treating it as live evidence',()=>expect(parseDlResponse(success(),saved,{today,expectedName:'Synthetic Fixture Driver'})).toMatchObject({status:'API verified',identityMatch:true,validTo:'2040-08-09',issueDate:'2026-01-01',vehicleClasses:['LMV','MCWG']}));
 it('maps the exact supplied invalid response despite HTTP 200',()=>expect(parseDlResponse({result_code:103,message:'No record found, Invalid DL number',http_response_code:200,request_id:'idspay-502216e6-2189-11ee-baa4-62dd9742ba41',client_ref_num:'ayext'},saved)).toMatchObject({status:'Invalid / no record found',providerReference:'idspay-502216e6-2189-11ee-baa4-62dd9742ba41'}));
 it('rejects masked success illustration',()=>{const raw=success();raw.data.dl_number='<returned DL>';raw.data.details_of_driving_licence.name='<returned name>';expect(parseDlResponse(raw,saved,{today}).status).toBe('Manual review required');});
 it('distinguishes expired, mismatched and missing applicable dates',()=>{let raw=success();raw.data.dl_validity.non_transport.to='01-01-2026';expect(parseDlResponse(raw,saved,{today}).status).toBe('Expired');raw=success();raw.data.dob='25-04-2004';expect(parseDlResponse(raw,saved,{today}).status).toBe('Mismatch/Invalid');raw=success();raw.data.dl_validity.non_transport={from:'NA',to:'NA'};expect(parseDlResponse(raw,saved,{today}).status).toBe('Manual review required');});
 it('does not infer transport entitlement or silently choose between two validity categories',()=>{const raw=success();raw.data.dl_validity.transport={from:'01-01-2026',to:'01-01-2030'};expect(parseDlResponse(raw,saved,{today}).status).toBe('Manual review required');});
 it('classifies authentication failures separately',()=>expect(parseDlResponse({http_response_code:401},saved).status).toBe('Provider failed'));
});

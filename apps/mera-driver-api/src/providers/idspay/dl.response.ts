import type { DlInput } from './dl.provider';

export type DlAssessmentStatus = 'Provider failed' | 'Manual review required' | 'Invalid / no record found' | 'Mismatch/Invalid' | 'Expired' | 'API verified';
export interface DlAssessment {
  status: DlAssessmentStatus;
  reason: string;
  recordFound: boolean;
  identityMatch: boolean | null;
  validFrom?:string|null;validTo?:string|null;issueDate?:string|null;validityCategory?:string|null;vehicleClasses?:string[];providerReference?:string|null;clientReference?:string|null;
  checks: { name?:boolean|null; licenceNumber: boolean | null; dob: boolean | null; active: boolean | null; validity: boolean | null; vehicleClass: boolean | null };
}
/** A provider-specific adapter must be written from the supplied exact-endpoint
 * fixtures. Do not guess expiry/class field names or translate vehicle classes. */
export interface DlEvidence {
  active: boolean | null;
  validity: { category: 'transport' | 'non_transport' | 'all'; from?: string; to: string }[];
  vehicleClasses: string[] | null;
}
export interface DlResponsePolicy {
  today?: Date;
  expectedName?:string;
  validityCategory?: 'transport' | 'non_transport';
  requiredVehicleClass?: string;
  /** Internal trusted code only, never a frontend option. The adapter is retained for internal policy tests; runtime uses the supplied srv2 fields. */
  projectEvidence?: (data: Readonly<Record<string, unknown>>) => DlEvidence;
}
const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const dayKey = (v: Date) => v.toISOString().slice(0, 10);

/** Accept explicit year-first or Indian day-first dates, never JS rollover or US inference. */
export function normalizeDlDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!/^(?:\d{4}-\d{2}-\d{2}|\d{4}\/\d{2}\/\d{2}|\d{2}-\d{2}-\d{4}|\d{2}\/\d{2}\/\d{4})$/.test(text)) return null;
  const iso = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(text);
  const indian = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(text);
  if (!iso && !indian) return null;
  const [year, month, day] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [Number(indian![3]), Number(indian![2]), Number(indian![1])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 9999 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
export function normalizeDlNumber(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9 -]+$/.test(value.trim())) return null;
  const normalized = value.replace(/[ -]/g, '').toUpperCase();
  // Letters in the numeric part (including XXX masks) are not confirmed identifiers.
  return /^[A-Z]{2}\d{6,28}$/.test(normalized) ? normalized : null;
}

/** Field mapping supplied for the exact srv2 response; no entitlement is inferred
 * from the website driver business category. NA validity is absence, not a date. */
const absent=(v:unknown)=>v==null||v===''||typeof v==='string'&&['NA','N/A'].includes(v.trim().toUpperCase());
function srv2Evidence(data:Readonly<Record<string,unknown>>):DlEvidence{
  const details=object(data.details_of_driving_licence),validity=object(data.dl_validity);
  const intervals:DlEvidence['validity']=[];
  for(const category of ['non_transport','transport'] as const){const interval=object(validity?.[category]);if(!interval||absent(interval.from)&&absent(interval.to))continue;intervals.push({category,...(!absent(interval.from)?{from:typeof interval.from==='string'?interval.from:'INVALID'}:{}),to:typeof interval.to==='string'?interval.to:'INVALID'});}
  const badges=Array.isArray(data.badge_details)?data.badge_details:null;
  const classes=badges?.flatMap(b=>{const badge=object(b);return Array.isArray(badge?.class_of_vehicle)?badge.class_of_vehicle:['INVALID_CLASS'];});
  return {active:typeof details?.status==='string'&&details.status.trim().toLowerCase()==='active'?true:null,validity:intervals,vehicleClasses:classes as string[]??null};
}
const cleanName=(v:unknown)=>typeof v==='string'&&v.trim()&&!/[<>*\[\]]|masked|redacted|placeholder|returned|unknown|^x{2,}$|^N\/?A$/i.test(v.trim())?v.normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim().toUpperCase():null;
const reference=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9_.-]{1,128}$/.test(v)?v:null;

/** Offline response assessment. It does not fetch, log, store the raw response,
 * approve human KYC or activate a Driver. HTTP transport status is deliberately absent.
 * Only fields explicitly supplied by the user are interpreted without an adapter. */
export function parseDlResponse(raw: unknown, request: DlInput, policy: DlResponsePolicy = {}): DlAssessment {
  const result: DlAssessment = { status: 'Manual review required', reason: 'RESPONSE_UNCONFIRMED', recordFound: false, identityMatch: null,
    checks: { licenceNumber: null, dob: null, active: null, validity: null, vehicleClass: null } };
  const finish = (reason: string, status: DlAssessmentStatus = 'Manual review required') => ({ ...result, status, reason });
  try {
    const envelope = object(raw);
    if (!envelope) return finish('RESPONSE_MALFORMED');
    const status = object(envelope.status), data = object(envelope.data);
    result.providerReference=reference(envelope.request_id);result.clientReference=reference(envelope.client_ref_num);
    const codes = [envelope.result_code, data?.result_code].filter(code => code !== undefined && code !== null);
    if (codes.some(code => typeof code !== 'number' || !Number.isInteger(code))) return finish('RESULT_CODE_MALFORMED');
    if (codes.length > 1 && codes.some(code => code !== codes[0])) return finish('RESULT_CODES_CONTRADICT');
    if (codes.includes(103)) {
      // A no-record code accompanied by identity/licence data is contradictory.
      if (status?.code===200&&status.type==='success')return finish('NO_RECORD_CODE_WITH_SUCCESS_STATUS');
      if (data && ['dl_number', 'dob', 'details_of_driving_licence'].some(key => data[key] !== undefined && data[key] !== null && data[key] !== '')) return finish('NO_RECORD_CODE_WITH_RECORD');
      return finish('DL_NO_RECORD_FOUND', 'Invalid / no record found');
    }
    // No other result_code has been supplied/confirmed for this exact endpoint.
    if (codes.length) return finish('RESULT_CODE_UNKNOWN');
    if ([401,403].includes(Number(status?.code))||[401,403].includes(Number(envelope.http_response_code)))return finish('IDSPAY_AUTHENTICATION_FAILED','Provider failed');
    if (envelope.http_response_code!==undefined&&envelope.http_response_code!==200)return finish('RESPONSE_HTTP_CODE_CONTRADICTS');
    if (status?.code !== 200 || status.type !== 'success') return finish('STATUS_NOT_CONFIRMED_SUCCESS');
    if (!data) return finish('REQUIRED_DATA_MISSING');
    const details = object(data.details_of_driving_licence);
    if (!details || typeof details.status !== 'string' || !details.status.trim()) return finish('LICENCE_DETAILS_MISSING');
    if (typeof data.dl_number !== 'string' || !data.dl_number.trim() || typeof data.dob !== 'string' || !data.dob.trim()) return finish('REQUIRED_IDENTITY_FIELDS_MISSING');
    result.recordFound = true;
    const savedNumber = normalizeDlNumber(request.dlNo), returnedNumber = normalizeDlNumber(data.dl_number);
    const savedDob = normalizeDlDate(request.dob), returnedDob = normalizeDlDate(data.dob);
    const today = policy.today ?? new Date();
    if (!Number.isFinite(today.getTime())) return finish('REVIEW_DATE_INVALID');
    const now = dayKey(today);
    if (!savedNumber || !savedDob || savedDob > now) return finish('SAVED_IDENTITY_INVALID');
    if (!returnedNumber || !returnedDob || returnedDob > now || returnedNumber.length !== savedNumber.length) return finish('RETURNED_IDENTITY_MASKED_OR_INCOMPLETE');
    result.recordFound = true;
    result.checks.licenceNumber = savedNumber === returnedNumber;
    result.checks.dob = savedDob === returnedDob;
    let identityMatches = result.checks.licenceNumber && result.checks.dob;
    if(!policy.projectEvidence){const holder=cleanName(details.name);if(!holder)return finish('HOLDER_NAME_MASKED_OR_MISSING');if(policy.expectedName){const expected=cleanName(policy.expectedName);if(!expected)return finish('SAVED_HOLDER_NAME_INCOMPLETE');result.checks.name=holder===expected;identityMatches=identityMatches&&result.checks.name;}}
    if(!absent(details.date_of_issue)){const issued=normalizeDlDate(details.date_of_issue);if(!issued)return finish('ISSUE_DATE_MALFORMED');if(issued>now)return finish('LICENCE_NOT_YET_ISSUED');result.issueDate=issued;}else result.issueDate=null;
    result.identityMatch = identityMatches ? null : false; // matching fields alone are not confirmed identity
    // Do not settle a mismatch until the remainder of the record is structurally sound.
    const evidence = policy.projectEvidence?policy.projectEvidence(data):srv2Evidence(data);
    if (!evidence || typeof evidence.active !== 'boolean' || !Array.isArray(evidence.validity) || !evidence.validity.length || !Array.isArray(evidence.vehicleClasses) || !evidence.vehicleClasses.length) return finish('REQUIRED_EVIDENCE_INCOMPLETE');
    const intervals: { category: string; from: string | null; to: string }[] = [];
    for (const interval of evidence.validity) {
      if (!interval || !['transport', 'non_transport', 'all'].includes(interval.category)) return finish('VALIDITY_CATEGORY_UNKNOWN');
      const to = normalizeDlDate(interval.to), from = interval.from === undefined ? null : normalizeDlDate(interval.from);
      if (!to || interval.from !== undefined && !from || from && from > to) return finish('VALIDITY_DATE_MALFORMED');
      intervals.push({ category: interval.category, from, to });
    }
    if (new Set(intervals.map(i => i.category)).size !== intervals.length || intervals.some(i => i.category === 'all') && intervals.length > 1) return finish('VALIDITY_FIELDS_CONTRADICT');
    const applicable = policy.validityCategory?intervals.filter(i => i.category === 'all' || i.category === policy.validityCategory):!policy.projectEvidence&&intervals.length===1?intervals:intervals.filter(i=>i.category==='all');
    if (applicable.length !== 1) return finish('APPLICABLE_VALIDITY_UNCONFIRMED');
    const classes: string[] = [];
    for (const value of evidence.vehicleClasses) {
      if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{2,30}$/.test(value.trim()) || /(?:MASK|REDACT|UNKNOWN|^X+$)/i.test(value)) return finish('VEHICLE_CLASS_MASKED_OR_UNKNOWN');
      classes.push(value.trim().toUpperCase());
    }
    if (policy.requiredVehicleClass&&!/^[a-zA-Z0-9-]{2,30}$/.test(policy.requiredVehicleClass)) return finish('REQUIRED_VEHICLE_CLASS_UNCONFIRMED');
    result.validFrom=applicable[0].from;result.validTo=applicable[0].to;result.validityCategory=applicable[0].category;result.vehicleClasses=[...new Set(classes)];
    result.checks.active = evidence.active;
    result.checks.validity = applicable[0].to >= now && (!applicable[0].from || applicable[0].from <= now);
    result.checks.vehicleClass = policy.requiredVehicleClass?classes.includes(policy.requiredVehicleClass.toUpperCase()):null;
    if (!identityMatches) return finish(result.checks.name===false?'HOLDER_NAME_MISMATCH':'IDENTITY_MISMATCH', 'Mismatch/Invalid');
    if (!result.checks.active) return finish('LICENCE_NOT_ACTIVE');
    if (applicable[0].from && applicable[0].from > now) return finish('LICENCE_NOT_YET_VALID');
    if (!result.checks.validity) return finish('LICENCE_EXPIRED', 'Expired');
    if (result.checks.vehicleClass===false) return finish('VEHICLE_CLASS_MISMATCH', 'Mismatch/Invalid');
    // Injected synthetic policy evidence without the supplied response fields is
    // useful for negative tests, but is not a provider success fixture.
    if(policy.projectEvidence&&!object(data.dl_validity))return finish('RESPONSE_SCHEMA_INCOMPLETE');
    result.identityMatch=true;
    return finish('DL_RECORD_MATCHED_AND_CURRENT','API verified');
  } catch { return finish('RESPONSE_MALFORMED'); }
}

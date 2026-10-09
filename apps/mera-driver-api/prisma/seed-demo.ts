/**
 * Controlled demo data for manual end-to-end testing of the Customer -> Driver -> Admin
 * booking flow, covering every supported service/engagement scenario (Local, One Way, Round
 * Trip, Outstation, Hourly, Monthly) across two zones, varied vehicle/job-type/language
 * combinations, and KYC-pending/offline/fee-unpaid exclusion examples. NEVER wired into
 * `prisma db seed`, build, migrate or app startup — this is only ever run explicitly:
 *
 *   npm run mera-driver-api:prisma:seed-demo
 *
 * Reuses the real service layer (driver.service.ts, customer.service.ts, fareRule.service.ts,
 * trip-workflow.service.ts, accounts.service.ts, driver-pill.service.ts) instead of raw
 * inserts, so every derived field (onboarding completion, KYC approval gate, booking pricing,
 * financial balances) comes out exactly as the real admin/customer/driver flows would produce
 * it — nothing here bypasses eligibility, KYC approval or finance validation.
 *
 * Idempotent: every demo record is looked up by a fixed, clearly-labelled identifier (the
 * `*.demo@meradriver.test` emails / `+9170000000xx` phones below, and fixed MoneyMovement
 * `reference`s / Booking `clientRequestId`s) before creating anything, so reruns update the
 * same rows instead of duplicating them. Real records are never touched — nothing here
 * filters or iterates over pre-existing data, only these fixed identifiers.
 *
 * Run `--cleanup` to remove only these fixed demo records (see bottom of file).
 */
import path from 'path';
import fs from 'node:fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

import { prisma } from '../src/lib/prisma';
import { UPLOAD_ROOT } from '../src/lib/upload';
import { createDriver, updateDriver, addDriverDocument, createAndLinkDriverUser, getDriverById } from '../src/services/driver.service';
import { createAndLinkCustomerUser } from '../src/services/customer.service';
import { createFareRule, updateFareRule } from '../src/services/fareRule.service';
import { bookCustomer, respondOffer, transitionTrip } from '../src/services/trip-workflow.service';
import { recordMovement } from '../src/services/accounts.service';
import { pillItems } from '../src/services/driver-pill.service';

// ---------------------------------------------------------------------------
// Safety guard — never insert fixtures into a database that doesn't look local.
// ---------------------------------------------------------------------------
function assertSafeDatabase() {
  // Absolute, non-overridable gate: no env var or flag can make this script run when
  // NODE_ENV is production. A localhost DATABASE_URL alone does not prove a database is
  // safe (a prod box can have its DB port-forwarded to localhost), so this check is
  // independent of — and always enforced before — the hostname check below.
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed demo data: NODE_ENV=production. This script never runs in production, with no override.');
    process.exit(1);
  }
  const raw = process.env.DATABASE_URL ?? '';
  let host = '';
  try { host = new URL(raw).hostname; } catch { /* unparsable URL handled below */ }
  const isLocal = ['localhost', '127.0.0.1'].includes(host);
  if (!isLocal && process.env.ALLOW_DEMO_SEED !== 'true') {
    console.error(`Refusing to seed demo data: DATABASE_URL host "${host || 'unknown'}" does not look like a local database.`);
    console.error('If this is genuinely a safe non-production local/test database (e.g. a Docker service name), set ALLOW_DEMO_SEED=true and rerun. This never overrides the NODE_ENV=production check above.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Fixed demo identifiers — the "reliable existing mechanism" used to find/update these
// records on rerun instead of a schema change. Never reused for a real record.
// ---------------------------------------------------------------------------
const DEMO_SYSTEM_EMAIL = 'demo-seed-system@meradriver.test';
const DEMO_SKILL = 'Car Driver';
const ZONE_DELHI = 'Delhi NCR';
const ZONE_MUMBAI = 'Mumbai';

interface DriverSpec {
  firstName: string; lastName: string; phone: string; email: string; dlNo: string;
  city: string; vehicleType: string; jobType: string; languages: string[];
  registrationFeeRequired: boolean; registrationFeePaise: number;
  /** Paid in full via the demo registration-fee movement below (only meaningful when required). */
  feePaid: boolean;
  online: boolean;
}

// 9 fully eligible drivers (2+ per Local/One Way/Round Trip/Outstation/Hourly/Monthly and
// per zone) + 3 deliberately-excluded examples (KYC-pending, offline, fee-unpaid) = 12.
const ELIGIBLE_DRIVERS: DriverSpec[] = [
  { firstName: 'Ramesh', lastName: 'Kumar', phone: '+917000000001', email: 'ramesh.demo@meradriver.test', dlNo: 'DL1234567890101', city: ZONE_DELHI, vehicleType: 'Sedan, SUV', jobType: 'Full Time', languages: ['Hindi', 'English'], registrationFeeRequired: true, registrationFeePaise: 50000, feePaid: true, online: true },
  { firstName: 'Suresh', lastName: 'Yadav', phone: '+917000000002', email: 'suresh.demo@meradriver.test', dlNo: 'DL1234567890102', city: ZONE_DELHI, vehicleType: 'SUV', jobType: 'Full Time', languages: ['Hindi', 'Punjabi'], registrationFeeRequired: false, registrationFeePaise: 0, feePaid: false, online: true },
  { firstName: 'Manoj', lastName: 'Singh', phone: '+917000000003', email: 'manoj.demo@meradriver.test', dlNo: 'DL1234567890103', city: ZONE_DELHI, vehicleType: 'Hatchback, Sedan', jobType: 'Full Time', languages: ['Hindi', 'Bhojpuri'], registrationFeeRequired: true, registrationFeePaise: 50000, feePaid: true, online: true },
  { firstName: 'Rajesh', lastName: 'Verma', phone: '+917000000004', email: 'rajesh.demo@meradriver.test', dlNo: 'DL1234567890104', city: ZONE_DELHI, vehicleType: 'Sedan', jobType: 'Part Time', languages: ['Hindi', 'English'], registrationFeeRequired: true, registrationFeePaise: 50000, feePaid: true, online: true },
  { firstName: 'Vikram', lastName: 'Rathore', phone: '+917000000005', email: 'vikram.demo@meradriver.test', dlNo: 'DL1234567890105', city: ZONE_DELHI, vehicleType: 'SUV', jobType: 'Full Time', languages: ['Hindi', 'Marathi'], registrationFeeRequired: false, registrationFeePaise: 0, feePaid: false, online: true },
  { firstName: 'Arjun', lastName: 'Nair', phone: '+917000000006', email: 'arjun.demo@meradriver.test', dlNo: 'DL1234567890106', city: ZONE_DELHI, vehicleType: 'Sedan', jobType: 'Part Time', languages: ['Hindi', 'Tamil', 'English'], registrationFeeRequired: true, registrationFeePaise: 50000, feePaid: true, online: true },
  { firstName: 'Deepak', lastName: 'Chauhan', phone: '+917000000007', email: 'deepak.demo@meradriver.test', dlNo: 'DL1234567890107', city: ZONE_DELHI, vehicleType: 'Sedan, SUV', jobType: 'Full Time, Part Time', languages: ['Hindi', 'English'], registrationFeeRequired: true, registrationFeePaise: 50000, feePaid: true, online: true },
  { firstName: 'Sanjay', lastName: 'Gupta', phone: '+917000000008', email: 'sanjay.demo@meradriver.test', dlNo: 'DL1234567890108', city: ZONE_MUMBAI, vehicleType: 'Sedan', jobType: 'Full Time', languages: ['Hindi', 'Marathi', 'English'], registrationFeeRequired: true, registrationFeePaise: 50000, feePaid: true, online: true },
  { firstName: 'Irfan', lastName: 'Shaikh', phone: '+917000000009', email: 'irfan.demo@meradriver.test', dlNo: 'DL1234567890109', city: ZONE_MUMBAI, vehicleType: 'Sedan', jobType: 'Part Time', languages: ['Hindi', 'Urdu'], registrationFeeRequired: false, registrationFeePaise: 0, feePaid: false, online: true },
];

const PENDING_DRIVER = { firstName: 'Amit', lastName: 'Kumar', phone: '+917000000010', email: 'amit.demo@meradriver.test' };
// Phones 013/014 (not 011/012) — those are the fixed Customer phones below; reusing them
// would hit the real `User` contact-conflict guard in `createAndLinkDriverUser`.
const OFFLINE_DRIVER: DriverSpec = { firstName: 'Naveen', lastName: 'Reddy', phone: '+917000000013', email: 'naveen.demo@meradriver.test', dlNo: 'DL1234567890113', city: ZONE_DELHI, vehicleType: 'Sedan', jobType: 'Full Time', languages: ['Hindi', 'Telugu'], registrationFeeRequired: true, registrationFeePaise: 50000, feePaid: true, online: false };
const FEE_UNPAID_DRIVER: DriverSpec = { firstName: 'Kiran', lastName: 'Mehta', phone: '+917000000014', email: 'kiran.demo@meradriver.test', dlNo: 'DL1234567890114', city: ZONE_DELHI, vehicleType: 'Sedan', jobType: 'Full Time', languages: ['Hindi', 'Gujarati'], registrationFeeRequired: true, registrationFeePaise: 50000, feePaid: false, online: true };

// Same phone numbers as the prior script revision (continuity — these are the two existing
// demo Customer records, not new ones; a different number here would create a duplicate
// Customer row sharing the same email as the pre-existing one and fail on the User.email
// unique constraint).
const CUSTOMER_1 = { firstName: 'Priya', lastName: 'Sharma', mobileNumber: '+917000000011', email: 'priya.demo@meradriver.test' };
const CUSTOMER_2 = { firstName: 'Anita', lastName: 'Verma', mobileNumber: '+917000000012', email: 'anita.demo@meradriver.test' };

// Every demo fare rule carries the same 15% (1500 bps) demo commission.
const DEMO_COMMISSION_BPS = 1500;

interface FareRuleSpec {
  key: string; zoneName: string; tripTypeName: string; vehicleCategoryName: string;
  baseFare: number; perKmRate: number; perMinRate: number; minFare: number; driverAllowance: number;
  requiredDriverJobType?: string;
}

// Hourly/Monthly deliberately reuse the SAME pricing formula as every other service (no new
// business rule invented): Hourly bills purely by `perMinRate` (so `durationMinutes` IS the
// requested duration in hours*60 — a real per-minute rate, not a fabricated "hourly engine").
// Monthly zeroes every per-distance/per-minute term so `minFare` alone becomes the flat
// monthly price regardless of the one-time pickup trip's distance/duration — a genuinely
// supported configuration of the existing `max(minFare, ...)` formula, not a short trip
// silently billed as the whole month.
const FARE_RULES: FareRuleSpec[] = [
  { key: 'local', zoneName: ZONE_DELHI, tripTypeName: 'Local', vehicleCategoryName: 'Sedan', baseFare: 80, perKmRate: 14, perMinRate: 1.5, minFare: 100, driverAllowance: 0 },
  { key: 'one-way', zoneName: ZONE_DELHI, tripTypeName: 'One Way', vehicleCategoryName: 'Sedan', baseFare: 200, perKmRate: 30, perMinRate: 5, minFare: 200, driverAllowance: 0 },
  { key: 'round-trip', zoneName: ZONE_DELHI, tripTypeName: 'Round Trip', vehicleCategoryName: 'SUV', baseFare: 300, perKmRate: 25, perMinRate: 4, minFare: 400, driverAllowance: 0 },
  { key: 'outstation', zoneName: ZONE_DELHI, tripTypeName: 'Outstation', vehicleCategoryName: 'SUV', baseFare: 500, perKmRate: 18, perMinRate: 2, minFare: 800, driverAllowance: 300 },
  { key: 'hourly', zoneName: ZONE_DELHI, tripTypeName: 'Hourly', vehicleCategoryName: 'Sedan', baseFare: 0, perKmRate: 0, perMinRate: 5, minFare: 150, driverAllowance: 0, requiredDriverJobType: 'Part Time' },
  { key: 'monthly', zoneName: ZONE_DELHI, tripTypeName: 'Monthly', vehicleCategoryName: 'Sedan', baseFare: 0, perKmRate: 0, perMinRate: 0, minFare: 15000, driverAllowance: 0, requiredDriverJobType: 'Full Time' },
  { key: 'local-mumbai', zoneName: ZONE_MUMBAI, tripTypeName: 'Local', vehicleCategoryName: 'Sedan', baseFare: 80, perKmRate: 14, perMinRate: 1.5, minFare: 100, driverAllowance: 0 },
];

const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function writeDemoFile(relativePath: string, content: Buffer | string) {
  const absolute = path.join(UPLOAD_ROOT, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

// ---------------------------------------------------------------------------
// Master data the demo fare rules / drivers need (additive, idempotent — never touches any
// other master-data row). Reuses the real master-data models: MasterListItem for
// driver-types/job-types/languages, the dedicated VehicleType model for vehicle preference
// (no separate car inventory introduced), and ServiceZone for zone/location.
// ---------------------------------------------------------------------------
async function ensureMasterListItem(category: string, name: string) {
  await prisma.masterListItem.upsert({
    where: { category_name: { category, name } },
    create: { category, name, status: 'Active' },
    update: { status: 'Active' },
  });
}

async function ensureVehicleType(name: string, code: string) {
  const existing = await prisma.vehicleType.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  if (!existing) return prisma.vehicleType.create({ data: { name, code, status: 'Active' } });
  if (existing.status !== 'Active') return prisma.vehicleType.update({ where: { id: existing.id }, data: { status: 'Active' } });
  return existing;
}

async function ensureServiceZone(zoneName: string, zoneCode: string) {
  const existing = await prisma.serviceZone.findUnique({ where: { zoneCode } });
  if (!existing) return prisma.serviceZone.create({ data: { zoneName, zoneCode, zoneType: 'Custom', status: 'Active' } });
  if (existing.status !== 'Active' || existing.zoneName !== zoneName) return prisma.serviceZone.update({ where: { id: existing.id }, data: { zoneName, status: 'Active' } });
  return existing;
}

async function ensureTripType(name: string) {
  const existing = await prisma.tripType.findFirst({ where: { name } });
  if (!existing) return prisma.tripType.create({ data: { name, isActive: true } });
  if (!existing.isActive) return prisma.tripType.update({ where: { id: existing.id }, data: { isActive: true } });
  return existing;
}

async function ensureMasterData() {
  await ensureMasterListItem('driver-types', DEMO_SKILL);
  await ensureMasterListItem('job-types', 'Full Time');
  await ensureMasterListItem('job-types', 'Part Time');
  await ensureVehicleType('Sedan', 'SEDAN-DEMO');
  await ensureVehicleType('SUV', 'SUV-DEMO');
  await ensureVehicleType('Hatchback', 'HATCH-DEMO');
  await ensureServiceZone(ZONE_DELHI, 'ZONE-DELHI-NCR-DEMO');
  await ensureServiceZone(ZONE_MUMBAI, 'ZONE-MUMBAI-DEMO');
  for (const rule of FARE_RULES) await ensureTripType(rule.tripTypeName);
}

async function ensureSystemActor() {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_SYSTEM_EMAIL } });
  if (existing) return existing;
  return prisma.user.create({ data: { name: 'Demo Seed System', email: DEMO_SYSTEM_EMAIL } });
}

async function ensureFareRules() {
  const byKey: Record<string, Awaited<ReturnType<typeof createFareRule>>> = {};
  for (const rule of FARE_RULES) {
    const fields = {
      zoneName: rule.zoneName, tripTypeName: rule.tripTypeName, vehicleCategoryName: rule.vehicleCategoryName,
      baseFare: rule.baseFare, perKmRate: rule.perKmRate, perMinRate: rule.perMinRate, waitingChargePerMin: 2, minFare: rule.minFare,
      driverAllowance: rule.driverAllowance, tollIncluded: false, surgeMultiplier: 1.0,
      effectiveFrom: new Date().toISOString().slice(0, 10), isActive: true,
      requiredDriverSkill: DEMO_SKILL, commissionBps: DEMO_COMMISSION_BPS,
      ...(rule.requiredDriverJobType ? { requiredDriverJobType: rule.requiredDriverJobType } : {}),
    };
    const existing = await prisma.fareRule.findFirst({ where: { zoneName: rule.zoneName, tripTypeName: rule.tripTypeName, vehicleCategoryName: rule.vehicleCategoryName } });
    byKey[rule.key] = existing ? await updateFareRule(existing.id, fields) : await createFareRule(fields);
  }
  return byKey;
}

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------
async function ensureBaseDriver(spec: DriverSpec) {
  const existing = await prisma.driver.findFirst({ where: { email: spec.email } });
  const fields = {
    firstName: spec.firstName, lastName: spec.lastName, gender: 'Male', dob: '1990-05-15',
    phone: spec.phone, email: spec.email,
    address: '123 Demo Marg', city: spec.city, pincode: '110001', country: 'India',
    driverType: DEMO_SKILL, vehicleType: spec.vehicleType, jobType: spec.jobType,
    languages: spec.languages, experience: '5 years',
    dlNo: spec.dlNo, dlIssueDate: '2015-01-01', dlExpiryDate: '2031-12-31', licenseDetails: 'Non-transport',
    policeVerifiedStatus: 'Verified', policeVerifiedNo: `PVC-DEMO-${spec.dlNo.slice(-4)}`,
    accountStatus: 'Active', online: spec.online,
    registrationFeeRequired: spec.registrationFeeRequired, registrationFeePaise: spec.registrationFeePaise,
  };
  if (existing) {
    await prisma.driver.update({ where: { id: existing.id }, data: fields });
    return getDriverById(existing.id);
  }
  return createDriver(fields);
}

async function ensureDocument(driverId: string, category: 'personal' | 'health' | 'education' | 'police', type: string, relativePath: string, content: Buffer | string, mimeType: string) {
  const existing = await prisma.driverDocument.findFirst({ where: { driverId, category, type, archivedAt: null } });
  if (existing) return existing;
  writeDemoFile(relativePath, content);
  return addDriverDocument({ driverId, category, type, filePath: relativePath, fileName: path.basename(relativePath), mimeType, sizeBytes: Buffer.byteLength(typeof content === 'string' ? content : content) });
}

async function approveDriverKyc(driverId: string, reviewerId: string) {
  const driver = await getDriverById(driverId);
  const pills = pillItems(driver as unknown as Parameters<typeof pillItems>[0]);
  for (const pill of pills) {
    for (const item of pill.items.filter(i => i.checkable)) {
      await prisma.driverKycCheck.upsert({
        where: { driverId_itemKey: { driverId, itemKey: item.key } },
        create: { driverId, itemKey: item.key, status: 'Pass', valueHash: item.hash, reviewerId, reviewedAt: new Date() },
        update: { status: 'Pass', valueHash: item.hash, reviewerId, reviewedAt: new Date(), reason: null },
      });
    }
  }
  if (driver.status !== 'Verified') {
    await updateDriver(driverId, { status: 'Verified' }, { actorId: reviewerId, canChangeStatus: true, explicitApproval: true });
  }
}

async function ensureVerifiedDriver(spec: DriverSpec, systemUserId: string) {
  let driver = await ensureBaseDriver(spec);
  const demoNote = (label: string) => `SYNTHETIC DEMO DOCUMENT — NOT A REAL IDENTITY DOCUMENT.\nDriver: ${spec.firstName} ${spec.lastName} (demo fixture).\nType: ${label}\n`;
  await ensureDocument(driver.id, 'personal', 'Profile Photo', `drivers/${driver.id}/avatar.png`, Buffer.from(tinyPngBase64, 'base64'), 'image/png');
  await ensureDocument(driver.id, 'personal', 'Aadhaar / National ID (Demo)', `drivers/${driver.id}/aadhaar-demo.txt`, demoNote('Aadhaar / National ID'), 'text/plain');
  await ensureDocument(driver.id, 'health', 'Medical Fitness Certificate (Demo)', `drivers/${driver.id}/medical-demo.txt`, demoNote('Medical Fitness Certificate'), 'text/plain');
  await ensureDocument(driver.id, 'education', '10th Certificate (Demo)', `drivers/${driver.id}/education-demo.txt`, demoNote('10th Certificate'), 'text/plain');
  await ensureDocument(driver.id, 'police', 'Police Verification Certificate (Demo)', `drivers/${driver.id}/police-demo.txt`, demoNote('Police Verification Certificate'), 'text/plain');
  await approveDriverKyc(driver.id, systemUserId);
  driver = await getDriverById(driver.id);
  if (!driver.userId) await createAndLinkDriverUser(driver.id);
  return getDriverById(driver.id);
}

async function registerDemoFee(driverId: string, systemUserId: string, label: string) {
  await recordMovement(systemUserId, { reference: `demo-registration-fee-${label}`, driverId, kind: 'registration_payment', amountPaise: 50000, method: 'cash', reason: 'Demo: registration fee received in cash' });
}

async function ensurePendingDriver(spec: typeof PENDING_DRIVER) {
  const existing = await prisma.driver.findFirst({ where: { email: spec.email } });
  if (existing) return existing;
  // `completeStep: false` deliberately leaves onboarding/KYC incomplete — excluded from
  // matching by the real eligibility rules (no DL, no completed onboarding pills, status
  // stays 'Non-Verified'), and per the task's own instruction, no portal login is created.
  return createDriver({ firstName: spec.firstName, lastName: spec.lastName, gender: 'Male', phone: spec.phone, email: spec.email, city: ZONE_DELHI, completeStep: false });
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
async function ensureCustomer(spec: { firstName: string; lastName: string; mobileNumber: string; email: string }) {
  const existing = await prisma.customer.findFirst({ where: { mobileNumber: spec.mobileNumber } });
  const fields = { firstName: spec.firstName, lastName: spec.lastName, mobileNumber: spec.mobileNumber, email: spec.email, verificationStatus: 'Verified', accountStatus: 'Active' };
  const customer = existing ? await prisma.customer.update({ where: { id: existing.id }, data: fields }) : await prisma.customer.create({ data: fields });
  if (!customer.userId) return createAndLinkCustomerUser(customer.id);
  return customer;
}

// ---------------------------------------------------------------------------
// Bookings — each walked through the real offer/accept/transition lifecycle, resumable on
// rerun via a fixed `clientRequestId`. Pickup times are always relative to "now" so fixtures
// never go stale.
// ---------------------------------------------------------------------------
interface BookingSpec {
  key: string; clientRequestId: string; customerId: string; customerUserId: string;
  city: string; service: string; vehicleCategory: string; pickupAddress: string; dropAddress: string;
  startsInHours: number; durationMinutes: number; distanceKm: number; paymentMode: 'cash' | 'razorpay';
  preferredDriverId: string;
  /** How far through the lifecycle this fixture should be walked on (re)seed. */
  advanceTo: 'requested' | 'confirmed' | 'completed';
}

async function refreshBooking(id: string) {
  return prisma.booking.findUniqueOrThrow({ where: { id } });
}

async function ensureBooking(spec: BookingSpec, driverUserId: string | null, systemUserId: string) {
  let booking = await prisma.booking.findUnique({ where: { clientRequestId: spec.clientRequestId } });
  if (!booking) {
    const startsAt = new Date(Date.now() + spec.startsInHours * 60 * 60 * 1000).toISOString();
    const created = await bookCustomer(spec.customerId, spec.customerUserId, {
      city: spec.city, service: spec.service, vehicleCategory: spec.vehicleCategory,
      pickupAddress: spec.pickupAddress, dropAddress: spec.dropAddress,
      startsAt, durationMinutes: spec.durationMinutes, distanceKm: spec.distanceKm,
      paymentMode: spec.paymentMode, preferredDriverId: spec.preferredDriverId, clientRequestId: spec.clientRequestId,
    });
    booking = await refreshBooking(created.id);
  }
  if (spec.advanceTo === 'requested' || !driverUserId) return booking;
  if (booking.status === 'requested') {
    const offer = await prisma.tripOffer.findFirst({ where: { bookingId: booking.id, driverId: spec.preferredDriverId, status: 'pending' } });
    if (offer) { await respondOffer(spec.preferredDriverId, offer.id, driverUserId, true); booking = await refreshBooking(booking.id); }
  }
  if (spec.advanceTo === 'confirmed') return booking;
  if (booking.status === 'confirmed') { await transitionTrip(booking.id, driverUserId, { status: 'on_the_way' }, { driverId: spec.preferredDriverId }); booking = await refreshBooking(booking.id); }
  if (booking.status === 'on_the_way') { await transitionTrip(booking.id, driverUserId, { status: 'arrived' }, { driverId: spec.preferredDriverId }); booking = await refreshBooking(booking.id); }
  if (booking.status === 'arrived') { await transitionTrip(booking.id, driverUserId, { status: 'in_progress', otp: booking.otp ?? undefined }, { driverId: spec.preferredDriverId }); booking = await refreshBooking(booking.id); }
  if (booking.status === 'in_progress') { await transitionTrip(booking.id, driverUserId, { status: 'completed' }, { driverId: spec.preferredDriverId }); booking = await refreshBooking(booking.id); }

  if (booking.status === 'completed' && booking.paymentMode === 'cash' && booking.farePaise && booking.commissionPaise != null) {
    const already = await prisma.moneyMovement.findFirst({ where: { reference: `demo-cod-collection-${spec.key}` } });
    if (!already) {
      await recordMovement(systemUserId, { reference: `demo-cod-collection-${spec.key}`, bookingId: booking.id, driverId: spec.preferredDriverId, kind: 'driver_cod_collection', amountPaise: booking.farePaise, method: 'cash', reason: 'Demo: driver collected COD cash from customer on trip completion' });
      await recordMovement(systemUserId, { reference: `demo-commission-settlement-${spec.key}`, bookingId: booking.id, driverId: spec.preferredDriverId, kind: 'commission_settlement', amountPaise: booking.commissionPaise, method: 'cash', reason: 'Demo: driver settled platform commission from collected COD' });
    }
  }
  return refreshBooking(booking.id);
}

// ---------------------------------------------------------------------------
// Cleanup — removes ONLY the fixed demo records above. Never truncates, never touches any
// record this script didn't itself create/identify.
// ---------------------------------------------------------------------------
async function cleanup() {
  const demoEmails = [...ELIGIBLE_DRIVERS.map(d => d.email), PENDING_DRIVER.email, OFFLINE_DRIVER.email, FEE_UNPAID_DRIVER.email];
  const demoCustomerPhones = [CUSTOMER_1.mobileNumber, CUSTOMER_2.mobileNumber];
  const drivers = await prisma.driver.findMany({ where: { email: { in: demoEmails } } });
  const customers = await prisma.customer.findMany({ where: { mobileNumber: { in: demoCustomerPhones } } });
  const bookingIds = (await prisma.booking.findMany({ where: { clientRequestId: { startsWith: 'demo-' } } , select: { id: true } })).map(b => b.id);

  await prisma.$transaction(async tx => {
    await tx.moneyMovement.deleteMany({ where: { OR: [{ bookingId: { in: bookingIds } }, { driverId: { in: drivers.map(d => d.id) } }] } });
    await tx.tripEvent.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await tx.tripOffer.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await tx.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await tx.driverKycCheck.deleteMany({ where: { driverId: { in: drivers.map(d => d.id) } } });
    await tx.driverKycDecision.deleteMany({ where: { driverId: { in: drivers.map(d => d.id) } } });
    await tx.driverDocument.deleteMany({ where: { driverId: { in: drivers.map(d => d.id) } } });
    const driverUserIds = drivers.map(d => d.userId).filter((id): id is string => !!id);
    await tx.driver.deleteMany({ where: { id: { in: drivers.map(d => d.id) } } });
    await tx.user.deleteMany({ where: { id: { in: driverUserIds } } });
    const customerUserIds = customers.map(c => c.userId).filter((id): id is string => !!id);
    await tx.customer.deleteMany({ where: { id: { in: customers.map(c => c.id) } } });
    await tx.user.deleteMany({ where: { id: { in: customerUserIds } } });
    for (const rule of FARE_RULES) {
      const existing = await tx.fareRule.findFirst({ where: { zoneName: rule.zoneName, tripTypeName: rule.tripTypeName, vehicleCategoryName: rule.vehicleCategoryName } });
      if (existing) await tx.fareRule.delete({ where: { id: existing.id } });
    }
    await tx.user.deleteMany({ where: { email: DEMO_SYSTEM_EMAIL } });
  });
  for (const driver of drivers) {
    const dir = path.join(UPLOAD_ROOT, 'drivers', driver.id);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(`Removed demo fixtures: ${drivers.length} driver(s), ${customers.length} customer(s), ${bookingIds.length} booking(s). Master data (languages/driver-types/job-types/vehicle-types/zones/trip-types) is left in place — Super Admin-managed reference data, not demo-owned.`);
}

// A prior, narrower revision of this same script (2 drivers, 2 bookings) used these two
// fixed `clientRequestId`s. This expanded revision fully supersedes it with its own
// `demo-...` prefixed ids (see `bookingSpecs` below) — removing the superseded bookings (and
// only their own movements/events/offers) here keeps a rerun from leaving orphaned duplicate
// fixtures around. Synthetic demo ids only; never touches a real booking.
const LEGACY_BOOKING_CLIENT_REQUEST_IDS = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
async function removeLegacyDemoArtifacts() {
  const legacy = await prisma.booking.findMany({ where: { clientRequestId: { in: LEGACY_BOOKING_CLIENT_REQUEST_IDS } }, select: { id: true } });
  if (!legacy.length) return;
  const ids = legacy.map(b => b.id);
  await prisma.$transaction([
    prisma.moneyMovement.deleteMany({ where: { bookingId: { in: ids } } }),
    prisma.tripEvent.deleteMany({ where: { bookingId: { in: ids } } }),
    prisma.tripOffer.deleteMany({ where: { bookingId: { in: ids } } }),
    prisma.booking.deleteMany({ where: { id: { in: ids } } }),
  ]);
  console.log(`Removed ${ids.length} superseded booking(s) from a prior demo-seed revision.`);
}

async function main() {
  assertSafeDatabase();
  if (process.argv.includes('--cleanup')) { await cleanup(); return; }

  console.log('Seeding mera-driver-api demo data...');
  await removeLegacyDemoArtifacts();
  await ensureMasterData();
  const systemUser = await ensureSystemActor();
  const rules = await ensureFareRules();
  for (const rule of FARE_RULES) console.log(`Demo fare rule: ${rule.zoneName} / ${rule.tripTypeName} / ${rule.vehicleCategoryName}, commission ${DEMO_COMMISSION_BPS / 100}%${rule.requiredDriverJobType ? `, requires ${rule.requiredDriverJobType}` : ''}`);

  const drivers: Record<string, Awaited<ReturnType<typeof ensureVerifiedDriver>>> = {};
  for (const spec of ELIGIBLE_DRIVERS) {
    const driver = await ensureVerifiedDriver(spec, systemUser.id);
    if (spec.registrationFeeRequired && spec.feePaid) await registerDemoFee(driver.id, systemUser.id, spec.firstName.toLowerCase());
    drivers[spec.firstName] = driver;
  }
  const offlineDriver = await ensureVerifiedDriver(OFFLINE_DRIVER, systemUser.id);
  if (OFFLINE_DRIVER.feePaid) await registerDemoFee(offlineDriver.id, systemUser.id, OFFLINE_DRIVER.firstName.toLowerCase());
  const feeUnpaidDriver = await ensureVerifiedDriver(FEE_UNPAID_DRIVER, systemUser.id); // registrationFeeRequired=true, no payment movement recorded -> stays "Unpaid"
  const pendingDriver = await ensurePendingDriver(PENDING_DRIVER);

  const priya = await ensureCustomer(CUSTOMER_1);
  const anita = await ensureCustomer(CUSTOMER_2);

  const bookingSpecs: BookingSpec[] = [
    { key: 'local', clientRequestId: 'demo-00000000-0000-4000-8000-000000000001', customerId: priya.id, customerUserId: priya.userId!, city: ZONE_DELHI, service: 'Local', vehicleCategory: 'Sedan', pickupAddress: 'Demo Pickup, Connaught Place, New Delhi', dropAddress: 'Demo Drop, Lajpat Nagar, New Delhi', startsInHours: 24, durationMinutes: 30, distanceKm: 10, paymentMode: 'cash', preferredDriverId: drivers['Ramesh'].id, advanceTo: 'completed' },
    { key: 'round-trip', clientRequestId: 'demo-00000000-0000-4000-8000-000000000002', customerId: anita.id, customerUserId: anita.userId!, city: ZONE_DELHI, service: 'Round Trip', vehicleCategory: 'SUV', pickupAddress: 'Demo Pickup, Karol Bagh, New Delhi', dropAddress: 'Demo Drop, Sector 29, Gurugram', startsInHours: 48, durationMinutes: 90, distanceKm: 40, paymentMode: 'cash', preferredDriverId: drivers['Suresh'].id, advanceTo: 'requested' },
    { key: 'outstation', clientRequestId: 'demo-00000000-0000-4000-8000-000000000003', customerId: priya.id, customerUserId: priya.userId!, city: ZONE_DELHI, service: 'Outstation', vehicleCategory: 'SUV', pickupAddress: 'Demo Pickup, Connaught Place, New Delhi', dropAddress: 'Demo Drop, Mall Road, Manali', startsInHours: 72, durationMinutes: 240, distanceKm: 180, paymentMode: 'cash', preferredDriverId: drivers['Vikram'].id, advanceTo: 'confirmed' },
    { key: 'hourly', clientRequestId: 'demo-00000000-0000-4000-8000-000000000004', customerId: anita.id, customerUserId: anita.userId!, city: ZONE_DELHI, service: 'Hourly', vehicleCategory: 'Sedan', pickupAddress: 'Demo Pickup, Saket, New Delhi', dropAddress: 'Demo Drop, Saket, New Delhi', startsInHours: 12, durationMinutes: 120, distanceKm: 15, paymentMode: 'razorpay', preferredDriverId: drivers['Rajesh'].id, advanceTo: 'confirmed' },
    { key: 'monthly', clientRequestId: 'demo-00000000-0000-4000-8000-000000000005', customerId: priya.id, customerUserId: priya.userId!, city: ZONE_DELHI, service: 'Monthly', vehicleCategory: 'Sedan', pickupAddress: 'Demo Pickup, Dwarka, New Delhi', dropAddress: 'Demo Drop, Dwarka Sector 21, New Delhi', startsInHours: 24, durationMinutes: 30, distanceKm: 10, paymentMode: 'cash', preferredDriverId: drivers['Manoj'].id, advanceTo: 'completed' },
    { key: 'local-mumbai', clientRequestId: 'demo-00000000-0000-4000-8000-000000000006', customerId: anita.id, customerUserId: anita.userId!, city: ZONE_MUMBAI, service: 'Local', vehicleCategory: 'Sedan', pickupAddress: 'Demo Pickup, Bandra, Mumbai', dropAddress: 'Demo Drop, Andheri, Mumbai', startsInHours: 24, durationMinutes: 25, distanceKm: 8, paymentMode: 'cash', preferredDriverId: drivers['Sanjay'].id, advanceTo: 'completed' },
  ];

  const driverUserIdByDriverId = new Map<string, string>();
  for (const name of Object.keys(drivers)) driverUserIdByDriverId.set(drivers[name].id, drivers[name].userId!);

  const bookingResults: { spec: BookingSpec; booking: Awaited<ReturnType<typeof ensureBooking>> }[] = [];
  for (const spec of bookingSpecs) {
    const driverUserId = driverUserIdByDriverId.get(spec.preferredDriverId) ?? null;
    const booking = await ensureBooking(spec, driverUserId, systemUser.id);
    bookingResults.push({ spec, booking });
  }

  console.log('\nDemo setup complete:');
  console.log('  Eligible drivers:');
  for (const spec of ELIGIBLE_DRIVERS) console.log(`    ${spec.firstName} ${spec.lastName} (${drivers[spec.firstName].id}) — ${spec.city}, ${spec.vehicleType}, ${spec.jobType}, speaks ${spec.languages.join('/')}, fee ${spec.registrationFeeRequired ? (spec.feePaid ? 'Paid' : 'Unpaid') : 'Not required'}`);
  console.log(`  Offline (excluded) driver: ${OFFLINE_DRIVER.firstName} ${OFFLINE_DRIVER.lastName} (${offlineDriver.id}) — online=false`);
  console.log(`  Fee-unpaid (excluded) driver: ${FEE_UNPAID_DRIVER.firstName} ${FEE_UNPAID_DRIVER.lastName} (${feeUnpaidDriver.id}) — registration fee required, Unpaid`);
  console.log(`  KYC-pending (excluded) driver: ${PENDING_DRIVER.firstName} ${PENDING_DRIVER.lastName} (${pendingDriver.id}) — onboarding incomplete, no login`);
  console.log(`  Customers: Priya (${priya.id}) | Anita (${anita.id})`);
  console.log('  Bookings:');
  for (const { spec, booking } of bookingResults) {
    console.log(`    [${spec.key}] ${booking.bookingCode} — status ${booking.status}, fare Rs.${((booking.farePaise ?? 0) / 100).toFixed(2)}, commission Rs.${((booking.commissionPaise ?? 0) / 100).toFixed(2)}, driver share Rs.${((booking.driverSharePaise ?? 0) / 100).toFixed(2)}`);
  }
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });

import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

import { PrismaClient } from '../src/generated/prisma-client';

const prisma = new PrismaClient();

/**
 * Local test accounts (2 members, 2 customers) for development and manual testing. Their phones
 * and emails are made up, so list them in DEV_OTP_IDENTIFIERS (`.env.local`): the OTP then prints
 * in the msd-api console instead of being sent. Idempotent: rerun any time; existing rows update.
 * Refuses to run against production. Usage: npm run msd-api:prisma:seed-dev-users
 */
interface DevMember {
  name: [first: string, last: string];
  email: string;
  phone: string;
  businessName: string;
  address: string;
  state: string;
  city: string;
}

interface DevCustomer {
  name: string;
  email: string;
  phone: string;
  address: string;
  state: string;
  city: string;
  /** Not given with the accounts; a real PIN code for the area so checkout pre-fills (item 2.2). */
  pincode: string;
}

export const DEV_MEMBERS: DevMember[] = [
  {
    name: ['Alok', 'Kumar'],
    email: 'test@test.com',
    phone: '+919112312391',
    businessName: 'Alok Kumar Wellness',
    address: '152 K Pocket',
    state: 'Delhi',
    city: 'New Delhi',
  },
  {
    name: ['Ravi', 'Singh'],
    email: 'hello@hello.com',
    phone: '+919122558891',
    businessName: 'Ravi Singh Spa',
    address: '6 Block, 1st Floor, Ram Niwash Road',
    state: 'Maharashtra',
    city: 'Mumbai',
  },
];

export const DEV_CUSTOMERS: DevCustomer[] = [
  {
    name: 'Neeraj Singh',
    email: 'neeraj@test.com',
    phone: '+919177889991',
    address: '1457, D Block, Pacchim Vihar',
    state: 'Delhi',
    city: 'New Delhi',
    pincode: '110063',
  },
  {
    name: 'Sudhir Vishwa',
    email: 'suddhir@test.com',
    phone: '+919144556610',
    address: '12, Raj Nagar',
    state: 'Karnataka',
    city: 'Bengaluru',
    pincode: '560001',
  },
];

async function roleId(key: string): Promise<string> {
  const role = await prisma.role.findUnique({ where: { key }, select: { id: true } });
  if (!role) throw new Error(`Role "${key}" is missing. Run npm run msd-api:prisma:seed first.`);
  return role.id;
}

/** Reuses the account found by phone, else by email (an earlier manual sign-up with the same
 *  email), and brings its name, phone and email in line; creates it when neither exists. */
async function upsertUser(name: string, phone: string, email: string, roleIds: string[]): Promise<string> {
  const existing =
    (await prisma.user.findUnique({ where: { phone }, select: { id: true } })) ??
    (await prisma.user.findUnique({ where: { email }, select: { id: true } }));
  const fields = { name, phone, email, deletedAt: null, status: 'active' as const };
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: fields })
    : await prisma.user.create({ data: { name, phone, email } });
  for (const id of roleIds) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: id } },
      update: {},
      create: { userId: user.id, roleId: id },
    });
  }
  return user.id;
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('seed-dev-users never runs in production.');
  const [memberRole, customerRole] = await Promise.all([roleId('member'), roleId('customer')]);

  for (const m of DEV_MEMBERS) {
    const ownerName = `${m.name[0]} ${m.name[1]}`;
    // Every user also holds `customer` (first login grants it), so members can buy too.
    const ownerUserId = await upsertUser(ownerName, m.phone, m.email, [memberRole, customerRole]);
    const data = {
      businessName: m.businessName,
      businessEmail: m.email,
      businessPhone: m.phone,
      ownerFirstName: m.name[0],
      ownerLastName: m.name[1],
      ownerEmail: m.email,
      ownerMobile: m.phone,
      contactPerson: ownerName,
      address: m.address,
      city: m.city,
      state: m.state,
      country: 'India',
      status: 'ACTIVE' as const,
    };
    await prisma.member.upsert({ where: { ownerUserId }, update: data, create: { ...data, ownerUserId } });
  }

  for (const c of DEV_CUSTOMERS) {
    const id = await upsertUser(c.name, c.phone, c.email, [customerRole]);
    // The saved delivery address (D37) that checkout pre-fills.
    await prisma.user.update({ where: { id }, data: { address: c.address, state: c.state, city: c.city, pincode: c.pincode } });
  }

  // Phones and emails both: a sign-in with either must print its OTP, never send it.
  const users = [...DEV_MEMBERS, ...DEV_CUSTOMERS];
  const identifiers = [...users.map((u) => u.phone.replace('+91', '')), ...users.map((u) => u.email)];
  console.log(`Seeded ${DEV_MEMBERS.length} members and ${DEV_CUSTOMERS.length} customers.`);
  console.log(`Add to apps/msd-api/.env.local, then restart nx serve msd-api:\nDEV_OTP_IDENTIFIERS=${identifiers.join(',')}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

import { PrismaClient } from '../apps/msd-api/src/generated/prisma-client/index.js';
const prisma = new PrismaClient();
const therapists = await prisma.therapist.findMany({ select: { id: true, personName: true, therapistType: true, gender: true, specialization: true } });
console.log('Therapist count:', therapists.length);
for (const t of therapists) console.log(` ${t.personName} | type=${t.therapistType} | gender=${t.gender} | spec=${t.specialization}`);

const bookingCount = await prisma.booking.count();
const bookingsWithDeal = await prisma.booking.count({ where: { dealId: { not: null } } });
console.log('\nBooking count:', bookingCount, '| with dealId:', bookingsWithDeal, '(should match total, none are Deal-less yet)');

const orderItemCount = await prisma.orderItem.count();
const orderItemsWithDeal = await prisma.orderItem.count({ where: { dealId: { not: null } } });
console.log('OrderItem count:', orderItemCount, '| with dealId:', orderItemsWithDeal, '(should match total, none are Deal-less yet)');
await prisma.$disconnect();

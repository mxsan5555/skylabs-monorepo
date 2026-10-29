import { prisma } from '../lib/prisma';
import { normalizeIdentifier } from '../lib/normalizeIdentifier';
import { HttpError } from '../middleware/errorHandler';

const LINKED_USER_SELECT = { id: true, name: true, email: true, phone: true } as const;

export async function listCustomers() {
  return prisma.customer.findMany({
    orderBy: { createdAt: 'desc' },
    take: 1000,
    include: { user: { select: LINKED_USER_SELECT } },
  });
}

export async function searchCustomers(query:{page:number;pageSize:number;search?:string;status?:string;sort?:string;direction?:'asc'|'desc'}, ownerUserId: string | null = null){
  const search=query.search?{OR:[{id:{contains:query.search,mode:'insensitive' as const}},{firstName:{contains:query.search,mode:'insensitive' as const}},{lastName:{contains:query.search,mode:'insensitive' as const}},{mobileNumber:{contains:query.search}},{email:{contains:query.search,mode:'insensitive' as const}}]}:{};
  const owner = ownerUserId ? { createdByUserId: ownerUserId } : {};
  const where={...owner,...search,...(query.status?{accountStatus:query.status}:{})};
  const sort=['firstName','lastName','mobileNumber','email','customerType','verificationStatus','accountStatus','createdAt'].includes(query.sort??'')?query.sort!:'createdAt';
  const [rows,total,counts]=await Promise.all([prisma.customer.findMany({where,orderBy:[{[sort]:query.direction??'desc'},{id:'asc'}],take:query.pageSize,skip:(query.page-1)*query.pageSize,include:{user:{select:LINKED_USER_SELECT},_count:{select:{bookings:{where:{status:{in:['requested','confirmed','on_the_way','arrived','in_progress']}}}}}}}),prisma.customer.count({where}),Promise.all(['Active','Inactive','Blocked'].map(async status=>[status,await prisma.customer.count({where:{...owner,...search,accountStatus:status}})]))]);return{rows,meta:{total,page:query.page,pageSize:query.pageSize,counts:Object.fromEntries(counts)}};
}
export async function getCustomerById(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { user: { select: LINKED_USER_SELECT } },
  });
  if (!customer) throw new HttpError(404, 'NOT_FOUND', 'Customer not found');
  return customer;
}

export async function createCustomer(input: Record<string, unknown>) {
  const customer = await prisma.customer.create({ data: input as never });
  return getCustomerById(customer.id);
}

export async function updateCustomer(id:string,input:Record<string,unknown>){
 const {statusReason,acknowledgeActiveBookings,...data}=input;
 await prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "Customer" WHERE id=${id} FOR UPDATE`;const existing=await tx.customer.findUnique({where:{id}});if(!existing)throw new HttpError(404,'NOT_FOUND','Customer not found');
 if(data.accountStatus&&data.accountStatus!==existing.accountStatus){
  if(!['Active','Inactive','Blocked'].includes(String(data.accountStatus)))throw new HttpError(422,'STATUS_INVALID','Unsupported customer account status');
  if(!String(statusReason??'').trim())throw new HttpError(422,'REASON_REQUIRED','A customer status change reason is required');
  const active=await tx.booking.count({where:{customerId:id,status:{in:['requested','confirmed','on_the_way','arrived','in_progress']}}});
  if(data.accountStatus!=='Active'&&active&&!acknowledgeActiveBookings)throw new HttpError(409,'ACTIVE_BOOKINGS_ACK_REQUIRED',`${active} active bookings will remain unchanged; acknowledge that this customer will lose login/new-booking access`);
 }
 await tx.customer.update({where:{id},data:data as never});});return getCustomerById(id);
}

export async function deleteCustomer(id: string) {
  await getCustomerById(id);
  await prisma.customer.delete({ where: { id } });
}

/**
 * Login-time guard shared by every sign-in route (OTP, password, Google) — mirrors
 * `assertDriverAccountActive` exactly. No-op for a User with no linked Customer record at
 * all — this only ever restricts a deactivated Customer's own portal access, never a
 * generic account check.
 */
export async function assertCustomerAccountActive(userId: string): Promise<void> {
  const customer = await prisma.customer.findUnique({ where: { userId }, select: { accountStatus: true } });
  if (customer && ['Inactive','Blocked'].includes(customer.accountStatus)) {
    throw new HttpError(403, 'CUSTOMER_DEACTIVATED', 'Your account has been deactivated. Please contact support.');
  }
}

export async function getOwnCustomer(customerId: string) {
  return getCustomerById(customerId);
}

export async function updateOwnCustomer(customerId: string, input: Record<string, unknown>) {
  await prisma.customer.update({ where: { id: customerId }, data: input as never });
  return getCustomerById(customerId);
}

/** The customer's own booking history — ownership-scoped, see `Booking.customerId`. Empty
 *  today for virtually every customer since nothing yet populates that field automatically
 *  (see the schema comment on `Booking.customerId`); the isolation mechanism itself is real. */
export async function listOwnBookings(customerId: string) {
  return prisma.booking.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' } });
}

/**
 * Links a Customer record to a User account, granting that user access to the self-service
 * customer portal (ownership-based — see `resolveOwnCustomer`). Auto-assigns the `customer`
 * role if the user doesn't already hold it (mirrors `linkDriverToUser` exactly) — portal
 * *access* is gated purely by `bootstrap.customer`, not this role, but the role still carries
 * the baseline permission grants (e.g. `trips.bookings:view`) the portal's own API calls need.
 * `Customer.userId` is `@unique` at the DB level — a second link attempt on an
 * already-linked user fails that constraint, translated to a clean 409 by the shared error
 * handler (same P2002 -> CONFLICT translation used elsewhere).
 */
export async function linkCustomerToUser(customerId: string, userId: string) {
  await getCustomerById(customerId);

  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'User not found');

  const customerRole = await prisma.role.findUnique({ where: { key: 'customer' } });
  if (customerRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: customerRole.id } },
      create: { userId, roleId: customerRole.id },
      update: {},
    });
  }

  await prisma.customer.update({ where: { id: customerId }, data: { userId } });
  return getCustomerById(customerId);
}

/** Unlinks a Customer from its User. */
export async function unlinkCustomerFromUser(customerId: string) {
  await getCustomerById(customerId);
  await prisma.customer.update({ where: { id: customerId }, data: { userId: null } });
  return getCustomerById(customerId);
}

/**
 * The one-click path to grant a Customer a portal login: creates the User, assigns the
 * `customer` role, and links it — all in one transaction, mirroring
 * `createAndLinkDriverUser` exactly. `Customer.userId @unique` backstops this at the DB
 * level if called twice concurrently.
 */
export async function createAndLinkCustomerUser(customerId: string) {
  const customer = await getCustomerById(customerId);
  if (customer.userId) {
    throw new HttpError(409, 'ALREADY_LINKED', 'This customer already has a linked user account');
  }
  if (!customer.mobileNumber && !customer.email) {
    throw new HttpError(422, 'MISSING_CONTACT', 'Customer needs a phone or email on file before a user account can be created');
  }

  const customerRole = await prisma.role.findUnique({ where: { key: 'customer' } });
  if (!customerRole) {
    throw new HttpError(500, 'ROLE_MISSING', 'The customer role is not seeded in this environment');
  }

  const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim() || 'Customer';

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name,
        email: customer.email ? normalizeIdentifier(customer.email) : undefined,
        phone: customer.mobileNumber ? normalizeIdentifier(customer.mobileNumber) : undefined,
      },
    });
    await tx.userRole.create({ data: { userId: user.id, roleId: customerRole.id } });
    await tx.customer.update({ where: { id: customerId }, data: { userId: user.id } });
  });

  return getCustomerById(customerId);
}

from pathlib import Path
p=Path('apps/mera-driver-api/src/services/accounts.service.ts');s=p.read_text(encoding='utf-8')
s=s.replace('if(from)predicates.push(Prisma.sql`b."createdAt">=${from}`);if(to)predicates.push(Prisma.sql`b."createdAt"<=${to}`);', '''if(section!=='Overview'&&filters.period!=='current'){
   const date=filters.period==='earned'?commissionEarnedAtSql():Prisma.sql`b."createdAt"`;
   if(filters.period==='posted') {if(from||to)predicates.push(Prisma.sql`EXISTS(SELECT 1 FROM "MoneyMovement" m WHERE m."bookingId"=b.id AND m.kind='booking_payment' AND ${from?Prisma.sql`m."createdAt">=${from}`:Prisma.sql`true`} AND ${to?Prisma.sql`m."createdAt"<=${to}`:Prisma.sql`true`})`);}
   else {if(from)predicates.push(Prisma.sql`${date}>=${from}`);if(to)predicates.push(Prisma.sql`${date}<=${to}`);}
 }''')
s=s.replace("['Unpaid','Pending','Paid','Failed','Waived','Refunded'].map", "['Unpaid','Partial','No fee required','Pending','Paid','Failed','Waived','Refunded'].map")
s=s.replace('booking:{select:{bookingCode:true}}','booking:{select:{bookingCode:true,customerName:true,driverName:true,driverId:true}}')
s=s.replace(' return {pendingActions,totals:', ''' const pendingFees=section==='Overview'?await prisma.$queryRaw(Prisma.sql`SELECT id,"firstName","lastName","registrationFeePaise","paidPaise"-"refundedPaise" AS "netReceivedPaise",GREATEST(0,"registrationFeePaise"-"paidPaise"+"refundedPaise"-"waivedPaise") AS "remainingPaise","feeStatus" FROM (${feeScope}) d WHERE "feeStatus" NOT IN ('Paid','Waived','No fee required') AND "registrationFeePaise">"paidPaise"-"refundedPaise"+"waivedPaise" ORDER BY "firstName",id LIMIT 5`):[];
 const metrics=section==='Overview'?await accountsOverviewMetrics(filters,scope,driverOwnerUserId??(scoped?scope.ownerUserId:null)):undefined;
 return {pendingFees,metrics,pendingActions,totals:''')
s=s.replace("input.amountPaise > driver.registrationFeePaise - net", "input.amountPaise > registrationFeeBalance(driver,movements).remainingPaise")
p.write_text(s,encoding='utf-8')
p=Path('apps/mera-driver-api/src/routes/workflow.routes.ts');s=p.read_text(encoding='utf-8')
s=s.replace("search:z.string().max(200).optional()}).parse(req.query);res.json({data:await accounts.accountsOverview(filters,await bookingOwnerScope(req))", "search:z.string().max(200).optional(),period:z.enum(['posted','earned','current','created']).optional()}).parse(req.query);res.json({data:await accounts.accountsOverview(filters,await bookingOwnerScope(req),await driverOwnerScope(req))")
s=s.replace("else if(scope.mode!=='via-owned-drivers'||!movement.driverId||!await prisma.driver.findFirst({where:{id:movement.driverId,createdByUserId:scope.ownerUserId},select:{id:true}}))", "else if(!movement.driverId||!await prisma.driver.findFirst({where:{id:movement.driverId,createdByUserId:(await driverOwnerScope(req))??undefined},select:{id:true}}))")
anchor="router.get('/accounts/drivers/:id/fee'"
start=s.index(anchor)
s=s[:start]+'''router.get('/accounts/bookings/:id',requirePermission('payments.overview','view'),async(req,res,next)=>{try{
 const scope=await bookingOwnerScope(req);await getBookingById(req.params.id,scope);
 const [record]=await prisma.$queryRaw<(Booking&{computedPaymentStatus:string})[]>(Prisma.sql`SELECT * FROM (${accounts.accountBookingSql()}) b WHERE b.id=${req.params.id} AND ${bookingScopeSql(scope)}`);
 if(!record)throw new HttpError(404,'NOT_FOUND','Booking not found');
 const receipts=await prisma.moneyMovement.findMany({where:{bookingId:record.id},orderBy:[{createdAt:'desc'},{id:'asc'}],take:20});
 res.setHeader('Cache-Control','private, no-store');res.json({data:{...record,paymentStatus:record.computedPaymentStatus,receipts},error:null});
}catch(e){next(e);}});
''' +s[start:]
s=s.replace("import { ownerWhere, getBookingById }", "import { ownerWhere, getBookingById, bookingScopeSql }")
p.write_text(s,encoding='utf-8')

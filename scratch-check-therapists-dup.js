const { PrismaClient } = require('./apps/msd-api/src/generated/prisma-client');
const prisma = new PrismaClient();

const DUP_ID = '01d6c5ec-897b-4a47-8584-dd888041eb19'; // slug: 'therapists'
const CANONICAL_ID = '9a30d770-b537-43ce-a786-2af0374b1c16'; // slug: 'therapy'

async function main() {
  const [directDeals, directProducts, directVca, directTherapists, subIds] = await Promise.all([
    prisma.deal.count({ where: { OR: [{ categoryId: DUP_ID }, { subcategoryId: DUP_ID }] } }),
    prisma.product.count({ where: { OR: [{ categoryId: DUP_ID }, { subcategoryId: DUP_ID }] } }),
    prisma.vendorCategoryAccess.count({ where: { categoryId: DUP_ID } }),
    prisma.therapist.count({ where: { specializationCategoryId: DUP_ID } }),
    prisma.category.findMany({ where: { parentId: DUP_ID }, select: { id: true, slug: true } }),
  ]);
  console.log({ directDeals, directProducts, directVca, directTherapists });
  console.log('direct children of dup:', subIds.length, subIds.map((c) => c.slug));

  // Any deal/product/vca/therapist referencing any of the ORPHANED subcategory rows (not just the top dup itself)?
  const allDescendantIds = [];
  async function collect(parentId) {
    const kids = await prisma.category.findMany({ where: { parentId }, select: { id: true } });
    for (const k of kids) {
      allDescendantIds.push(k.id);
      await collect(k.id);
    }
  }
  await collect(DUP_ID);
  console.log('total descendant ids under dup:', allDescendantIds.length);

  const [descDeals, descProducts, descVca, descTherapists] = await Promise.all([
    prisma.deal.count({ where: { OR: [{ categoryId: { in: allDescendantIds } }, { subcategoryId: { in: allDescendantIds } }] } }),
    prisma.product.count({ where: { OR: [{ categoryId: { in: allDescendantIds } }, { subcategoryId: { in: allDescendantIds } }] } }),
    prisma.vendorCategoryAccess.count({ where: { categoryId: { in: allDescendantIds } } }),
    prisma.therapist.count({ where: { specializationCategoryId: { in: allDescendantIds } } }),
  ]);
  console.log({ descDeals, descProducts, descVca, descTherapists });

  const canonical = await prisma.category.findUnique({ where: { id: CANONICAL_ID } });
  console.log('canonical row still exists:', !!canonical);
}

main().finally(() => prisma.$disconnect());

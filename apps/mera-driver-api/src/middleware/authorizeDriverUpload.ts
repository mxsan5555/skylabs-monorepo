import type { Request, Response, NextFunction } from 'express';
import { driverOwnerScope } from '../lib/ownerScope';
import { prisma } from '../lib/prisma';
import { resolveEffectivePermissionsForUser } from '../services/permission.service';

/** A file path is not authorization. Resolve the stored document and its owner first. */
export async function authorizeDriverUpload(req: Request, res: Response, next: NextFunction) {
  try {
    const missing = () => res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Document not found' } });
    let filePath: string;
    try { filePath = decodeURIComponent(req.path).replace(/^\//, ''); } catch { missing(); return; }
    if (!/^drivers\/[^/]+\/[^/]+$/.test(filePath) || filePath.includes('\\') || filePath.split('/').some(p => p === '..')) {
      missing(); return;
    }
    const document = await prisma.driverDocument.findFirst({ where: { filePath }, include: { driver: { include: { user: { select: { status:true,deletedAt:true } } } } } });
    if (!document || !req.user) { missing(); return; }
    const permissions = await resolveEffectivePermissionsForUser(req.user.sub, req.user.roles, keys => { req.user!.roles = keys; });
    const own = req.user.portalContext !== 'customer' && req.user.portalContext !== 'staff' && document.driver.userId === req.user.sub && document.driver.accountStatus === 'Active' && document.driver.user!==null && (!document.driver.user || (document.driver.user.status==='active'&&!document.driver.user.deletedAt));
    const assigned = document.driver.assignedVerifierId === req.user.sub && permissions.includes('kyc-assignments:view');
    const ownerScope = permissions.includes('drivers:view') ? await driverOwnerScope(req) : undefined;
    const staffRead = permissions.includes('drivers:view') && (ownerScope === null || document.driver.createdByUserId === ownerScope);
    if (!own && !assigned && !staffRead) { missing(); return; }
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    const previewable = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(document.mimeType ?? '');
    res.setHeader('Content-Disposition', previewable ? 'inline' : 'attachment');
    next();
  } catch (error) { next(error); }
}

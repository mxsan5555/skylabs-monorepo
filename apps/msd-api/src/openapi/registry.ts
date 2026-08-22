import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  OtpRequestSchema,
  OtpVerifySchema,
  RefreshRequestSchema,
  AuthTokensResponseSchema,
} from '../schemas/auth.schema';
import {
  RoleCreateSchema,
  RoleUpdateSchema,
  RoleStatusUpdateSchema,
  RoleCloneSchema,
  RolePermissionsUpdateSchema,
  RolePermissionsResponseSchema,
  RoleWidgetsUpdateSchema,
  DashboardWidgetCreateSchema,
  UserCreateSchema,
  UserUpdateSchema,
  UserStatusUpdateSchema,
  ImpersonateRequestSchema,
} from '../schemas/rbac.schema';
import { ErrorObjectSchema, PaginationQuerySchema } from '../schemas/common.schema';
import {
  VendorCreateSchema,
  VendorUpdateSchema,
  VendorSelfCreateSchema,
  VendorSelfUpdateSchema,
  VendorRejectSchema,
  VendorStatusUpdateSchema,
  VendorKycReviewSchema,
  BranchCreateSchema,
  BranchUpdateSchema,
  BranchStatusUpdateSchema,
  DealCreateSchema,
  DealUpdateSchema,
  DealStatusUpdateSchema,
  DealRejectSchema,
  TherapistCreateSchema,
  TherapistUpdateSchema,
  TherapistStatusUpdateSchema,
  TherapistPackageCreateSchema,
  TherapistPackageUpdateSchema,
} from '../schemas/vendor.schema';
import { CategoryCreateSchema, CategoryUpdateSchema, CategoryStatusUpdateSchema } from '../schemas/category.schema';
import { ProductCreateSchema, ProductUpdateSchema, ProductStatusUpdateSchema } from '../schemas/product.schema';
import { ServiceCreateSchema, ServiceUpdateSchema, ServiceStatusUpdateSchema } from '../schemas/service.schema';
import { CatalogDealQuerySchema, CatalogTherapistQuerySchema } from '../schemas/catalog.schema';
import { CartAddItemSchema, CartUpdateItemSchema } from '../schemas/cart.schema';
import { WishlistAddItemSchema } from '../schemas/wishlist.schema';
import { BookingCreateSchema, BookingCancelSchema, BookingVendorStatusUpdateSchema } from '../schemas/booking.schema';
import { OrderCheckoutSchema, OrderFromBookingSchema, OrderCustomerCancelSchema, OrderStatusUpdateSchema } from '../schemas/order.schema';
import { VerifyPaymentSchema, OrderBatchSchema, VerifyBatchPaymentSchema } from '../schemas/payment.schema';
import { DashboardStatsResponseSchema } from '../schemas/dashboard.schema';
import { MediaReorderSchema } from '../schemas/media.schema';

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });

  const bearer = [{ bearerAuth: [] }];
  const errorResponse = { description: 'Error', content: { 'application/json': { schema: ErrorObjectSchema } } };

  // ─── Auth ──────────────────────────────────────────────────────────────────

  registry.registerPath({
    method: 'post',
    path: '/auth/otp/request',
    summary: 'Request an OTP for phone/email login',
    tags: ['Auth'],
    request: { body: { content: { 'application/json': { schema: OtpRequestSchema } } } },
    responses: {
      200: { description: 'OTP sent (or silently no-op for an unknown identifier)' },
      429: errorResponse,
      422: errorResponse,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/otp/verify',
    summary: 'Verify an OTP and receive a JWT pair',
    tags: ['Auth'],
    request: { body: { content: { 'application/json': { schema: OtpVerifySchema } } } },
    responses: {
      200: {
        description: 'Authenticated',
        content: { 'application/json': { schema: AuthTokensResponseSchema } },
      },
      401: errorResponse,
      429: errorResponse,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/auth/google',
    summary: 'Redirect to Google OAuth consent screen',
    tags: ['Auth'],
    responses: { 302: { description: 'Redirect to Google' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/auth/google/callback',
    summary: 'Google OAuth callback — issues a JWT pair',
    tags: ['Auth'],
    responses: {
      200: { description: 'Authenticated', content: { 'application/json': { schema: AuthTokensResponseSchema } } },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/refresh',
    summary: 'Rotate the refresh token and issue a new access token',
    tags: ['Auth'],
    request: { body: { content: { 'application/json': { schema: RefreshRequestSchema } } } },
    responses: { 200: { description: 'Rotated' }, 401: errorResponse },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/logout',
    summary: 'Revoke the current refresh session',
    tags: ['Auth'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: RefreshRequestSchema } } } },
    responses: { 200: { description: 'Logged out' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/logout-all',
    summary: 'Revoke every refresh session for the caller',
    tags: ['Auth'],
    security: bearer,
    responses: { 200: { description: 'All sessions revoked' } },
  });

  // ─── RBAC: bootstrap ─────────────────────────────────────────────────────────

  registry.registerPath({
    method: 'get',
    path: '/rbac/bootstrap',
    summary: 'Roles, permissions, menu, and dashboard widgets for the caller',
    tags: ['RBAC'],
    security: bearer,
    responses: { 200: { description: 'Bootstrap payload' } },
  });

  // ─── RBAC: roles ─────────────────────────────────────────────────────────────

  registry.registerPath({
    method: 'get',
    path: '/rbac/roles',
    summary: 'List roles',
    tags: ['RBAC - Roles'],
    security: bearer,
    responses: { 200: { description: 'Roles' }, 403: errorResponse },
  });

  registry.registerPath({
    method: 'post',
    path: '/rbac/roles',
    summary: 'Create a role',
    tags: ['RBAC - Roles'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: RoleCreateSchema } } } },
    responses: { 201: { description: 'Created' }, 403: errorResponse, 409: errorResponse },
  });

  registry.registerPath({
    method: 'patch',
    path: '/rbac/roles/{id}',
    summary: 'Update a role',
    tags: ['RBAC - Roles'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: RoleUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' }, 403: errorResponse, 404: errorResponse },
  });

  registry.registerPath({
    method: 'delete',
    path: '/rbac/roles/{id}',
    summary: 'Delete a role (only if unassigned and non-system)',
    tags: ['RBAC - Roles'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Deleted' }, 403: errorResponse, 409: errorResponse },
  });

  registry.registerPath({
    method: 'post',
    path: '/rbac/roles/{id}/clone',
    summary: 'Clone a role with its permissions and widgets',
    tags: ['RBAC - Roles'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: RoleCloneSchema } } },
    },
    responses: { 201: { description: 'Cloned' } },
  });

  registry.registerPath({
    method: 'patch',
    path: '/rbac/roles/{id}/status',
    summary: 'Activate/deactivate a role',
    tags: ['RBAC - Roles'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: RoleStatusUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/rbac/permissions/catalog',
    summary: 'Full menu x action permission matrix',
    tags: ['RBAC - Roles'],
    security: bearer,
    responses: { 200: { description: 'Catalog' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/rbac/roles/{id}/permissions',
    summary: "The role's currently granted permission ids (for pre-checking a permission editor)",
    tags: ['RBAC - Roles'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: {
        description: 'Granted permission ids',
        content: { 'application/json': { schema: RolePermissionsResponseSchema } },
      },
      403: errorResponse,
      404: errorResponse,
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/rbac/roles/{id}/permissions',
    summary: 'Replace the permission set for a role',
    tags: ['RBAC - Roles'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: RolePermissionsUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' } },
  });

  registry.registerPath({
    method: 'put',
    path: '/rbac/roles/{id}/widgets',
    summary: 'Replace the dashboard widget set for a role',
    tags: ['RBAC - Roles'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: RoleWidgetsUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/rbac/dashboard-widgets',
    summary: 'List the dashboard widget catalog',
    tags: ['RBAC - Dashboard Widgets'],
    security: bearer,
    responses: { 200: { description: 'Widgets' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/rbac/dashboard-widgets',
    summary: 'Create a dashboard widget catalog entry',
    tags: ['RBAC - Dashboard Widgets'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: DashboardWidgetCreateSchema } } } },
    responses: { 201: { description: 'Created' } },
  });

  // ─── RBAC: users ─────────────────────────────────────────────────────────────

  registry.registerPath({
    method: 'get',
    path: '/rbac/users',
    summary: 'List users (paginated)',
    tags: ['RBAC - Users'],
    security: bearer,
    responses: { 200: { description: 'Users' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/rbac/users',
    summary: 'Create a user',
    tags: ['RBAC - Users'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: UserCreateSchema } } } },
    responses: { 201: { description: 'Created' } },
  });

  registry.registerPath({
    method: 'patch',
    path: '/rbac/users/{id}',
    summary: 'Update a user',
    tags: ['RBAC - Users'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: UserUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' } },
  });

  registry.registerPath({
    method: 'delete',
    path: '/rbac/users/{id}',
    summary: 'Soft-delete a user',
    tags: ['RBAC - Users'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Deleted' } },
  });

  registry.registerPath({
    method: 'patch',
    path: '/rbac/users/{id}/status',
    summary: 'Change a user status',
    tags: ['RBAC - Users'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: UserStatusUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/rbac/users/{id}/roles/{roleId}',
    summary: 'Assign a role to a user',
    tags: ['RBAC - Users'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid(), roleId: z.string().uuid() }) },
    responses: { 200: { description: 'Assigned' } },
  });

  registry.registerPath({
    method: 'delete',
    path: '/rbac/users/{id}/roles/{roleId}',
    summary: 'Unassign a role from a user',
    tags: ['RBAC - Users'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid(), roleId: z.string().uuid() }) },
    responses: { 200: { description: 'Unassigned' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/rbac/users/{id}/sessions/revoke-all',
    summary: 'Revoke every refresh session for a user',
    tags: ['RBAC - Users'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Revoked' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/rbac/users/{id}/otp/reset',
    summary: 'Invalidate pending OTP challenges for a user',
    tags: ['RBAC - Users'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Reset' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/rbac/users/{id}/login-history',
    summary: 'Paginated login history for a user',
    tags: ['RBAC - Users'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Login history' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/rbac/users/{id}/sessions',
    summary: 'Active/expired device sessions for a user',
    tags: ['RBAC - Users'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Sessions' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/rbac/audit-logs',
    summary: 'Audit log, optionally filtered by targetUserId',
    tags: ['RBAC - Audit'],
    security: bearer,
    request: { query: z.object({ targetUserId: z.string().uuid().optional() }) },
    responses: { 200: { description: 'Audit log entries' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/rbac/impersonate',
    summary: 'Issue a short-lived "Login As" preview token for another user',
    tags: ['RBAC - Users'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: ImpersonateRequestSchema } } } },
    responses: { 200: { description: 'Preview token issued' }, 403: errorResponse },
  });

  // ─── Vendors / Branches / Deals ───────────────────────────────────────────────

  registry.registerPath({
    method: 'get',
    path: '/vendors/categories',
    summary: 'List categories/subcategories (reference data for the Deal form)',
    tags: ['Vendors'],
    security: bearer,
    responses: { 200: { description: 'Categories' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/vendors/branches',
    summary: 'Cross-vendor branch list for the sidebar Branches page (admin, gated on vendors:view)',
    tags: ['Vendors - Admin'],
    security: bearer,
    responses: { 200: { description: 'Branches' }, 403: errorResponse },
  });

  registry.registerPath({
    method: 'get',
    path: '/vendors/deals',
    summary: 'Cross-vendor deal list for the sidebar Deals page (admin, gated on vendors:view)',
    tags: ['Vendors - Admin'],
    security: bearer,
    responses: { 200: { description: 'Deals' }, 403: errorResponse },
  });

  registry.registerPath({
    method: 'get',
    path: '/vendors/users/search',
    summary: "Existing-user typeahead for linking a Vendor's owner (admin, gated on vendors:create)",
    tags: ['Vendors - Admin'],
    security: bearer,
    request: { query: z.object({ q: z.string().optional(), page: z.coerce.number().optional(), pageSize: z.coerce.number().optional() }) },
    responses: { 200: { description: 'Users' }, 403: errorResponse },
  });

  registry.registerPath({
    method: 'get',
    path: '/vendors/me',
    summary: "The caller's own vendor profile (self-service)",
    tags: ['Vendors - Self-service'],
    security: bearer,
    responses: { 200: { description: 'Vendor' }, 404: errorResponse },
  });

  registry.registerPath({
    method: 'post',
    path: '/vendors/me',
    summary: 'Self-register a vendor profile for the caller',
    tags: ['Vendors - Self-service'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: VendorSelfCreateSchema } } } },
    responses: { 201: { description: 'Created' }, 409: errorResponse },
  });

  registry.registerPath({
    method: 'patch',
    path: '/vendors/me',
    summary: "Update the caller's own vendor profile",
    tags: ['Vendors - Self-service'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: VendorSelfUpdateSchema } } } },
    responses: { 200: { description: 'Updated' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/vendors/me/submit',
    summary: 'Submit the completed profile for admin verification',
    tags: ['Vendors - Self-service'],
    security: bearer,
    responses: { 200: { description: 'Submitted' }, 422: errorResponse },
  });

  registry.registerPath({
    method: 'get',
    path: '/vendors/me/branches',
    summary: "The caller's own branches",
    tags: ['Vendors - Self-service'],
    security: bearer,
    responses: { 200: { description: 'Branches' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/vendors/me/customers',
    summary: 'Distinct customers who have ordered/booked from the caller\'s own vendor',
    tags: ['Vendors - Self-service'],
    security: bearer,
    request: { query: PaginationQuerySchema },
    responses: { 200: { description: 'Customers' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/vendors/me/branches',
    summary: 'Create a branch for the caller\'s own vendor',
    tags: ['Vendors - Self-service'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: BranchCreateSchema } } } },
    responses: { 201: { description: 'Created' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/vendors/me/branches/{branchId}/deals',
    summary: "Deals for one of the caller's own branches",
    tags: ['Vendors - Self-service'],
    security: bearer,
    request: { params: z.object({ branchId: z.string().uuid() }) },
    responses: { 200: { description: 'Deals' }, 403: errorResponse },
  });

  registry.registerPath({
    method: 'post',
    path: '/vendors/me/branches/{branchId}/deals',
    summary: "Create a deal on one of the caller's own branches (starts PENDING/DRAFT)",
    tags: ['Vendors - Self-service'],
    security: bearer,
    request: {
      params: z.object({ branchId: z.string().uuid() }),
      body: { content: { 'application/json': { schema: DealCreateSchema } } },
    },
    responses: { 201: { description: 'Created' }, 403: errorResponse },
  });

  registry.registerPath({
    method: 'get',
    path: '/vendors/me/branches/{branchId}/therapists',
    summary: "Therapists for one of the caller's own branches",
    tags: ['Vendors - Self-service'],
    security: bearer,
    request: { params: z.object({ branchId: z.string().uuid() }) },
    responses: { 200: { description: 'Therapists' }, 403: errorResponse },
  });

  registry.registerPath({
    method: 'post',
    path: '/vendors/me/branches/{branchId}/therapists',
    summary: "Create a therapist on one of the caller's own branches",
    tags: ['Vendors - Self-service'],
    security: bearer,
    request: {
      params: z.object({ branchId: z.string().uuid() }),
      body: { content: { 'application/json': { schema: TherapistCreateSchema } } },
    },
    responses: { 201: { description: 'Created' }, 403: errorResponse },
  });

  registry.registerPath({
    method: 'patch',
    path: '/vendors/me/therapists/{therapistId}',
    summary: "Update one of the caller's own therapists",
    tags: ['Vendors - Self-service'],
    security: bearer,
    request: {
      params: z.object({ therapistId: z.string().uuid() }),
      body: { content: { 'application/json': { schema: TherapistUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' }, 403: errorResponse, 404: errorResponse },
  });

  registry.registerPath({
    method: 'patch',
    path: '/vendors/me/therapists/{therapistId}/status',
    summary: "Activate/deactivate one of the caller's own therapists (no delete — historical Bookings may reference it)",
    tags: ['Vendors - Self-service'],
    security: bearer,
    request: {
      params: z.object({ therapistId: z.string().uuid() }),
      body: { content: { 'application/json': { schema: TherapistStatusUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' }, 403: errorResponse, 404: errorResponse },
  });

  registry.registerPath({
    method: 'get',
    path: '/vendors/me/therapists/{therapistId}/packages',
    summary: "Per-therapist priced packages for one of the caller's own therapists",
    tags: ['Vendors - Self-service'],
    security: bearer,
    request: { params: z.object({ therapistId: z.string().uuid() }) },
    responses: { 200: { description: 'Packages' }, 403: errorResponse, 404: errorResponse },
  });

  registry.registerPath({
    method: 'post',
    path: '/vendors/me/therapists/{therapistId}/packages',
    summary: "Add a duration/price package to a therapist's own menu (independent of any Deal)",
    tags: ['Vendors - Self-service'],
    security: bearer,
    request: {
      params: z.object({ therapistId: z.string().uuid() }),
      body: { content: { 'application/json': { schema: TherapistPackageCreateSchema } } },
    },
    responses: { 201: { description: 'Created' }, 403: errorResponse, 404: errorResponse, 409: errorResponse },
  });

  registry.registerPath({
    method: 'patch',
    path: '/vendors/me/therapists/{therapistId}/packages/{packageId}',
    summary: "Update one of a therapist's packages",
    tags: ['Vendors - Self-service'],
    security: bearer,
    request: {
      params: z.object({ therapistId: z.string().uuid(), packageId: z.string().uuid() }),
      body: { content: { 'application/json': { schema: TherapistPackageUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' }, 403: errorResponse, 404: errorResponse },
  });

  registry.registerPath({
    method: 'delete',
    path: '/vendors/me/therapists/{therapistId}/packages/{packageId}',
    summary: "Delete one of a therapist's packages",
    tags: ['Vendors - Self-service'],
    security: bearer,
    request: { params: z.object({ therapistId: z.string().uuid(), packageId: z.string().uuid() }) },
    responses: { 200: { description: 'Deleted' }, 403: errorResponse, 404: errorResponse },
  });

  // ─── Media routes (Deal/Product/Therapist images+video — one shared upload system, see
  // media.service.ts's doc comment) — generated per entity rather than hand-duplicated 3x,
  // since all 6 routes' shapes are identical modulo the base path and OpenAPI tag. Every path is
  // still individually registered, exactly as every other route in this file is. ────────────
  const mediaFileBody = {
    content: {
      'multipart/form-data': {
        schema: z.object({ file: z.any().openapi({ type: 'string', format: 'binary' }) }),
      },
    },
  };
  const mediaEntities: Array<{ base: string; params: z.ZodRawShape; tag: string; label: string }> = [
    {
      base: '/vendors/me/branches/{branchId}/deals/{dealId}',
      params: { branchId: z.string().uuid(), dealId: z.string().uuid() },
      tag: 'Vendors - Self-service',
      label: 'deal',
    },
    {
      base: '/vendors/me/therapists/{therapistId}',
      params: { therapistId: z.string().uuid() },
      tag: 'Vendors - Self-service',
      label: 'therapist',
    },
    {
      base: '/products/{id}',
      params: { id: z.string().uuid() },
      tag: 'Products',
      label: 'product',
    },
  ];
  for (const entity of mediaEntities) {
    const paramsSchema = z.object(entity.params);
    registry.registerPath({
      method: 'post',
      path: `${entity.base}/images`,
      summary: `Upload an image for a ${entity.label} (JPG/PNG/WEBP, 30KB–80KB)`,
      tags: [entity.tag],
      security: bearer,
      request: { params: paramsSchema, body: mediaFileBody },
      responses: { 201: { description: 'Created' }, 403: errorResponse, 404: errorResponse, 422: errorResponse },
    });
    registry.registerPath({
      method: 'delete',
      path: `${entity.base}/images/{imageId}`,
      summary: `Delete a ${entity.label} image`,
      tags: [entity.tag],
      security: bearer,
      request: { params: paramsSchema.extend({ imageId: z.string().uuid() }) },
      responses: { 200: { description: 'Deleted' }, 403: errorResponse, 404: errorResponse },
    });
    registry.registerPath({
      method: 'patch',
      path: `${entity.base}/images/reorder`,
      summary: `Reorder a ${entity.label}'s images`,
      tags: [entity.tag],
      security: bearer,
      request: { params: paramsSchema, body: { content: { 'application/json': { schema: MediaReorderSchema } } } },
      responses: { 200: { description: 'Reordered' }, 403: errorResponse, 404: errorResponse, 422: errorResponse },
    });
    registry.registerPath({
      method: 'patch',
      path: `${entity.base}/images/{imageId}/primary`,
      summary: `Set a ${entity.label}'s primary image`,
      tags: [entity.tag],
      security: bearer,
      request: { params: paramsSchema.extend({ imageId: z.string().uuid() }) },
      responses: { 200: { description: 'Updated' }, 403: errorResponse, 404: errorResponse },
    });
    registry.registerPath({
      method: 'post',
      path: `${entity.base}/video`,
      summary: `Upload/replace a ${entity.label}'s single video (MP4/WEBM/MOV, ≤1MB)`,
      tags: [entity.tag],
      security: bearer,
      request: { params: paramsSchema, body: mediaFileBody },
      responses: { 201: { description: 'Created' }, 403: errorResponse, 404: errorResponse, 422: errorResponse },
    });
    registry.registerPath({
      method: 'delete',
      path: `${entity.base}/video`,
      summary: `Delete a ${entity.label}'s video`,
      tags: [entity.tag],
      security: bearer,
      request: { params: paramsSchema },
      responses: { 200: { description: 'Deleted' }, 403: errorResponse, 404: errorResponse },
    });
  }

  registry.registerPath({
    method: 'get',
    path: '/vendors',
    summary: 'List vendors (admin)',
    tags: ['Vendors - Admin'],
    security: bearer,
    responses: { 200: { description: 'Vendors' }, 403: errorResponse },
  });

  registry.registerPath({
    method: 'post',
    path: '/vendors',
    summary: 'Create a vendor (admin)',
    tags: ['Vendors - Admin'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: VendorCreateSchema } } } },
    responses: { 201: { description: 'Created' }, 403: errorResponse },
  });

  registry.registerPath({
    method: 'get',
    path: '/vendors/{id}',
    summary: 'Get any vendor by id (admin)',
    tags: ['Vendors - Admin'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Vendor' }, 404: errorResponse },
  });

  registry.registerPath({
    method: 'patch',
    path: '/vendors/{id}',
    summary: 'Update any vendor (admin)',
    tags: ['Vendors - Admin'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: VendorUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' } },
  });

  registry.registerPath({
    method: 'patch',
    path: '/vendors/{id}/approve',
    summary: 'Approve a vendor — jumps straight to ACTIVE',
    tags: ['Vendors - Admin'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Approved' }, 403: errorResponse },
  });

  registry.registerPath({
    method: 'patch',
    path: '/vendors/{id}/reject',
    summary: 'Reject a vendor with a mandatory reason',
    tags: ['Vendors - Admin'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: VendorRejectSchema } } },
    },
    responses: { 200: { description: 'Rejected' } },
  });

  registry.registerPath({
    method: 'patch',
    path: '/vendors/{id}/status',
    summary: 'Activate / deactivate / suspend an already-approved vendor',
    tags: ['Vendors - Admin'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: VendorStatusUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' } },
  });

  registry.registerPath({
    method: 'patch',
    path: '/vendors/{id}/kyc-review',
    summary: "Verify or reject a vendor's KYC",
    tags: ['Vendors - Admin'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: VendorKycReviewSchema } } },
    },
    responses: { 200: { description: 'Updated' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/vendors/{vendorId}/branches',
    summary: "A vendor's branches (admin)",
    tags: ['Vendors - Admin'],
    security: bearer,
    request: { params: z.object({ vendorId: z.string().uuid() }) },
    responses: { 200: { description: 'Branches' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/vendors/{vendorId}/therapists',
    summary: "All of a vendor's therapists, active and inactive, across every branch (admin, read-only)",
    tags: ['Vendors - Admin'],
    security: bearer,
    request: { params: z.object({ vendorId: z.string().uuid() }) },
    responses: { 200: { description: 'Therapists' }, 403: errorResponse },
  });

  registry.registerPath({
    method: 'get',
    path: '/vendors/{vendorId}/customers',
    summary: "Distinct customers who have ordered/booked from a vendor (admin, read-only)",
    tags: ['Vendors - Admin'],
    security: bearer,
    request: { params: z.object({ vendorId: z.string().uuid() }), query: PaginationQuerySchema },
    responses: { 200: { description: 'Customers' }, 403: errorResponse },
  });

  registry.registerPath({
    method: 'post',
    path: '/vendors/{vendorId}/branches',
    summary: 'Create a branch for a vendor (admin)',
    tags: ['Vendors - Admin'],
    security: bearer,
    request: {
      params: z.object({ vendorId: z.string().uuid() }),
      body: { content: { 'application/json': { schema: BranchCreateSchema } } },
    },
    responses: { 201: { description: 'Created' } },
  });

  registry.registerPath({
    method: 'patch',
    path: '/vendors/{vendorId}/branches/{branchId}',
    summary: 'Update a branch (admin)',
    tags: ['Vendors - Admin'],
    security: bearer,
    request: {
      params: z.object({ vendorId: z.string().uuid(), branchId: z.string().uuid() }),
      body: { content: { 'application/json': { schema: BranchUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' } },
  });

  registry.registerPath({
    method: 'patch',
    path: '/vendors/{vendorId}/branches/{branchId}/status',
    summary: 'Activate/deactivate a branch (admin)',
    tags: ['Vendors - Admin'],
    security: bearer,
    request: {
      params: z.object({ vendorId: z.string().uuid(), branchId: z.string().uuid() }),
      body: { content: { 'application/json': { schema: BranchStatusUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/vendors/{vendorId}/branches/{branchId}/deals',
    summary: "A branch's deals (admin)",
    tags: ['Vendors - Admin'],
    security: bearer,
    request: { params: z.object({ vendorId: z.string().uuid(), branchId: z.string().uuid() }) },
    responses: { 200: { description: 'Deals' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/vendors/{vendorId}/branches/{branchId}/deals',
    summary: 'Create a deal on a branch (admin — starts APPROVED/ACTIVE)',
    tags: ['Vendors - Admin'],
    security: bearer,
    request: {
      params: z.object({ vendorId: z.string().uuid(), branchId: z.string().uuid() }),
      body: { content: { 'application/json': { schema: DealCreateSchema } } },
    },
    responses: { 201: { description: 'Created' } },
  });

  registry.registerPath({
    method: 'patch',
    path: '/vendors/{vendorId}/branches/{branchId}/deals/{dealId}',
    summary: 'Update a deal (admin)',
    tags: ['Vendors - Admin'],
    security: bearer,
    request: {
      params: z.object({ vendorId: z.string().uuid(), branchId: z.string().uuid(), dealId: z.string().uuid() }),
      body: { content: { 'application/json': { schema: DealUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' } },
  });

  registry.registerPath({
    method: 'patch',
    path: '/vendors/{vendorId}/branches/{branchId}/deals/{dealId}/status',
    summary: 'Activate/deactivate/expire a deal (admin)',
    tags: ['Vendors - Admin'],
    security: bearer,
    request: {
      params: z.object({ vendorId: z.string().uuid(), branchId: z.string().uuid(), dealId: z.string().uuid() }),
      body: { content: { 'application/json': { schema: DealStatusUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' } },
  });

  registry.registerPath({
    method: 'patch',
    path: '/vendors/{vendorId}/branches/{branchId}/deals/{dealId}/approve',
    summary: 'Approve a deal — jumps straight to ACTIVE',
    tags: ['Vendors - Admin'],
    security: bearer,
    request: { params: z.object({ vendorId: z.string().uuid(), branchId: z.string().uuid(), dealId: z.string().uuid() }) },
    responses: { 200: { description: 'Approved' } },
  });

  registry.registerPath({
    method: 'patch',
    path: '/vendors/{vendorId}/branches/{branchId}/deals/{dealId}/reject',
    summary: 'Reject a deal with a mandatory reason',
    tags: ['Vendors - Admin'],
    security: bearer,
    request: {
      params: z.object({ vendorId: z.string().uuid(), branchId: z.string().uuid(), dealId: z.string().uuid() }),
      body: { content: { 'application/json': { schema: DealRejectSchema } } },
    },
    responses: { 200: { description: 'Rejected' } },
  });

  // ─── Categories / Sub Categories ──────────────────────────────────────────────

  registry.registerPath({
    method: 'get',
    path: '/categories',
    summary: 'List categories/subcategories (?scope=top|sub, ?parentId=)',
    tags: ['Categories'],
    security: bearer,
    responses: { 200: { description: 'Categories' }, 403: errorResponse },
  });

  registry.registerPath({
    method: 'post',
    path: '/categories',
    summary: 'Create a category or subcategory (parentId set = subcategory)',
    tags: ['Categories'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: CategoryCreateSchema } } } },
    responses: { 201: { description: 'Created' }, 409: errorResponse },
  });

  registry.registerPath({
    method: 'get',
    path: '/categories/{id}',
    summary: 'Get a category by id',
    tags: ['Categories'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Category' }, 404: errorResponse },
  });

  registry.registerPath({
    method: 'patch',
    path: '/categories/{id}',
    summary: 'Update a category',
    tags: ['Categories'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: CategoryUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' } },
  });

  registry.registerPath({
    method: 'patch',
    path: '/categories/{id}/status',
    summary: 'Activate/deactivate a category',
    tags: ['Categories'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: CategoryStatusUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' } },
  });

  registry.registerPath({
    method: 'delete',
    path: '/categories/{id}',
    summary: 'Delete a category (must have no subcategories or referencing deals)',
    tags: ['Categories'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Deleted' }, 409: errorResponse },
  });

  // ─── Products ──────────────────────────────────────────────────────────────

  registry.registerPath({
    method: 'get',
    path: '/products',
    summary: 'List products (?search=, ?categoryId=, ?subcategoryId=, ?status=active|inactive)',
    tags: ['Products'],
    security: bearer,
    responses: { 200: { description: 'Products' }, 403: errorResponse },
  });

  registry.registerPath({
    method: 'post',
    path: '/products',
    summary: 'Create a product',
    tags: ['Products'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: ProductCreateSchema } } } },
    responses: { 201: { description: 'Created' }, 409: errorResponse },
  });

  registry.registerPath({
    method: 'get',
    path: '/products/{id}',
    summary: 'Get a product by id',
    tags: ['Products'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Product' }, 404: errorResponse },
  });

  registry.registerPath({
    method: 'patch',
    path: '/products/{id}',
    summary: 'Update a product',
    tags: ['Products'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: ProductUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' } },
  });

  registry.registerPath({
    method: 'patch',
    path: '/products/{id}/status',
    summary: 'Activate/deactivate a product',
    tags: ['Products'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: ProductStatusUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' } },
  });

  registry.registerPath({
    method: 'delete',
    path: '/products/{id}',
    summary: 'Delete a product',
    tags: ['Products'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Deleted' } },
  });

  // ─── Services ──────────────────────────────────────────────────────────────

  registry.registerPath({
    method: 'get',
    path: '/services',
    summary: 'List services (?search=, ?categoryId=, ?subcategoryId=, ?status=active|inactive)',
    tags: ['Services'],
    security: bearer,
    responses: { 200: { description: 'Services' }, 403: errorResponse },
  });

  registry.registerPath({
    method: 'post',
    path: '/services',
    summary: 'Create a service',
    tags: ['Services'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: ServiceCreateSchema } } } },
    responses: { 201: { description: 'Created' }, 409: errorResponse },
  });

  registry.registerPath({
    method: 'get',
    path: '/services/{id}',
    summary: 'Get a service by id',
    tags: ['Services'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Service' }, 404: errorResponse },
  });

  registry.registerPath({
    method: 'patch',
    path: '/services/{id}',
    summary: 'Update a service',
    tags: ['Services'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: ServiceUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' } },
  });

  registry.registerPath({
    method: 'patch',
    path: '/services/{id}/status',
    summary: 'Activate/deactivate a service',
    tags: ['Services'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: ServiceStatusUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' } },
  });

  registry.registerPath({
    method: 'delete',
    path: '/services/{id}',
    summary: 'Delete a service',
    tags: ['Services'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Deleted' } },
  });

  // ─── Public customer catalogue (no auth) ──────────────────────────────────────

  registry.registerPath({
    method: 'get',
    path: '/catalog/categories',
    summary: 'Public active category tree (top-level + children)',
    tags: ['Catalogue (public)'],
    responses: { 200: { description: 'Category tree' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/catalog/categories/{slug}',
    summary: 'Public active category by slug, with its active subcategories',
    tags: ['Catalogue (public)'],
    request: { params: z.object({ slug: z.string() }) },
    responses: { 200: { description: 'Category' }, 404: errorResponse },
  });

  registry.registerPath({
    method: 'get',
    path: '/catalog/deals',
    summary:
      'Public deal listing — active/approved deals with an active vendor+branch (+active linked service/product); ' +
      'sort=newest|discount (default newest), minPrice/maxPrice filter on salePrice',
    tags: ['Catalogue (public)'],
    request: { query: CatalogDealQuerySchema },
    responses: { 200: { description: 'Deals' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/catalog/deals/{id}',
    summary: 'A single public deal — 404s if not currently visible (inactive/unapproved/hidden vendor or branch)',
    tags: ['Catalogue (public)'],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Deal' }, 404: errorResponse },
  });

  registry.registerPath({
    method: 'get',
    path: '/catalog/vendors/{slug}',
    summary: 'Public vendor storefront — 404s if not found or not ACTIVE; nests active branches + their active therapists (never Deals — call GET /catalog/deals?vendorId=&branchId= separately)',
    tags: ['Catalogue (public)'],
    request: { params: z.object({ slug: z.string() }) },
    responses: { 200: { description: 'Vendor' }, 404: errorResponse },
  });

  registry.registerPath({
    method: 'get',
    path: '/catalog/therapists',
    summary:
      'Public therapist listing — active therapists with an active vendor+branch, independent of any Deal ' +
      '(browsable/bookable on their own; call GET /catalog/therapists/{id} for packages)',
    tags: ['Catalogue (public)'],
    request: { query: CatalogTherapistQuerySchema },
    responses: { 200: { description: 'Therapists' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/catalog/therapists/{id}',
    summary: 'A single public therapist with its active packages — 404s if not currently visible (inactive/hidden vendor or branch)',
    tags: ['Catalogue (public)'],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Therapist' }, 404: errorResponse },
  });

  // ─── Cart (customer self-service, product deals only) ────────────────────────

  registry.registerPath({
    method: 'get',
    path: '/cart',
    summary: "The caller's own cart (lazily created if none exists)",
    tags: ['Cart'],
    security: bearer,
    responses: { 200: { description: 'Cart' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/cart/items',
    summary: 'Add a product deal to the cart (rejects service deals and mismatched vendor/branch)',
    tags: ['Cart'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: CartAddItemSchema } } } },
    responses: { 201: { description: 'Updated cart' }, 409: errorResponse, 422: errorResponse },
  });

  registry.registerPath({
    method: 'patch',
    path: '/cart/items/{id}',
    summary: 'Update a cart item quantity',
    tags: ['Cart'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: CartUpdateItemSchema } } },
    },
    responses: { 200: { description: 'Updated cart' }, 404: errorResponse },
  });

  registry.registerPath({
    method: 'delete',
    path: '/cart/items/{id}',
    summary: 'Remove an item from the cart',
    tags: ['Cart'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Updated cart' }, 404: errorResponse },
  });

  registry.registerPath({
    method: 'delete',
    path: '/cart',
    summary: 'Clear the cart',
    tags: ['Cart'],
    security: bearer,
    responses: { 200: { description: 'Cleared cart' } },
  });

  // ─── Wishlist (customer self-service, any deal type) ──────────────────────────

  registry.registerPath({
    method: 'get',
    path: '/wishlist',
    summary: "The caller's own wishlist — items whose deal is no longer visible/purchasable are omitted",
    tags: ['Wishlist'],
    security: bearer,
    responses: { 200: { description: 'Wishlist items' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/wishlist',
    summary: 'Add a deal to the wishlist (idempotent — re-adding an already-saved deal is a no-op)',
    tags: ['Wishlist'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: WishlistAddItemSchema } } } },
    responses: { 201: { description: 'Wishlist item' }, 404: errorResponse },
  });

  registry.registerPath({
    method: 'get',
    path: '/wishlist/check/{dealId}',
    summary: 'Whether the caller has this deal wishlisted',
    tags: ['Wishlist'],
    security: bearer,
    request: { params: z.object({ dealId: z.string().uuid() }) },
    responses: { 200: { description: 'Wishlisted flag' } },
  });

  registry.registerPath({
    method: 'delete',
    path: '/wishlist/{dealId}',
    summary: "Remove a deal from the caller's wishlist",
    tags: ['Wishlist'],
    security: bearer,
    request: { params: z.object({ dealId: z.string().uuid() }) },
    responses: { 200: { description: 'Removed' }, 404: errorResponse },
  });

  // ─── Bookings (customer self-service, service deals only) ────────────────────

  registry.registerPath({
    method: 'get',
    path: '/bookings',
    summary: "The caller's own bookings (?status=PENDING|CONFIRMED|COMPLETED|CANCELLED)",
    tags: ['Bookings'],
    security: bearer,
    responses: { 200: { description: 'Bookings' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/bookings',
    summary:
      'Book a service deal (dealId) OR a Therapist directly (therapistId+durationMinutes, no dealId) — ' +
      'snapshots price/duration; vendor/branch derived from the deal or therapist server-side, never the client',
    tags: ['Bookings'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: BookingCreateSchema } } } },
    responses: { 201: { description: 'Created' }, 422: errorResponse },
  });

  registry.registerPath({
    method: 'get',
    path: '/bookings/{id}',
    summary: 'A single booking, scoped to the caller',
    tags: ['Bookings'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Booking' }, 404: errorResponse },
  });

  registry.registerPath({
    method: 'patch',
    path: '/bookings/{id}/status',
    summary: 'Cancel a booking (the only customer self-service transition)',
    tags: ['Bookings'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: BookingCancelSchema } } },
    },
    responses: { 200: { description: 'Updated' }, 409: errorResponse },
  });

  // ─── Bookings — vendor/admin (Phase 10, reuses the existing `orders` permission) ──

  registry.registerPath({
    method: 'get',
    path: '/bookings/vendor',
    summary: 'List bookings (admin: all/filterable by vendorId; vendor: force-scoped to own vendor)',
    tags: ['Bookings - Vendor/Admin'],
    security: bearer,
    responses: { 200: { description: 'Bookings' }, 403: errorResponse },
  });

  registry.registerPath({
    method: 'get',
    path: '/bookings/vendor/{id}',
    summary: 'Get any booking by id (admin, or a vendor for its own booking only)',
    tags: ['Bookings - Vendor/Admin'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Booking' }, 404: errorResponse },
  });

  registry.registerPath({
    method: 'patch',
    path: '/bookings/vendor/{id}/status',
    summary: 'Confirm/complete/cancel a booking (vendor: own bookings only; admin: any)',
    tags: ['Bookings - Vendor/Admin'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: BookingVendorStatusUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' }, 403: errorResponse, 409: errorResponse },
  });

  // ─── Orders (Cart/Booking convergence — customer self-service + admin/vendor) ─

  registry.registerPath({
    method: 'post',
    path: '/orders/checkout',
    summary: "Create a PRODUCT order from the caller's cart (server-recalculated pricing, transactional)",
    tags: ['Orders'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: OrderCheckoutSchema } } } },
    responses: { 201: { description: 'Created' }, 422: errorResponse, 409: errorResponse },
  });

  registry.registerPath({
    method: 'post',
    path: '/orders/from-booking',
    summary: "Create a SERVICE order from the caller's booking (copies its immutable price/duration snapshot)",
    tags: ['Orders'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: OrderFromBookingSchema } } } },
    responses: { 201: { description: 'Created' }, 409: errorResponse },
  });

  registry.registerPath({
    method: 'get',
    path: '/orders/me',
    summary: "The caller's own orders",
    tags: ['Orders'],
    security: bearer,
    responses: { 200: { description: 'Orders' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/orders/me/{id}',
    summary: 'A single order, scoped to the caller',
    tags: ['Orders'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Order' }, 404: errorResponse },
  });

  registry.registerPath({
    method: 'patch',
    path: '/orders/me/{id}/status',
    summary: 'Cancel an order (the only self-service transition)',
    tags: ['Orders'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: OrderCustomerCancelSchema } } },
    },
    responses: { 200: { description: 'Updated' }, 409: errorResponse },
  });

  registry.registerPath({
    method: 'get',
    path: '/orders',
    summary: 'List orders (admin: all/filterable by vendorId; vendor: force-scoped to own vendor)',
    tags: ['Orders - Admin'],
    security: bearer,
    responses: { 200: { description: 'Orders' }, 403: errorResponse },
  });

  registry.registerPath({
    method: 'get',
    path: '/orders/{id}',
    summary: 'Get any order by id (admin, or a vendor for its own order only)',
    tags: ['Orders - Admin'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Order' }, 404: errorResponse },
  });

  registry.registerPath({
    method: 'patch',
    path: '/orders/{id}/status',
    summary: 'Change an order status (admin only, gated on orders:status_change)',
    tags: ['Orders - Admin'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: OrderStatusUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' }, 403: errorResponse, 409: errorResponse },
  });

  // ─── Payment (Razorpay) ────────────────────────────────────────────────────────

  registry.registerPath({
    method: 'post',
    path: '/orders/me/{id}/pay',
    summary: 'Create (or reuse an in-flight) Razorpay order for the caller\'s own Order — amount server-computed from Order.total',
    tags: ['Payments'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Razorpay order details (providerOrderId, amount, currency, keyId)' }, 409: errorResponse },
  });

  registry.registerPath({
    method: 'post',
    path: '/orders/me/{id}/pay-cod',
    summary: 'Confirm a Cash on Delivery order — no gateway; creates a CREATED-status COD Payment and moves the Order to CONFIRMED',
    tags: ['Payments'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Order confirmed' }, 409: errorResponse },
  });

  registry.registerPath({
    method: 'post',
    path: '/orders/me/{id}/verify-payment',
    summary: "Verify the checkout widget's success callback signature server-side",
    tags: ['Payments'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: VerifyPaymentSchema } } },
    },
    responses: { 200: { description: 'Order confirmed' }, 404: errorResponse, 422: errorResponse },
  });

  registry.registerPath({
    method: 'post',
    path: '/orders/pay-batch',
    summary:
      'Combined checkout (Deal + Therapist + Product together) — one Razorpay order for the SUM of several ' +
      'Orders\' totals; one checkout action, one payment, multiple Order rows under the hood',
    tags: ['Payments'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: OrderBatchSchema } } } },
    responses: { 200: { description: 'Razorpay order details (providerOrderId, amount, currency, keyId)' }, 409: errorResponse },
  });

  registry.registerPath({
    method: 'post',
    path: '/orders/pay-batch/cod',
    summary: 'Confirm Cash on Delivery for every Order in a combined checkout batch, together in one transaction',
    tags: ['Payments'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: OrderBatchSchema } } } },
    responses: { 200: { description: 'Confirmed orders' }, 409: errorResponse },
  });

  registry.registerPath({
    method: 'post',
    path: '/orders/pay-batch/verify',
    summary: "Verify the checkout widget's success callback signature once, then confirm every Order in the batch together",
    tags: ['Payments'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: VerifyBatchPaymentSchema } } } },
    responses: { 200: { description: 'Confirmed orders' }, 404: errorResponse, 422: errorResponse },
  });

  registry.registerPath({
    method: 'post',
    path: '/payments/webhook/razorpay',
    summary: 'Razorpay webhook — signature-verified, idempotent, the authoritative payment-confirmation path',
    tags: ['Payments'],
    responses: { 200: { description: 'Acknowledged' }, 401: errorResponse },
  });

  // ─── Dashboard ─────────────────────────────────────────────────────────────

  registry.registerPath({
    method: 'get',
    path: '/dashboard/stats',
    summary: 'Aggregate marketplace counts (vendors/customers/branches/categories/subCategories/services/products/deals/orders/bookings) and revenue — gated on dashboard:view',
    tags: ['Dashboard'],
    security: bearer,
    responses: {
      200: { description: 'Aggregate stats', content: { 'application/json': { schema: DashboardStatsResponseSchema } } },
      403: errorResponse,
    },
  });

  // ─── Customers (SuperAdmin/staff directory, `customers:view`) ────────────────

  registry.registerPath({
    method: 'get',
    path: '/customers',
    summary: 'List customers (any User holding the customer role) — search/paginate',
    tags: ['Customers'],
    security: bearer,
    responses: { 200: { description: 'Customers' }, 403: errorResponse },
  });

  registry.registerPath({
    method: 'get',
    path: '/customers/{id}',
    summary: 'A single customer, with order/booking counts',
    tags: ['Customers'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Customer' }, 404: errorResponse },
  });

  // ─── Business module stubs ───────────────────────────────────────────────────

  for (const tag of ['inventory', 'reports']) {
    registry.registerPath({
      method: 'get',
      path: `/${tag}`,
      summary: `List ${tag} (stub — gated by requirePermission('${tag}', 'view'))`,
      tags: ['Business modules (stub)'],
      security: bearer,
      responses: { 200: { description: 'Empty list' }, 403: errorResponse },
    });
  }

  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: { title: 'MSD API', version: '1.0.0', description: 'Massage deals — RBAC, auth, and business module stubs.' },
    servers: [{ url: '/api/v1' }],
  });
}

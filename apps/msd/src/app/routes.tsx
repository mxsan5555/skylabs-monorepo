import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { RequireAuth, RequirePermission, useAuth } from '@skylabs-monorepo/shared-auth/react';
import { PublicLayout } from './layouts/public-layout';
import { AuthLayout } from './layouts/auth-layout';
import { AdminLayout } from './layouts/admin-layout';
import { AdminPage } from './admin/admin-page';
import Home from './pages/home/home';
import NotFound from './pages/not-found/not-found';
import Showcase from './pages/showcase/showcase';
import Blog from './pages/blog/blog';
import BlogDetail from './pages/blog-detail/blog-detail';
import SignIn from './pages/sign-in/sign-in';
import Otp from './pages/otp/otp';
import { ChooseExperience } from './pages/choose-experience/choose-experience';
import Profile from './pages/account/profile';
import Dashboard from './pages/account/dashboard';
import { RoleManagement } from './pages/account/roles/roles';
import { UserManagement } from './pages/account/users/users';
import { AuditLogs } from './pages/account/audit-logs/audit-logs';
import { VendorManagement } from './pages/account/vendors/vendors';
import { BranchList } from './pages/account/vendors/branch-list';
import { DealList } from './pages/account/vendors/deal-list';
import { VendorBusinessProfile } from './pages/account/vendors/vendor-business-profile';
import { VendorBranchesDeals } from './pages/account/vendors/vendor-branches-deals';
import { VendorCustomers } from './pages/account/vendors/vendor-customers';
import { VendorTherapists } from './pages/account/vendors/vendor-therapists';
import { VendorDeals } from './pages/account/vendors/vendor-deals';
import { CategoryManagement } from './pages/account/masters/categories';
import { ProductManagement } from './pages/account/products/products';
import { ServiceManagement } from './pages/account/services/services';
import { OrderManagement } from './pages/account/orders/orders';
import { BookingManagement } from './pages/account/bookings/bookings';
import Search from './pages/search/search';
import Category from './pages/category/category';
import { CategoriesIndex } from './pages/categories/categories';
import { Orders } from './pages/orders/orders';
import { OrderDetail } from './pages/orders/order-detail';
import { Bookings } from './pages/bookings/bookings';
import DealDetail from './pages/deal-detail/deal-detail';
import Cart from './pages/cart/cart';
import Wishlist from './pages/wishlist/wishlist';
import Checkout from './pages/checkout/checkout';
import ProductListing from './pages/products/products';
import ProductDetail from './pages/product-detail/product-detail';
import VendorPage from './pages/vendor/vendor';
import { MyAccountLayout } from './pages/my-account/my-account-layout';
import { MyAccountProfile } from './pages/my-account/profile';
import { MyAccountPayments } from './pages/my-account/payments';

/**
 * `/account/vendors` serves three audiences under different permission keys: admins hold
 * `vendors:view`, vendor-role users hold `vendors:custom` (never `view` — that would also
 * unlock the admin "list every vendor" endpoint, see vendors.tsx's doc comment) plus the
 * narrower `vendor-portal:view` that only surfaces the "My Business" sidebar item.
 * `RequirePermission` only checks a single action, so this route needs its own small
 * OR-of-three-actions guard instead — kept local here rather than changing the shared
 * `RequirePermission` component used by every other route in the app.
 */
function VendorsRouteGuard({ children }: { children: ReactNode }) {
  const { can } = useAuth();
  if (!can('vendors', 'view') && !can('vendors', 'custom') && !can('vendor-portal', 'view')) {
    return <Navigate to="/account/profile" replace />;
  }
  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        {/* ── Consumer storefront ── */}
        <Route path="/" element={<Home />} />
        <Route path="/explore" element={<Search />} />
        {/* Customer catalogue — Category → Sub-category → Service/Product → Deal — backed by
            `GET /catalog/*`. `/categories` is the "browse all categories" entry point (formerly
            the marketplace route namespace, retired once this page absorbed its real-API data
            source). */}
        <Route path="/categories" element={<CategoriesIndex />} />
        <Route path="/category/:slug" element={<Category />} />
        <Route path="/deal/:id" element={<DealDetail />} />
        <Route path="/products" element={<ProductListing />} />
        <Route path="/products/:id" element={<ProductDetail />} />
        <Route path="/vendor/:slug" element={<VendorPage />} />
        <Route
          path="/cart"
          element={
            <RequireAuth>
              <Cart />
            </RequireAuth>
          }
        />
        <Route
          path="/bookings"
          element={
            <RequireAuth>
              <Bookings />
            </RequireAuth>
          }
        />
        <Route
          path="/orders"
          element={
            <RequireAuth>
              <Orders />
            </RequireAuth>
          }
        />
        <Route
          path="/orders/:id"
          element={
            <RequireAuth>
              <OrderDetail />
            </RequireAuth>
          }
        />

        {/* ── Auth-gated consumer pages ── */}
        <Route
          path="/wishlist"
          element={
            <RequireAuth>
              <Wishlist />
            </RequireAuth>
          }
        />
        <Route
          path="/checkout"
          element={
            <RequireAuth>
              <Checkout />
            </RequireAuth>
          }
        />

        {/* ── Customer "My Account" (storefront chrome, never AdminLayout) ── */}
        <Route
          path="/my-account"
          element={
            <RequireAuth>
              <MyAccountLayout />
            </RequireAuth>
          }
        >
          <Route index element={<MyAccountProfile />} />
          <Route path="payments" element={<MyAccountPayments />} />
          <Route path="invoices" element={<AdminPage title="Invoices" subtitle="Module coming soon." />} />
          <Route path="settings" element={<AdminPage title="Settings" subtitle="Module coming soon." />} />
        </Route>

        {/* ── Content pages ── */}
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<BlogDetail />} />
        <Route path="/showcase" element={<Showcase />} />

        {/* ── Catch-all 404, inside the shell so it keeps header/footer. ── */}
        <Route path="*" element={<NotFound />} />
      </Route>

      {/* Auth screens use a minimal centered shell (no header/footer). */}
      <Route element={<AuthLayout />}>
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/otp" element={<Otp />} />
        <Route
          path="/choose-experience"
          element={
            <RequireAuth>
              <ChooseExperience />
            </RequireAuth>
          }
        />
      </Route>

      {/* Authenticated console (after login / "My account"). Every leaf below
          `/account/dashboard` and `/account/profile` is additionally gated by
          the exact `${menuKey}:view` permission the server already filtered
          `bootstrap.menu` by — belt-and-suspenders, since msd-api re-checks on
          every request. A user lacking a permission is bounced to
          `/account/profile` (RequirePermission's default fallback). */}
      <Route
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route path="/account" element={<Navigate to="/account/profile" replace />} />
        <Route
          path="/account/dashboard"
          element={
            <RequirePermission menuKey="dashboard">
              <Dashboard />
            </RequirePermission>
          }
        />
        <Route path="/account/profile" element={<Profile />} />

        <Route
          path="/account/customers"
          element={
            <RequirePermission menuKey="customers">
              <AdminPage title="Customers" subtitle="Module coming soon." />
            </RequirePermission>
          }
        />
        <Route
          path="/account/vendors"
          element={
            <VendorsRouteGuard>
              <VendorManagement />
            </VendorsRouteGuard>
          }
        />
        {/* Self-service split of the old combined "My Business" page — "Business Profile" and
            "Branches & Deals" as two distinct nav items, both gated by `vendor-portal:view`
            (the same narrow permission that used to gate the single combined page, granted
            only to the `vendor` role — see vendors.tsx's `VendorsRouteGuard` doc comment). */}
        <Route
          path="/account/vendor-profile"
          element={
            <RequirePermission menuKey="vendor-portal">
              <VendorBusinessProfile />
            </RequirePermission>
          }
        />
        <Route
          path="/account/vendor-branches-deals"
          element={
            <RequirePermission menuKey="vendor-portal">
              <VendorBranchesDeals />
            </RequirePermission>
          }
        />
        {/* Vendor-facing flat "Deals / Packages" — same `vendor-portal:view` permission, same
            underlying deals data as "Branches" above, just merged across all of the vendor's
            branches into one table instead of one-branch-at-a-time. */}
        <Route
          path="/account/vendor-deals"
          element={
            <RequirePermission menuKey="vendor-portal">
              <VendorDeals />
            </RequirePermission>
          }
        />
        {/* Vendor-facing Customers list — reuses `vendor-portal:view` too, so it's visible with
            zero seed.ts/permission changes (same one-permissionKey-many-nodes pattern as
            orders/bookings above). Data itself is scoped `vendors:custom` server-side. */}
        <Route
          path="/account/vendor-customers"
          element={
            <RequirePermission menuKey="vendor-portal">
              <VendorCustomers />
            </RequirePermission>
          }
        />
        {/* Vendor-facing Therapists CRUD — reuses `vendor-portal:view` too (same one-permissionKey-
            many-nodes pattern as Customers above). Data itself is scoped `vendors:custom` server-side. */}
        <Route
          path="/account/vendor-therapists"
          element={
            <RequirePermission menuKey="vendor-portal">
              <VendorTherapists />
            </RequirePermission>
          }
        />
        <Route
          path="/account/branches"
          element={
            <RequirePermission menuKey="vendors">
              <BranchList />
            </RequirePermission>
          }
        />
        <Route
          path="/account/deals"
          element={
            <RequirePermission menuKey="vendors">
              <DealList />
            </RequirePermission>
          }
        />
        <Route
          path="/account/orders"
          element={
            <RequirePermission menuKey="orders">
              <OrderManagement />
            </RequirePermission>
          }
        />
        <Route
          path="/account/bookings"
          element={
            <RequirePermission menuKey="orders">
              <BookingManagement />
            </RequirePermission>
          }
        />
        <Route
          path="/account/services"
          element={
            <RequirePermission menuKey="services">
              <ServiceManagement />
            </RequirePermission>
          }
        />
        <Route
          path="/account/products"
          element={
            <RequirePermission menuKey="products">
              <ProductManagement />
            </RequirePermission>
          }
        />
        {/* <Route
          path="/account/inventory"
          element={
            <RequirePermission menuKey="inventory">
              <AdminPage title="Inventory" subtitle="Module coming soon." />
            </RequirePermission>
          }
        /> */}
        <Route
          path="/account/reports"
          element={
            <RequirePermission menuKey="reports">
              <AdminPage title="Reports" subtitle="Module coming soon." />
            </RequirePermission>
          }
        />
        <Route
          path="/account/masters/categories"
          element={
            <RequirePermission menuKey="masters.categories">
              <CategoryManagement scope="top" />
            </RequirePermission>
          }
        />

        <Route
          path="/account/masters/sub-categories"
          element={
            <RequirePermission menuKey="masters.sub-categories">
              <CategoryManagement scope="sub" />
            </RequirePermission>
          }
        />
         <Route
          path="/account/masters/deals"
          element={
            <RequirePermission menuKey="masters.deals">
              <AdminPage title="Deals" subtitle="Module coming soon." />
            </RequirePermission>
          }
        />
        <Route
          path="/account/masters/tags"
          element={
            <RequirePermission menuKey="masters.tags">
              <AdminPage title="Marketing Tags" subtitle="Module coming soon." />
            </RequirePermission>
          }
        />
        <Route
          path="/account/administration/roles"
          element={
            <RequirePermission menuKey="rbac.roles">
              <RoleManagement />
            </RequirePermission>
          }
        />
        <Route
          path="/account/administration/users"
          element={
            <RequirePermission menuKey="rbac.users">
              <UserManagement />
            </RequirePermission>
          }
        />
        <Route
          path="/account/administration/audit-logs"
          element={
            <RequirePermission menuKey="rbac.audit-logs">
              <AuditLogs />
            </RequirePermission>
          }
        />
        <Route
          path="/account/settings"
          element={
            <RequirePermission menuKey="settings">
              <AdminPage title="Settings" subtitle="Module coming soon." />
            </RequirePermission>
          }
        />
      </Route>
    </Routes>
  );
}

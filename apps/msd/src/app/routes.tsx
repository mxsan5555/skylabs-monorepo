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
import Profile from './pages/account/profile';
import Dashboard from './pages/account/dashboard';
import { RoleManagement } from './pages/account/roles/roles';
import { UserManagement } from './pages/account/users/users';
import { AuditLogs } from './pages/account/audit-logs/audit-logs';
import { VendorManagement } from './pages/account/vendors/vendors';
import { BranchList } from './pages/account/vendors/branch-list';
import { DealList } from './pages/account/vendors/deal-list';
import { CategoryManagement } from './pages/account/masters/categories';
import { ProductManagement } from './pages/account/products/products';
import { ServiceManagement } from './pages/account/services/services';
import { OrderManagement } from './pages/account/orders/orders';
import Search from './pages/search/search';
import Category from './pages/category/category';
import { MarketplaceCategories } from './pages/marketplace/marketplace-categories';
import { MarketplaceCategory } from './pages/marketplace/marketplace-category';
import { MarketplaceCart } from './pages/marketplace/marketplace-cart';
import { MarketplaceBookings } from './pages/marketplace/marketplace-bookings';
import { MarketplaceOrders } from './pages/marketplace/marketplace-orders';
import { MarketplaceOrderDetail } from './pages/marketplace/marketplace-order-detail';
import DealDetail from './pages/deal-detail/deal-detail';
import Cart from './pages/cart/cart';
import Wishlist from './pages/wishlist/wishlist';
import Checkout from './pages/checkout/checkout';
import ProductListing from './pages/products/products';
import ProductDetail from './pages/product-detail/product-detail';
import VendorPage from './pages/vendor/vendor';

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
        <Route path="/category/:slug" element={<Category />} />
        {/* Real, backend-driven customer catalogue (Category → Sub-category → Service/Product →
            Deal) — kept as its own route namespace, separate from the static-data /category and
            /products pages above, so existing mock-data links/pages keep working unchanged. */}
        <Route path="/marketplace" element={<MarketplaceCategories />} />
        <Route
          path="/marketplace/cart"
          element={
            <RequireAuth>
              <MarketplaceCart />
            </RequireAuth>
          }
        />
        <Route
          path="/marketplace/bookings"
          element={
            <RequireAuth>
              <MarketplaceBookings />
            </RequireAuth>
          }
        />
        <Route
          path="/marketplace/orders"
          element={
            <RequireAuth>
              <MarketplaceOrders />
            </RequireAuth>
          }
        />
        <Route
          path="/marketplace/orders/:id"
          element={
            <RequireAuth>
              <MarketplaceOrderDetail />
            </RequireAuth>
          }
        />
        <Route path="/marketplace/:slug" element={<MarketplaceCategory />} />
        <Route path="/deal/:id" element={<DealDetail />} />
        <Route path="/products" element={<ProductListing />} />
        <Route path="/products/:id" element={<ProductDetail />} />
        <Route path="/vendor/:slug" element={<VendorPage />} />
        <Route path="/cart" element={<Cart />} />

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

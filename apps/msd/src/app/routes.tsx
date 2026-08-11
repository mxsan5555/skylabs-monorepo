import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequirePermission } from '@skylabs-monorepo/shared-auth/react';
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
import Search from './pages/search/search';
import Category from './pages/category/category';
import DealDetail from './pages/deal-detail/deal-detail';
import Cart from './pages/cart/cart';
import Wishlist from './pages/wishlist/wishlist';
import Checkout from './pages/checkout/checkout';
import ProductListing from './pages/products/products';
import ProductDetail from './pages/product-detail/product-detail';
import VendorPage from './pages/vendor/vendor';
import { CategoryPage } from './admin/category/category';
import { SubCategoryPage } from './admin/subcategory/subCategory';
import { ServicePage } from './admin/service/service';
import DealPage from './admin/deal/deal';
import CustomerPage from './admin/customer/customer';
import Vendor from './admin/vendor/vendor';
import OrdersPage from './admin/orders/order';
import ProductsPage from './admin/products/products';
import WishlistPage from './admin/wishlist/wishlist';
import AddressPage from './admin/address/address';
import RefundPage from './admin/refund/refund';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        {/* ── Consumer storefront ── */}
        <Route path="/" element={<Home />} />
        <Route path="/explore" element={<Search />} />
        <Route path="/category/:slug" element={<Category />} />
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
              <CustomerPage/>
            </RequirePermission>
          }
        />
        <Route
          path="/account/vendors"
          element={
            <RequirePermission menuKey="vendors">
              <Vendor/>
            </RequirePermission>
          }
        />
        <Route
          path="/account/orders"
          element={
            <RequirePermission menuKey="orders">
             <OrdersPage/>
            </RequirePermission>
          }
        />
        <Route
          path="/account/products"
          element={
            <RequirePermission menuKey="products">
             <ProductsPage/>
            </RequirePermission>
          }
        />
        <Route
          path="/account/wishlist"
          element={
            <RequirePermission menuKey="wishlist">
             <WishlistPage/>
            </RequirePermission>
          }
        />
        <Route
          path="/account/address"
          element={
            <RequirePermission menuKey="address">
              <AddressPage/>
            </RequirePermission>
          }
        />
        <Route
          path="/account/refund"
          element={
            <RequirePermission menuKey="refund">
             <RefundPage/>
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
              <CategoryPage/>
            </RequirePermission>
          }
        />

        <Route
          path="/account/masters/sub-categories"
          element={
            <RequirePermission menuKey="masters.sub-categories">
              <SubCategoryPage/>
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
          path="/account/masters/service"
          element={
            <RequirePermission menuKey="masters.service">
              <ServicePage/>
            </RequirePermission>
          }
        />

         <Route
          path="/account/masters/deals"
          element={
            <RequirePermission menuKey="masters.deals">
              <DealPage/>
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

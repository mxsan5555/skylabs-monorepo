import { Navigate, Route, Routes } from 'react-router-dom';
import { PublicLayout } from './layouts/public-layout';
import { AuthLayout } from './layouts/auth-layout';
import { AdminLayout } from './layouts/admin-layout';
import { RequireAuth } from '../auth/require-auth';
import { RequireRole } from '../auth/require-role';
import Home from './pages/home/home';
import NotFound from './pages/not-found/not-found';
import Showcase from './pages/showcase/showcase';
import Blog from './pages/blog/blog';
import BlogDetail from './pages/blog-detail/blog-detail';
import SignIn from './pages/sign-in/sign-in';
import Otp from './pages/otp/otp';
import Profile from './pages/account/profile';
import { Dashboard, Deals, Promotions, Sales } from './pages/account/role-pages';
<<<<<<< HEAD
import { Categories } from './pages/master/categories/categories';
import { AddCategory } from './pages/master/categories/add-category';
import Search from './pages/search/search';
import Contact from './pages/contact/contact';
import { SpaDetails } from './pages/spa-details/spa-details';
import { BeautySpa } from './pages/beauty-spa/beauty-spa';
/**
 * Central route table. Public pages use PublicLayout, auth screens use
 * AuthLayout, and the signed-in console uses AdminLayout (role-filtered).
 * Role-specific pages are wrapped in <RequireRole>.
 */
=======
import Search from './pages/search/search';
import Category from './pages/category/category';
import DealDetail from './pages/deal-detail/deal-detail';
import Cart from './pages/cart/cart';
import Wishlist from './pages/wishlist/wishlist';
import Checkout from './pages/checkout/checkout';

>>>>>>> b8ad1f645856014b185848c108bb9207db76e646
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        {/* ── Consumer storefront ── */}
        <Route path="/" element={<Home />} />
        <Route path="/explore" element={<Search />} />
        <Route path="/category/:slug" element={<Category />} />
        <Route path="/deal/:id" element={<DealDetail />} />
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
        <Route path="/search" element={<Search />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/spa/:id" element={<SpaDetails />} />
        <Route path='beauty&spa' element={<BeautySpa />} />
      </Route>

      {/* Auth screens use a minimal centered shell (no header/footer). */}
      <Route element={<AuthLayout />}>
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/otp" element={<Otp />} />
      </Route>

      {/* Authenticated console (after login / "My account"). */}
      <Route
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route path="/account" element={<Navigate to="/account/profile" replace />} />
        <Route path="/account/dashboard" element={<Dashboard />} />
        <Route path="/account/profile" element={<Profile />} />
        <Route path="/master-data/categories" element={<Categories />} />
        <Route path="/master-data/categories/add" element={<AddCategory />} />
        <Route
          path="/account/deals"
          element={
            <RequireRole roles={['admin']}>
              <Deals />
            </RequireRole>
          }
        />
        <Route
          path="/account/promotions"
          element={
            <RequireRole roles={['marketing']}>
              <Promotions />
            </RequireRole>
          }
        />
        <Route
          path="/account/sales"
          element={
            <RequireRole roles={['sales']}>
              <Sales />
            </RequireRole>
          }
        />
      </Route>
    </Routes>
  );
}

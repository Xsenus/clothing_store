import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router";
import LoadingSpinner from "@/components/LoadingSpinner";
import HomePage from "./pages/home";

const CatalogPage = lazy(() => import("./pages/catalog"));
const ProductDetailPage = lazy(() => import("./pages/product-detail"));
const CartPage = lazy(() => import("./pages/cart"));
const CheckoutPage = lazy(() => import("./pages/checkout"));
const ProfilePage = lazy(() => import("./pages/profile"));
const AuthPage = lazy(() => import("./pages/auth"));
const OnboardingPage = lazy(() => import("./pages/onboarding"));
const PrivacyPage = lazy(() => import("./pages/privacy"));
const TermsPage = lazy(() => import("./pages/terms"));
const OfferPage = lazy(() => import("./pages/offer"));
const ReturnsPage = lazy(() => import("./pages/returns"));
const NotFound = lazy(() => import("./pages/not-found"));
const AdminPage = lazy(() => import("./pages/admin"));

const routeFallback = (
  <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
    <LoadingSpinner />
  </div>
);

export default function App() {
  return (
    <Suspense fallback={routeFallback}>
      <Routes>
        <Route index element={<HomePage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/product/:slug" element={<ProductDetailPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/products/new" element={<AdminPage />} />
        <Route path="/admin/products/:id/edit" element={<AdminPage />} />
        <Route path="/admin-login" element={<Navigate to="/profile" replace />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/offer" element={<OfferPage />} />
        <Route path="/returns" element={<ReturnsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

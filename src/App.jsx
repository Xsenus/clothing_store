import React from "react";
import { Routes, Route } from "react-router";
import HomePage from "./pages/home";
import CatalogPage from "./pages/catalog";
import ProductDetailPage from "./pages/product-detail";
import CartPage from "./pages/cart";
import CheckoutPage from "./pages/checkout";
import ProfilePage from "./pages/profile";
import AdminPage from "./pages/admin";
import AuthPage from "./pages/auth";
import OnboardingPage from "./pages/onboarding";
import PrivacyPage from "./pages/privacy";
import TermsPage from "./pages/terms";
import NotFound from "./pages/not-found";

export default function App() {
  return (
    <Routes>
      <Route index element={<HomePage />} />
      <Route path="/catalog" element={<CatalogPage />} />
      <Route path="/product/:slug" element={<ProductDetailPage />} />
      <Route path="/cart" element={<CartPage />} />
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

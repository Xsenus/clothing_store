import "./index.css";
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import AppErrorBoundary from "@/components/AppErrorBoundary";
import DeferredAppDecorations from "@/components/DeferredAppDecorations";
import { ConfirmDialogProvider } from "@/components/ConfirmDialogProvider";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AppErrorBoundary>
        <AuthProvider>
          <CartProvider>
            <ConfirmDialogProvider>
              <App />
              <DeferredAppDecorations />
            </ConfirmDialogProvider>
          </CartProvider>
        </AuthProvider>
      </AppErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
);

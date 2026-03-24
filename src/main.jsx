import "./index.css";
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import DeferredAppDecorations from "@/components/DeferredAppDecorations";
import { ConfirmDialogProvider } from "@/components/ConfirmDialogProvider";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <CartProvider>
        <ConfirmDialogProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
          <DeferredAppDecorations />
        </ConfirmDialogProvider>
      </CartProvider>
    </AuthProvider>
  </StrictMode>,
);

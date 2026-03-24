import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useConvexAuth } from "@/context/AuthContext";
import { notify } from "@/lib/notify";
import {
  addToCart as apiAddToCart,
  clearCart as apiClearCart,
  getCart,
  removeCartItem as apiRemoveCartItem,
  updateCartQuantity as apiUpdateCartQuantity,
} from "../lib/api-mapping";

const CartContext = createContext(undefined);

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();

  const refreshCart = async () => {
    if (typeof getCart !== "function") {
      console.warn("FLOW.getCart is not available; skipping cart refresh");
      return;
    }

    try {
      const items = await getCart({ input: {} });
      if (Array.isArray(items)) {
        setCartItems(
          items.map((item) => ({
            ...item,
            cartId: item.cartId || item.id,
            product: item.product || null,
          })),
        );
      }
    } catch (error) {
      console.error("Failed to fetch cart:", error);
    }
  };

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      refreshCart();
    }
  }, [isAuthenticated, authLoading]);

  const addToCart = async (productId, size, quantity) => {
    setIsLoading(true);
    if (typeof apiAddToCart !== "function") {
      notify.error("Сервис корзины временно недоступен");
      return false;
    }

    try {
      await apiAddToCart({
        input: { productId, size, quantity },
      });
      await refreshCart();
      notify.success("Товар добавлен в корзину");
      return true;
    } catch (error) {
      console.error("Failed to add to cart:", error);
      notify.error(error?.message || "Не удалось добавить товар");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const updateQuantity = async (cartItemId, quantity) => {
    if (typeof apiUpdateCartQuantity !== "function") {
      notify.error("Сервис корзины временно недоступен");
      return;
    }

    try {
      await apiUpdateCartQuantity({
        input: { cartItemId, quantity },
      });
      setCartItems((prev) =>
        prev.map((item) => (item.cartId === cartItemId ? { ...item, quantity } : item)),
      );
    } catch (error) {
      console.error("Failed to update quantity:", error);
      notify.error(error?.message || "Не удалось обновить количество");
      await refreshCart();
    }
  };

  const removeFromCart = async (cartId) => {
    if (typeof apiRemoveCartItem !== "function") {
      notify.error("Сервис корзины временно недоступен");
      return;
    }

    try {
      await apiRemoveCartItem({
        input: { cartItemId: cartId },
      });
      setCartItems((prev) => prev.filter((item) => item.cartId !== cartId));
      notify.success("Товар удален из корзины");
    } catch (error) {
      console.error("Failed to remove item:", error);
      notify.error("Не удалось удалить товар");
      await refreshCart();
    }
  };

  const clearCart = async () => {
    if (typeof apiClearCart !== "function") {
      notify.error("Сервис корзины временно недоступен");
      return;
    }

    try {
      await apiClearCart({ input: {} });
      setCartItems([]);
      notify.success("Корзина очищена");
    } catch (error) {
      console.error("Failed to clear cart:", error);
      notify.error("Не удалось очистить корзину");
    }
  };

  const totalItems = useMemo(
    () => cartItems.reduce((acc, item) => acc + item.quantity, 0),
    [cartItems],
  );

  const value = useMemo(
    () => ({
      cartItems,
      isLoading,
      refreshCart,
      addToCart,
      updateQuantity,
      removeFromCart,
      clearCart,
      totalItems,
    }),
    [cartItems, isLoading, totalItems],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}

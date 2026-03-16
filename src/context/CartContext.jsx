import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useConvexAuth } from "@/context/AuthContext";
import { FLOW } from "../lib/api-mapping";
import { toast } from "sonner";

const CartContext = createContext(undefined);

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();

  const refreshCart = async () => {
    if (typeof FLOW.getCart !== "function") {
      console.warn("FLOW.getCart is not available; skipping cart refresh");
      return;
    }

    try {
      const items = await FLOW.getCart({ input: {} });
      if (Array.isArray(items)) {
        setCartItems(items.map((item) => ({
          ...item,
          cartId: item.cartId || item.id,
        })));
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
    if (typeof FLOW.addToCart !== "function") {
      toast.error("Сервис корзины временно недоступен");
      return false;
    }

    try {
      await FLOW.addToCart({
        input: { productId, size, quantity },
      });
      await refreshCart();
      toast.success("Товар добавлен в корзину");
      return true;
    } catch (error) {
      console.error("Failed to add to cart:", error);
      toast.error(error?.message || "Не удалось добавить товар");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const updateQuantity = async (cartItemId, quantity) => {
    if (typeof FLOW.updateCartQuantity !== "function") {
      toast.error("Сервис корзины временно недоступен");
      return;
    }

    try {
      await FLOW.updateCartQuantity({
        input: { cartItemId, quantity },
      });
      setCartItems((prev) =>
        prev.map((item) => (item.cartId === cartItemId ? { ...item, quantity } : item))
      );
    } catch (error) {
      console.error("Failed to update quantity:", error);
      toast.error(error?.message || "Не удалось обновить количество");
      await refreshCart();
    }
  };

  const removeFromCart = async (cartId) => {
    if (typeof FLOW.removeCartItem !== "function") {
      toast.error("Сервис корзины временно недоступен");
      return;
    }

    try {
      await FLOW.removeCartItem({
        input: { cartItemId: cartId },
      });
      setCartItems((prev) => prev.filter((item) => item.cartId !== cartId));
      toast.success("Товар удален из корзины");
    } catch (error) {
      console.error("Failed to remove item:", error);
      toast.error("Не удалось удалить товар");
      await refreshCart();
    }
  };

  const clearCart = async () => {
    if (typeof FLOW.clearCart !== "function") {
      toast.error("Сервис корзины временно недоступен");
      return;
    }

    try {
      await FLOW.clearCart({ input: {} });
      setCartItems([]);
      toast.success("Корзина очищена");
    } catch (error) {
      console.error("Failed to clear cart:", error);
      toast.error("Не удалось очистить корзину");
    }
  };

  const totalItems = useMemo(
    () => cartItems.reduce((acc, item) => acc + item.quantity, 0),
    [cartItems]
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
    [cartItems, isLoading, totalItems]
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

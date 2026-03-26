import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useConvexAuth } from "@/context/AuthContext";
import { notify } from "@/lib/notify";

const CartContext = createContext(undefined);
let cartApiPromise = null;

const loadCartApi = async () => {
  cartApiPromise ??= import("@/lib/api-mapping").then((module) => ({
    addToCart: module.addToCart,
    clearCart: module.clearCart,
    getCart: module.getCart,
    removeCartItem: module.removeCartItem,
    updateCartQuantity: module.updateCartQuantity,
  }));
  return cartApiPromise;
};

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();

  const refreshCart = async () => {
    try {
      const { getCart } = await loadCartApi();
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
      return;
    }

    if (!isAuthenticated && !authLoading) {
      setCartItems([]);
    }
  }, [isAuthenticated, authLoading]);

  const addToCart = async (productId, size, quantity) => {
    setIsLoading(true);

    try {
      const { addToCart: apiAddToCart } = await loadCartApi();
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
    try {
      const { updateCartQuantity: apiUpdateCartQuantity } = await loadCartApi();
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
    try {
      const { removeCartItem: apiRemoveCartItem } = await loadCartApi();
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
    try {
      const { clearCart: apiClearCart } = await loadCartApi();
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

// 購物車：存在瀏覽器（localStorage），不用登入。各分頁同步。
import { useEffect, useState } from "preact/hooks";
import { skuOf } from "./sku";

export type CartLine = { productId: string; variantId?: string; qty: number };

const KEY = "cart-v1";
const listeners = new Set<(v: CartLine[]) => void>();
let value: CartLine[] | null = null;

function read(): CartLine[] {
  if (value) return value;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    value = Array.isArray(raw) ? raw.filter((l) => l && typeof l.productId === "string" && l.qty > 0) : [];
  } catch {
    value = [];
  }
  return value!;
}

function write(next: CartLine[]) {
  value = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((l) => l(next));
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    value = null;
    const v = read();
    listeners.forEach((l) => l(v));
  });
}

const same = (a: { productId: string; variantId?: string }, b: { productId: string; variantId?: string }) =>
  skuOf(a.productId, a.variantId) === skuOf(b.productId, b.variantId);

/** 加入購物車；同商品同規格會合併數量（不超過 max） */
export function addToCart(line: CartLine, max = 99) {
  const list = read();
  const hit = list.find((l) => same(l, line));
  write(
    hit
      ? list.map((l) => (l === hit ? { ...l, qty: Math.min(max, l.qty + line.qty) } : l))
      : [...list, { ...line, qty: Math.min(max, line.qty) }],
  );
}

export function setCartQty(line: Pick<CartLine, "productId" | "variantId">, qty: number) {
  write(read().map((l) => (same(l, line) ? { ...l, qty } : l)));
}

export function removeFromCart(line: Pick<CartLine, "productId" | "variantId">) {
  write(read().filter((l) => !same(l, line)));
}

export function clearCart() {
  write([]);
}

/** 目前購物車內容（伺服器端算畫面時為空陣列，進到瀏覽器後才讀 localStorage） */
export function useCart(): CartLine[] {
  const [v, setV] = useState<CartLine[]>([]);
  useEffect(() => {
    listeners.add(setV);
    setV(read());
    return () => {
      listeners.delete(setV);
    };
  }, []);
  return v;
}

// ─── 自己下過的訂單（訪客查詢訂單用：記住訂單編號與下單電話） ───
const ORDERS_KEY = "my-orders-v1";
export type SavedOrder = { code: string; phone: string; at: string };

export function rememberOrder(code: string, phone: string) {
  try {
    const list: SavedOrder[] = JSON.parse(localStorage.getItem(ORDERS_KEY) ?? "[]");
    const next = [{ code, phone, at: new Date().toISOString() }, ...list.filter((o) => o.code !== code)].slice(0, 30);
    localStorage.setItem(ORDERS_KEY, JSON.stringify(next));
  } catch {}
}

export function savedOrders(): SavedOrder[] {
  try {
    return JSON.parse(localStorage.getItem(ORDERS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

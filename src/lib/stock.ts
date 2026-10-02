// 即時庫存：網站是靜態的，商品檔裡的 stock 是進貨總數；
// 進頁面後向 API 讀「扣掉訂單後的剩餘數量」，讀到之前先顯示商品檔的數字。
import { useEffect, useState } from "preact/hooks";
import { shop } from "../config/shop";
import { MOCK } from "./auth";
import { api } from "./api";

type StockMap = Record<string, number>;
let value: StockMap | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<(v: StockMap | null) => void>();

const enabled = MOCK || !!shop.apiBase;

export function refreshStock(): Promise<void> {
  if (!enabled) return Promise.resolve();
  loading = api
    .stock()
    .then((v) => {
      value = v;
      listeners.forEach((l) => l(value));
    })
    .catch(() => {
      // 讀不到就沿用商品檔的數字
    });
  return loading;
}

/** 回傳某商品的剩餘數量（還沒讀到時用 fallback，也就是商品檔的 stock） */
export function useLiveStock(productId: string, fallback: number): number {
  const all = useStockMap();
  return all?.[productId] ?? fallback;
}

export function useStockMap(): StockMap | null {
  const [v, setV] = useState(value);
  useEffect(() => {
    listeners.add(setV);
    if (!loading) refreshStock();
    setV(value);
    return () => {
      listeners.delete(setV);
    };
  }, []);
  return v;
}

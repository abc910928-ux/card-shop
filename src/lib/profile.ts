// 登入後的會員資料（/me）與收藏清單：全站共用一份，登入狀態改變時自動重新載入
import { useEffect, useState } from "preact/hooks";
import { api } from "./api";
import { useAuth } from "./auth";
import type { Profile, WishItem } from "./orders";

function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<(v: T) => void>();
  return {
    get: () => value,
    set(v: T) {
      value = v;
      listeners.forEach((l) => l(v));
    },
    use(): T {
      const [v, setV] = useState(value);
      useEffect(() => {
        listeners.add(setV);
        setV(value);
        return () => {
          listeners.delete(setV);
        };
      }, []);
      return v;
    },
  };
}

// ─── 會員資料 ───
const profileStore = createStore<Profile | null>(null);
let profileFor: string | null = null;

export async function refreshProfile() {
  profileStore.set(await api.me());
}
export function setProfile(p: Profile) {
  profileStore.set(p);
}

/** 目前登入者的會員資料（未登入為 null） */
export function useProfile(): Profile | null {
  const { user } = useAuth();
  const profile = profileStore.use();
  useEffect(() => {
    if (!user) {
      profileFor = null;
      profileStore.set(null);
      return;
    }
    if (profileFor === user.userId) return;
    profileFor = user.userId;
    refreshProfile().catch(() => (profileFor = null));
  }, [user?.userId]);
  return profile;
}

// ─── 收藏清單 ───
const wishStore = createStore<WishItem[] | null>(null);
let wishFor: string | null = null;

export function useWishlist() {
  const { user } = useAuth();
  const items = wishStore.use();
  useEffect(() => {
    if (!user) {
      wishFor = null;
      wishStore.set(null);
      return;
    }
    if (wishFor === user.userId) return;
    wishFor = user.userId;
    api
      .wishlist()
      .then((w) => wishStore.set(w))
      .catch(() => (wishFor = null));
  }, [user?.userId]);

  async function toggle(productId: string, snapshot: { price: number; stock: number }) {
    const list = wishStore.get() ?? [];
    if (list.some((w) => w.productId === productId)) {
      wishStore.set(list.filter((w) => w.productId !== productId));
      await api.removeWish(productId).catch(() => wishStore.set(list));
    } else {
      const optimistic = { productId, priceAtAdd: snapshot.price, stockAtAdd: snapshot.stock, createdAt: new Date().toISOString() };
      wishStore.set([...list, optimistic]);
      await api
        .addWish(productId, snapshot)
        .then((saved) => wishStore.set([...(wishStore.get() ?? []).filter((w) => w.productId !== productId), saved]))
        .catch(() => wishStore.set(list));
    }
  }

  return { items, has: (id: string) => !!items?.some((w) => w.productId === id), toggle };
}

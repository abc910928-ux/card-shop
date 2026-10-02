// 會員 API（Supabase Edge Function）的呼叫層：自動帶 LINE access token
import { shop } from "../config/shop";
import { getToken, MOCK } from "./auth";
import type {
  Member,
  NewOrder,
  Order,
  OrderStatus,
  Profile,
  ProfileInput,
  WishItem,
} from "./orders";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  // 條件直接寫 import.meta.env.DEV，正式建置時整段（含假後端檔案）會被移除
  if (import.meta.env.DEV && MOCK) {
    const { mockCall } = await import("./mock-api");
    return mockCall<T>(method, path, body);
  }
  const token = await getToken();
  if (!token) throw new ApiError(401, "請先登入");
  const res = await fetch(shop.apiBase + path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "伺服器暫時無法使用，請稍後再試");
  return data as T;
}

export const api = {
  me: () => call<Profile>("GET", "/me"),
  saveMe: (p: ProfileInput) => call<Profile>("PUT", "/me", p),

  orders: () => call<Order[]>("GET", "/orders"),
  createOrder: (o: NewOrder) => call<Order>("POST", "/orders", o),

  wishlist: () => call<WishItem[]>("GET", "/wishlist"),
  // price / stock 只給假後端用；正式 API 以伺服器端的商品資料為準
  addWish: (productId: string, snapshot: { price: number; stock: number }) =>
    call<WishItem>("PUT", `/wishlist/${encodeURIComponent(productId)}`, snapshot),
  removeWish: (productId: string) => call<{ ok: true }>("DELETE", `/wishlist/${encodeURIComponent(productId)}`),

  admin: {
    orders: (status?: OrderStatus | "") =>
      call<Order[]>("GET", `/admin/orders${status ? `?status=${status}` : ""}`),
    updateOrder: (id: number, patch: { status?: OrderStatus; note?: string }) =>
      call<Order>("PATCH", `/admin/orders/${id}`, patch),
    members: () => call<Member[]>("GET", "/admin/members"),
    updateMember: (lineUserId: string, patch: { preorderBlocked: boolean }) =>
      call<Member>("PATCH", `/admin/members/${encodeURIComponent(lineUserId)}`, patch),
  },
};

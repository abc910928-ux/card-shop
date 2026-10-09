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
  StockRow,
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

// auth: "required" 一定要登入；"optional" 有登入就帶 token（例如現貨下單）；"none" 公開資料
async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  auth: "required" | "optional" | "none" = "required",
): Promise<T> {
  // 條件直接寫 import.meta.env.DEV，正式建置時整段（含假後端檔案）會被移除
  if (import.meta.env.DEV && MOCK) {
    const { mockCall } = await import("./mock-api");
    return mockCall<T>(method, path, body);
  }
  const token = auth === "none" ? null : await getToken();
  if (auth === "required" && !token) throw new ApiError(401, "請先登入");
  const res = await fetch(shop.apiBase + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "伺服器暫時無法使用，請稍後再試");
  return data as T;
}

export type OrderPatch = {
  status?: OrderStatus;
  note?: string;
  tracking?: string;
  reason?: string;
  addAdjustment?: { amount: number; note: string };
  removeAdjustment?: number;
  addReceipt?: { amount: number; note: string };
  removeReceipt?: number;
};

export const api = {
  /** 各商品目前剩餘數量（公開） */
  stock: () => call<Record<string, number>>("GET", "/stock", undefined, "none"),

  me: () => call<Profile>("GET", "/me"),
  saveMe: (p: ProfileInput) => call<Profile>("PUT", "/me", p),

  orders: () => call<Order[]>("GET", "/orders"),
  // 現貨訂單訪客也能建立（占用庫存）；預購、代購需要登入
  createOrder: (o: NewOrder) => call<Order>("POST", "/orders", o, o.kind === "stock" ? "optional" : "required"),
  cancelOrder: (id: number) => call<Order>("POST", `/orders/${id}/cancel`),
  reportPayment: (id: number, last5: string) => call<Order>("POST", `/orders/${id}/report`, { last5 }),
  // 訪客用訂單編號＋下單電話查詢／取消／回報匯款
  guestOrder: (code: string, phone: string, action: "get" | "cancel" | "report" = "get", last5?: string) =>
    call<Order>("POST", "/guest/order", { code, phone, action, last5 }, "none"),

  wishlist: () => call<WishItem[]>("GET", "/wishlist"),
  // price / stock 只給假後端用；正式 API 以伺服器端的商品資料為準
  addWish: (productId: string, snapshot: { price: number; stock: number }) =>
    call<WishItem>("PUT", `/wishlist/${encodeURIComponent(productId)}`, snapshot),
  removeWish: (productId: string) => call<{ ok: true }>("DELETE", `/wishlist/${encodeURIComponent(productId)}`),

  admin: {
    orders: () => call<Order[]>("GET", "/admin/orders"),
    updateOrder: (id: number, patch: OrderPatch) => call<Order>("PATCH", `/admin/orders/${id}`, patch),
    members: () => call<Member[]>("GET", "/admin/members"),
    updateMember: (lineUserId: string, patch: { preorderBlocked: boolean }) =>
      call<Member>("PATCH", `/admin/members/${encodeURIComponent(lineUserId)}`, patch),
    inventory: () => call<StockRow[]>("GET", "/admin/inventory"),
    adjustStock: (productId: string, delta: number, note: string) =>
      call<StockRow>("POST", "/admin/inventory", { productId, delta, note }),
  },
};

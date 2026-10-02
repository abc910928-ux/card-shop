// 會員 API 的資料型別與訂單狀態文字（前端共用）

export type OrderKind = "stock" | "preorder" | "proxy";
export type OrderStatus =
  | "pending"
  | "confirmed"
  | "arrived"
  | "paid"
  | "shipped"
  | "completed"
  | "cancelled"
  | "abandoned"
  | "unallocated";

export const kindLabel: Record<OrderKind, string> = {
  stock: "現貨",
  preorder: "預購",
  proxy: "海外代購",
};

export const statusLabel: Record<OrderStatus, string> = {
  pending: "待確認",
  confirmed: "已確認",
  arrived: "已到貨・待付款",
  paid: "已付款",
  shipped: "已出貨",
  completed: "已完成",
  cancelled: "已取消",
  abandoned: "棄單",
  unallocated: "未配到",
};

// 狀態標籤顏色（Tailwind class）
export const statusTone: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-sky-100 text-sky-800",
  arrived: "bg-violet-100 text-violet-800",
  paid: "bg-emerald-100 text-emerald-800",
  shipped: "bg-emerald-100 text-emerald-800",
  completed: "bg-slate-200 text-slate-700",
  cancelled: "bg-slate-200 text-slate-500",
  abandoned: "bg-red-100 text-red-700",
  unallocated: "bg-slate-200 text-slate-500",
};

export const ALL_STATUSES = Object.keys(statusLabel) as OrderStatus[];

/** 到貨通知後的付款期限（天），與預購條款第五條一致 */
export const PAY_DEADLINE_DAYS = 3;

export type OrderItem = {
  productId?: string;
  name: string;
  price: number; // 代購詢價為 0（尚未報價）
  qty: number;
  url?: string; // 代購商品網址
  spec?: string;
};

export type Shipping = {
  method: string;
  label: string;
  fee: number;
  declaredValue?: number;
  insured?: boolean;
  insuranceFee?: number;
};

export type Recipient = { name?: string; phone?: string; store?: string; address?: string };

export type Order = {
  id: number;
  code: string;
  kind: OrderKind;
  items: OrderItem[];
  shipping: Shipping | null;
  recipient: Recipient | null;
  total: number;
  status: OrderStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  arrivedAt: string | null;
  // 管理頁才有
  member?: { displayName: string; realName: string | null; phone: string | null };
};

export type NewOrder = {
  kind: OrderKind;
  items: OrderItem[];
  shipping?: Shipping;
  recipient?: Recipient;
  note?: string;
};

export type Profile = {
  lineUserId: string;
  displayName: string;
  pictureUrl: string | null;
  realName: string | null;
  phone: string | null;
  storeName: string | null;
  address: string | null;
  preorderBlocked: boolean;
  isAdmin: boolean;
};

export type ProfileInput = Pick<Profile, "realName" | "phone" | "storeName" | "address">;

export type WishItem = { productId: string; priceAtAdd: number; stockAtAdd: number; createdAt: string };

export type Member = {
  lineUserId: string;
  displayName: string;
  pictureUrl: string | null;
  realName: string | null;
  phone: string | null;
  preorderBlocked: boolean;
  orderCount: number;
  abandonedCount: number;
  createdAt: string;
};

/** 到貨後是否已超過付款期限 */
export function isOverdue(o: Pick<Order, "status" | "arrivedAt">, now = Date.now()): boolean {
  if (o.status !== "arrived" || !o.arrivedAt) return false;
  return now - new Date(o.arrivedAt).getTime() > PAY_DEADLINE_DAYS * 86400_000;
}

export function payDeadline(arrivedAt: string): Date {
  return new Date(new Date(arrivedAt).getTime() + PAY_DEADLINE_DAYS * 86400_000);
}

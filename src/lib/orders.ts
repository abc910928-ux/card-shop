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
  variantId?: string;
  variant?: string; // 規格名稱
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

export type Payment = {
  method: "transfer" | "cod";
  label: string;
  fee: number;
  report?: { last5: string; at: string }; // 買家回報的匯款帳號末五碼
};

export type Order = {
  id: number;
  code: string;
  kind: OrderKind;
  items: OrderItem[];
  shipping: Shipping | null;
  payment: Payment | null;
  recipient: Recipient | null;
  total: number;
  status: OrderStatus;
  note: string | null;
  tracking: string | null;
  guest: boolean;
  history: HistoryEntry[];
  holdsStock: boolean; // 目前是否占用庫存（待確認超過 24 小時未確認的現貨訂單會釋出）
  createdAt: string;
  updatedAt: string;
  arrivedAt: string | null;
  // 管理頁才有
  member?: { displayName: string; realName: string | null; phone: string | null };
};

export type HistoryEntry = { status: OrderStatus; at: string; by: "buyer" | "admin" | "system"; note?: string };

export type StockRow = {
  id: string;
  name: string;
  preorder: boolean;
  base: number; // 商品檔裡的 stock（進貨總數）
  adjust: number; // 手動調整合計
  sold: number; // 有效訂單占用
  available: number;
};

/** 現貨「待確認」保留庫存的時數（與後端一致） */
export const HOLD_HOURS = 24;

// ─── 訂單流程：依狀態決定下一步按鈕（參考蝦皮、Shopify 的後台） ───
export const CANCELLED: OrderStatus[] = ["cancelled", "abandoned", "unallocated"];

type FlowOrder = Pick<Order, "kind" | "status"> & { payment?: Pick<Payment, "method"> | null };
const isCod = (o: FlowOrder) => o.payment?.method === "cod";

/** 這筆訂單會經過的狀態（取貨付款沒有「已付款」這一步） */
export function flowOf(o: FlowOrder): OrderStatus[] {
  if (o.kind === "preorder") return ["pending", "confirmed", "arrived", "paid", "shipped", "completed"];
  if (isCod(o)) return ["pending", "confirmed", "shipped", "completed"];
  return ["pending", "confirmed", "paid", "shipped", "completed"];
}

/** 買家看到的進度文字 */
export function stepLabel(o: FlowOrder, s: OrderStatus): string {
  switch (s) {
    case "pending":
      return o.kind === "preorder" ? "已登記預購" : o.kind === "proxy" ? "已送出詢價" : "訂單成立";
    case "confirmed":
      return o.kind === "preorder" ? "預購確認" : o.kind === "proxy" ? "已報價" : isCod(o) ? "已確認・備貨中" : "已確認・待付款";
    case "paid":
      return "已付款・備貨中";
    case "completed":
      return isCod(o) ? "已取貨・完成" : "已完成";
    default:
      return statusLabel[s];
  }
}

/** 買家看到的目前狀態 */
export function buyerStatus(o: FlowOrder): string {
  if (o.status === "pending") return o.kind === "proxy" ? "等待報價" : "待店家確認";
  return stepLabel(o, o.status);
}

export type TimelineStep = { status: OrderStatus; label: string; at?: string; note?: string; state: "done" | "current" | "todo" };

/** 訂單時間軸：照流程列出每一步，已經過的步驟附上時間；取消的訂單最後接一個取消步驟 */
export function timelineOf(o: FlowOrder & Pick<Order, "history" | "createdAt">): TimelineStep[] {
  const flow = flowOf(o);
  const last = (s: OrderStatus) => [...o.history].reverse().find((h) => h.status === s);
  const cancelled = CANCELLED.includes(o.status);
  // 取消的訂單：以取消前最後一個有效狀態為進度
  const reached = cancelled
    ? ([...o.history].reverse().find((h) => !CANCELLED.includes(h.status))?.status ?? "pending")
    : o.status;
  const idx = Math.max(0, flow.indexOf(reached));
  const steps: TimelineStep[] = flow.map((s, i) => ({
    status: s,
    label: stepLabel(o, s),
    at: i <= idx ? (last(s)?.at ?? (s === "pending" ? o.createdAt : undefined)) : undefined,
    note: i <= idx ? last(s)?.note : undefined,
    state: i < idx || (i === idx && (cancelled || s === "completed")) ? "done" : i === idx ? "current" : "todo",
  }));
  if (cancelled) {
    const h = last(o.status);
    return [
      ...steps.slice(0, idx + 1),
      { status: o.status, label: statusLabel[o.status], at: h?.at, note: h?.note, state: "current" },
    ];
  }
  return steps;
}

export function nextStep(o: FlowOrder): { to: OrderStatus; label: string } | null {
  switch (o.status) {
    case "pending":
      return { to: "confirmed", label: o.kind === "preorder" ? "確認預購" : o.kind === "proxy" ? "已報價" : "確認訂單" };
    case "confirmed":
      if (o.kind === "preorder") return { to: "arrived", label: "商品已到貨" };
      return isCod(o) ? { to: "shipped", label: "出貨" } : { to: "paid", label: "標記已付款" };
    case "arrived":
      return { to: "paid", label: "標記已付款" };
    case "paid":
      return { to: "shipped", label: "出貨" };
    case "shipped":
      return { to: "completed", label: isCod(o) ? "已取貨・完成" : "完成訂單" };
    default:
      return null;
  }
}

/** 後台分頁（照出貨流程分）；取貨付款的訂單確認後直接進「待出貨」 */
export const STAGES: { id: string; label: string; match: (o: FlowOrder) => boolean }[] = [
  { id: "todo", label: "待確認", match: (o) => o.status === "pending" },
  { id: "unpaid", label: "待付款", match: (o) => (o.status === "confirmed" && !isCod(o)) || o.status === "arrived" },
  { id: "toship", label: "待出貨", match: (o) => o.status === "paid" || (o.status === "confirmed" && isCod(o)) },
  { id: "shipped", label: "已出貨", match: (o) => o.status === "shipped" },
  { id: "done", label: "已完成", match: (o) => o.status === "completed" },
  { id: "cancelled", label: "取消・棄單", match: (o) => CANCELLED.includes(o.status) },
];

/** 商品名稱（含規格） */
export const itemLabel = (i: Pick<OrderItem, "name" | "variant">) => (i.variant ? `${i.name}（${i.variant}）` : i.name);

/** 取消原因 → 對應狀態（棄單會計入預購條款第七條的次數） */
export const CANCEL_REASONS: { status: OrderStatus; label: string; hint: string }[] = [
  { status: "cancelled", label: "買家要求取消", hint: "不計入棄單" },
  { status: "abandoned", label: "逾期未付款／未取貨（棄單）", hint: "計入棄單次數" },
  { status: "unallocated", label: "缺貨或配額不足（未配到）", hint: "不計入棄單" },
  { status: "cancelled", label: "其他", hint: "請在備註說明" },
];

/** 買家可以自行取消的狀態 */
export const BUYER_CANCELLABLE: OrderStatus[] = ["pending", "confirmed"];

export type NewOrder = {
  kind: OrderKind;
  items: OrderItem[];
  shipping?: Shipping;
  payment?: Pick<Payment, "method" | "label" | "fee">;
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

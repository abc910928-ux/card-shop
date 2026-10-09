// TCG代購 會員 API（Supabase Edge Function，Deno）
// 前端帶 LINE（LIFF）access token → 這裡向 LINE 驗證 → 用 service role 讀寫資料庫。
// 環境變數（supabase secrets set）：
//   LINE_LOGIN_CHANNEL_ID  LINE Login 頻道 ID（驗證 token 是發給我們的頻道）
//   ADMIN_LINE_USER_IDS    管理員的 LINE userId，多個用逗號分隔
//   SITE_URL               網站網址，例：https://abc910928-ux.github.io/card-shop
//   LINE_MESSAGING_TOKEN   （選填）官方帳號 Messaging API 的 channel access token：有新訂單時推播通知店家
//   NOTIFY_LINE_USER_IDS   （選填）要收通知的 LINE userId，多個用逗號分隔；沒填就通知所有管理員
// SUPABASE_URL、SUPABASE_SECRET_KEYS（或舊版 SUPABASE_SERVICE_ROLE_KEY）由 Supabase 自動提供。
import { createClient } from "npm:@supabase/supabase-js@2";

const CHANNEL_ID = Deno.env.get("LINE_LOGIN_CHANNEL_ID") ?? "";
const ADMINS = (Deno.env.get("ADMIN_LINE_USER_IDS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const SITE_URL = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
const LINE_TOKEN = Deno.env.get("LINE_MESSAGING_TOKEN") ?? "";
const NOTIFY_TO = (Deno.env.get("NOTIFY_LINE_USER_IDS") || Deno.env.get("ADMIN_LINE_USER_IDS") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = new Set(
  [SITE_URL && new URL(SITE_URL).origin, "http://localhost:3020"].filter(Boolean) as string[],
);

// 新版專案用 SUPABASE_SECRET_KEYS（JSON：{"default": "sb_secret_..."}），舊專案用 SUPABASE_SERVICE_ROLE_KEY
function serverKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    const k = keys.default ?? Object.values(keys)[0];
    if (typeof k === "string" && k) return k;
  } catch {
    // 格式不對就改用舊版金鑰
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}
const db = createClient(Deno.env.get("SUPABASE_URL")!, serverKey(), {
  auth: { persistSession: false },
});

const STATUSES = ["pending", "confirmed", "arrived", "paid", "shipped", "completed", "cancelled", "abandoned", "unallocated"];
const INACTIVE = ["cancelled", "abandoned", "unallocated"]; // 取消類：不占庫存、不計限購
const ACTIVE = STATUSES.filter((s) => !INACTIVE.includes(s));
// 現貨訂單「待確認」超過這個時數還沒被店家確認，就不再保留庫存（避免有人下單不理、占住庫存）
const HOLD_HOURS = 24;
const PAY_DAYS = 3; // 預購到貨後幾天內付款（預購條款第五條）

// ─── 共用 ─────────────────────────────────────────────
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function cors(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : [...ALLOWED_ORIGINS][0] ?? "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    Vary: "Origin",
  };
}

function str(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw new HttpError(400, "資料格式錯誤");
  const s = v.trim();
  if (s.length > max) throw new HttpError(400, `內容太長（上限 ${max} 字）`);
  return s || null;
}
function int(v: unknown, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw new HttpError(400, "數字格式錯誤");
  return v;
}

// ─── LINE 驗證 ─────────────────────────────────────────
type LineUser = { userId: string; displayName: string; pictureUrl: string | null };
const tokenCache = new Map<string, { user: LineUser; exp: number }>();

async function verifyLine(token: string): Promise<LineUser> {
  const hit = tokenCache.get(token);
  if (hit && hit.exp > Date.now()) return hit.user;

  const v = await fetch(`https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(token)}`);
  if (!v.ok) throw new HttpError(401, "登入已過期，請重新登入");
  const info = await v.json();
  if (String(info.client_id) !== CHANNEL_ID || !(info.expires_in > 0)) throw new HttpError(401, "登入驗證失敗");

  const p = await fetch("https://api.line.me/v2/profile", { headers: { Authorization: `Bearer ${token}` } });
  if (!p.ok) throw new HttpError(401, "無法取得 LINE 資料，請重新登入");
  const prof = await p.json();
  const user = { userId: prof.userId, displayName: prof.displayName ?? "", pictureUrl: prof.pictureUrl ?? null };
  tokenCache.set(token, { user, exp: Date.now() + Math.min(5 * 60, info.expires_in) * 1000 });
  return user;
}

// ─── 商品資料（網站建置時輸出的 products.json）──────────
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
type Variant = { id: string; name: string; price: number; stock: number };
type Product = {
  id: string;
  name: string;
  price: number;
  stock: number;
  preorder: { limit?: number } | null;
  payments?: string[];
  variants?: Variant[] | null;
};
type Catalog = { products: Product[]; shipping: Row[]; payments: Row[] };
let catalogCache: { at: number; data: Catalog } | null = null;
async function catalog(): Promise<Catalog> {
  if (catalogCache && Date.now() - catalogCache.at < 60_000) return catalogCache.data;
  const res = await fetch(`${SITE_URL}/products.json`);
  if (!res.ok) throw new HttpError(503, "暫時無法讀取商品資料，請稍後再試");
  const j = await res.json();
  const data = { products: j.products ?? [], shipping: j.shipping ?? [], payments: j.payments ?? [] };
  catalogCache = { at: Date.now(), data };
  return data;
}
const products = async () => (await catalog()).products;

// 庫存單位：沒有規格的商品就是商品 id；有規格的是「商品id:規格id」（與網站 src/lib/sku.ts 相同）
const skuOf = (productId: string, variantId?: string | null) => (variantId ? `${productId}:${variantId}` : productId);

// ─── 庫存 ──────────────────────────────────────────────
// 剩餘 = 商品檔的 stock（進貨總數）＋ 手動調整 − 有效訂單占用的數量
function holdsStock(o: Row): boolean {
  if (o.kind === "proxy" || !ACTIVE.includes(o.status)) return false;
  if (o.kind === "stock" && o.status === "pending") {
    return Date.now() - new Date(o.created_at).getTime() < HOLD_HOURS * 3600_000;
  }
  return true;
}

type Stock = {
  id: string; // SKU
  productId: string;
  name: string;
  preorder: boolean;
  base: number;
  adjust: number;
  sold: number;
  available: number;
};
async function inventory(excludeOrderId?: number): Promise<Map<string, Stock>> {
  const [list, orders, adjusts] = await Promise.all([
    products(),
    db.from("orders").select("id, kind, status, items, created_at").in("kind", ["stock", "preorder"]).in("status", ACTIVE),
    db.from("inventory_adjustments").select("product_id, delta"),
  ]);
  const map = new Map<string, Stock>();
  for (const p of list) {
    const base = { productId: p.id, preorder: !!p.preorder, adjust: 0, sold: 0, available: 0 };
    if (p.variants?.length) {
      for (const v of p.variants) map.set(skuOf(p.id, v.id), { ...base, id: skuOf(p.id, v.id), name: `${p.name}（${v.name}）`, base: v.stock });
    } else map.set(p.id, { ...base, id: p.id, name: p.name, base: p.stock });
  }
  for (const a of check(adjusts)) {
    const s = map.get(a.product_id);
    if (s) s.adjust += a.delta;
  }
  for (const o of check(orders)) {
    if (o.id === excludeOrderId || !holdsStock(o)) continue;
    for (const i of o.items) {
      const s = i.productId && map.get(skuOf(i.productId, i.variantId));
      if (s) s.sold += i.qty;
    }
  }
  for (const s of map.values()) s.available = Math.max(0, s.base + s.adjust - s.sold);
  return map;
}

/** 訂單要開始占用庫存時，確認數量還夠（同一個 SKU 出現多次會合併計算） */
async function ensureAvailable(items: Row[], excludeOrderId?: number) {
  const inv = await inventory(excludeOrderId);
  const need = new Map<string, number>();
  for (const i of items) if (i.productId) need.set(skuOf(i.productId, i.variantId), (need.get(skuOf(i.productId, i.variantId)) ?? 0) + i.qty);
  for (const [sku, qty] of need) {
    const s = inv.get(sku);
    if (!s) throw new HttpError(400, "有商品已下架，請重新整理");
    if (qty > s.available) throw new HttpError(409, `「${s.name}」庫存不足（剩 ${s.available} 個）`);
  }
}

/** 公開庫存：每個 SKU，再加上有規格商品的合計（列表頁用商品 id 查） */
let stockCache: { at: number; data: Record<string, number> } | null = null;
async function publicStock(): Promise<Record<string, number>> {
  if (stockCache && Date.now() - stockCache.at < 10_000) return stockCache.data;
  const data: Record<string, number> = {};
  for (const s of (await inventory()).values()) {
    data[s.id] = s.available;
    if (s.id !== s.productId) data[s.productId] = (data[s.productId] ?? 0) + s.available;
  }
  stockCache = { at: Date.now(), data };
  return data;
}

// ─── 運費（與網站 src/lib/shipping.ts 的 quote 相同，設定來自 products.json）──
function shipQuote(m: Row, goods: number, insure: boolean, declared?: number) {
  const c = m.coverage;
  let fee = m.fee;
  let insured = false;
  let insuranceFee = 0;
  let declaredValue = 0;
  if (c.kind === "tiers") {
    const tier =
      (declared && c.tiers.find((t: Row) => t.upTo === declared)) ||
      c.tiers.find((t: Row) => t.upTo >= goods) ||
      c.tiers[c.tiers.length - 1];
    fee = tier.fee;
    declaredValue = tier.upTo;
  } else if (c.kind === "rate") {
    insured = insure || goods > c.requiredAbove;
    insuranceFee = insured ? Math.ceil(Math.min(goods, c.maxValue) * c.rate) : 0;
    declaredValue = insured ? Math.min(goods, c.maxValue) : 0;
  }
  return { fee, insured, insuranceFee, declaredValue };
}

// ─── LINE 推播（Messaging API push；沒設定 token 就略過）──
// 店家：新訂單、取消、回報匯款。買家：預購到貨的付款通知（買家要是官方帳號好友才收得到）
const notifyShop = (text: string) => pushLine(NOTIFY_TO, text);
async function pushLine(targets: string[], text: string) {
  if (!LINE_TOKEN || targets.length === 0) return;
  const send = Promise.all(
    targets.map((to) =>
      fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { Authorization: `Bearer ${LINE_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
        signal: AbortSignal.timeout(5000),
      })
        .then(async (r) => {
          if (!r.ok) console.error("LINE push 失敗", r.status, await r.text());
        })
        .catch((e) => console.error("LINE push 錯誤", e)),
    ),
  );
  // 回應買家不用等通知送完
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(send);
  else await send;
}

const ntd = (n: number) => `NT$${n.toLocaleString("en-US")}`;
function arrivalMessage(o: Row): string {
  const due = new Date(Date.now() + 8 * 3600_000 + PAY_DAYS * 86400_000);
  const items = o.items.map((i: Row) => `・${i.variant ? `${i.name}（${i.variant}）` : i.name} ×${i.qty}`).join("\n");
  return [
    "【TCG代購】你預購的商品到貨了！",
    items,
    "",
    `請在 ${due.getUTCMonth() + 1}/${due.getUTCDate()} 前轉帳 ${ntd(dueOf(o))}${sum(o.receipts) > 0 ? `（已扣除已付的 ${ntd(sum(o.receipts))}）` : "（含運費）"}。`,
    "匯款帳號與回報匯款請到訂單頁：",
    `${SITE_URL}/order/?code=${o.code}`,
  ].join("\n");
}

function orderMessage(o: Row, buyer: string): string {
  const head = { stock: "🛒 新訂單", preorder: "📦 新預購", proxy: "🌏 新代購詢價" }[o.kind as string] ?? "新訂單";
  const lines = [`${head} ${o.code}`, `買家：${buyer}`];
  for (const i of o.items) {
    const name = i.variant ? `${i.name}（${i.variant}）` : i.name;
    lines.push(`・${name} ×${i.qty}${i.price > 0 ? `　${ntd(i.price * i.qty)}` : ""}${i.url ? `\n  ${i.url}` : ""}`);
  }
  const s = o.shipping;
  if (s) {
    const extra = (s.declaredValue && !s.insured ? `（申報 ${ntd(s.declaredValue)}）` : "") + (s.insured ? "（加保）" : "");
    lines.push(`寄送：${s.label}${extra}　${ntd(s.fee + (s.insuranceFee ?? 0))}`);
  }
  if (o.payment) lines.push(`付款：${o.payment.label}`);
  if (o.total > 0) lines.push(`合計：${ntd(o.total)}`);
  const r = o.recipient ?? {};
  const to = [r.name, r.phone, r.store ?? r.address].filter(Boolean).join(" / ");
  if (to) lines.push(`收件：${to}`);
  if (o.note) lines.push(`備註：${o.note}`);
  lines.push("", `後台：${SITE_URL}/admin/`);
  return lines.join("\n");
}

// ─── 資料轉換 ──────────────────────────────────────────
const profileOut = (r: Row, isAdmin: boolean) => ({
  lineUserId: r.line_user_id,
  displayName: r.display_name,
  pictureUrl: r.picture_url,
  realName: r.real_name,
  phone: r.phone,
  storeName: r.store_name,
  address: r.address,
  preorderBlocked: r.preorder_blocked,
  isAdmin,
});
const orderOut = (r: Row) => ({
  id: r.id,
  code: r.code,
  kind: r.kind,
  items: r.items,
  shipping: r.shipping,
  payment: r.payment ?? null,
  recipient: r.recipient,
  total: r.total,
  adjustments: r.adjustments ?? [],
  receipts: r.receipts ?? [],
  status: r.status,
  note: r.note,
  tracking: r.tracking,
  guest: r.guest,
  history: r.status_history ?? [],
  holdsStock: holdsStock(r),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  arrivedAt: r.arrived_at,
  ...(r.profiles
    ? { member: { displayName: r.profiles.display_name, realName: r.profiles.real_name, phone: r.profiles.phone } }
    : {}),
});
const memberOut = (r: Row) => ({
  lineUserId: r.line_user_id,
  displayName: r.display_name,
  pictureUrl: r.picture_url,
  realName: r.real_name,
  phone: r.phone,
  preorderBlocked: r.preorder_blocked,
  orderCount: r.order_count ?? 0,
  abandonedCount: r.abandoned_count ?? 0,
  createdAt: r.created_at,
});
const wishOut = (r: Row) => ({
  productId: r.product_id,
  priceAtAdd: r.price_at_add,
  stockAtAdd: r.stock_at_add,
  createdAt: r.created_at,
});

// 沒有產生資料表型別，查詢結果一律當成 any（Row 或 Row[]）；maybeSingle 找不到時是 null，呼叫端自己判斷
// deno-lint-ignore no-explicit-any
function check(res: { data: unknown; error: { message: string } | null }): any {
  if (res.error) throw new HttpError(500, `資料庫錯誤：${res.error.message}`);
  return res.data;
}

function newCode(): string {
  const d = new Date(Date.now() + 8 * 3600_000).toISOString(); // 台灣時間
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
  return `TC-${d.slice(2, 4)}${d.slice(5, 7)}${d.slice(8, 10)}-${rand}`;
}

// ─── 金額：調整（折扣、補差價）與收款（訂金、預付）──
// total = 商品＋運費＋保價＋付款手續費＋所有調整；尚需付款 = total − 已收款
const sum = (list: Row[] | null | undefined) => (list ?? []).reduce((s: number, x: Row) => s + (x.amount ?? 0), 0);
function baseTotal(o: Row): number {
  const goods = (o.items ?? []).reduce((s: number, i: Row) => s + i.price * i.qty, 0);
  const ship = o.shipping ? o.shipping.fee + (o.shipping.insuranceFee ?? 0) : 0;
  return goods + ship + (o.payment?.fee ?? 0);
}
const dueOf = (o: Row) => Math.max(0, o.total - sum(o.receipts));

const historyEntry = (status: string, by: "buyer" | "admin" | "system", note?: string | null) => ({
  status,
  at: new Date().toISOString(),
  by,
  ...(note ? { note } : {}),
});

// ─── 路由 ──────────────────────────────────────────────
async function handle(req: Request): Promise<unknown> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "api") parts.shift(); // 路徑是 /api/xxx 或 /functions/v1/api/xxx
  if (parts[0] === "functions") parts.splice(0, 3);
  const route = parts.join("/");
  const m = req.method;
  const body = ["POST", "PUT", "PATCH"].includes(m) ? await req.json().catch(() => ({})) : {};

  // ── 不用登入的路由 ──
  if (route === "health") {
    // 順便碰一下資料庫，避免免費專案因閒置被暫停
    check(await db.from("profiles").select("line_user_id", { head: true, count: "exact" }));
    return { ok: true };
  }
  if (route === "stock" && m === "GET") return await publicStock();
  if (route === "guest/order" && m === "POST") return await guestOrder(body);

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  // 訪客也能下現貨訂單（只記錄訂單與占用庫存，聯絡一律走 LINE）
  if (!token && route === "orders" && m === "POST") return await createOrder(null, null, body);
  if (!token) throw new HttpError(401, "請先登入");

  const line = await verifyLine(token);
  const isAdmin = ADMINS.includes(line.userId);

  // 每次請求都同步 LINE 名稱與頭貼（新會員自動建立）
  const me = check(
    await db
      .from("profiles")
      .upsert(
        { line_user_id: line.userId, display_name: line.displayName, picture_url: line.pictureUrl },
        { onConflict: "line_user_id" },
      )
      .select()
      .single(),
  );

  // ── 會員資料 ──
  if (route === "me" && m === "GET") return profileOut(me, isAdmin);
  if (route === "me" && m === "PUT") {
    const row = check(
      await db
        .from("profiles")
        .update({
          real_name: str(body.realName, 30),
          phone: str(body.phone, 20),
          store_name: str(body.storeName, 40),
          address: str(body.address, 120),
        })
        .eq("line_user_id", line.userId)
        .select()
        .single(),
    );
    return profileOut(row, isAdmin);
  }

  // ── 訂單 ──
  if (route === "orders" && m === "GET") {
    const rows = check(
      await db.from("orders").select().eq("line_user_id", line.userId).order("created_at", { ascending: false }).limit(100),
    );
    return rows.map(orderOut);
  }
  if (route === "orders" && m === "POST") return await createOrder(line.userId, me, body);
  if (parts[0] === "orders" && parts[1] && parts[2] && m === "POST") {
    const o = check(await db.from("orders").select().eq("id", Number(parts[1])).eq("line_user_id", line.userId).maybeSingle());
    if (!o) throw new HttpError(404, "找不到訂單");
    if (parts[2] === "cancel") return await buyerCancel(o);
    if (parts[2] === "report") return await reportPayment(o, body.last5, me.display_name);
  }

  // ── 收藏 ──
  if (route === "wishlist" && m === "GET") {
    const rows = check(await db.from("wishlist").select().eq("line_user_id", line.userId).order("created_at"));
    return rows.map(wishOut);
  }
  if (parts[0] === "wishlist" && parts[1] && m === "PUT") {
    const p = (await products()).find((x) => x.id === parts[1]);
    if (!p) throw new HttpError(404, "找不到這件商品");
    const available = (await publicStock())[p.id] ?? 0;
    const price = p.variants?.length ? Math.min(...p.variants.map((v) => v.price)) : p.price;
    const row = check(
      await db
        .from("wishlist")
        .upsert({ line_user_id: line.userId, product_id: p.id, price_at_add: price, stock_at_add: available })
        .select()
        .single(),
    );
    return wishOut(row);
  }
  if (parts[0] === "wishlist" && parts[1] && m === "DELETE") {
    check(await db.from("wishlist").delete().eq("line_user_id", line.userId).eq("product_id", parts[1]));
    return { ok: true };
  }

  // ── 管理員 ──
  if (parts[0] === "admin") {
    if (!isAdmin) throw new HttpError(403, "沒有管理權限");

    if (route === "admin/orders" && m === "GET") {
      const rows = check(
        await db.from("orders").select("*, profiles(display_name, real_name, phone)").order("created_at", { ascending: false }).limit(500),
      );
      return rows.map(orderOut);
    }
    if (parts[1] === "orders" && parts[2] && m === "PATCH") {
      const id = Number(parts[2]);
      const o = check(await db.from("orders").select().eq("id", id).maybeSingle());
      if (!o) throw new HttpError(404, "找不到訂單");
      const patch: Row = {};
      const reason = str(body.reason, 200);
      if (body.status !== undefined && body.status !== o.status) {
        if (!STATUSES.includes(body.status)) throw new HttpError(400, "狀態不正確");
        const next = { ...o, status: body.status, created_at: body.status === "pending" ? o.created_at : new Date().toISOString() };
        // 從「不占庫存」變成「占庫存」（例如復原已取消的訂單、確認逾時的訂單）時，要確認庫存還夠
        if (!holdsStock(o) && holdsStock(next)) await ensureAvailable(o.items, id);
        patch.status = body.status;
        patch.status_history = [...(o.status_history ?? []), historyEntry(body.status, "admin", reason)];
        if (body.status === "arrived") patch.arrived_at = new Date().toISOString();
      }
      if (body.note !== undefined) patch.note = str(body.note, 300);
      if (body.tracking !== undefined) patch.tracking = str(body.tracking, 60);
      // 調整金額／記錄收款（新增或刪除一筆）
      const entry = (b: Row, min: number) => ({
        amount: int(b.amount, min, 1000000),
        note: str(b.note, 60),
        at: new Date().toISOString(),
      });
      const oldAdj: Row[] = o.adjustments ?? [];
      const oldRec: Row[] = o.receipts ?? [];
      let adjustments = oldAdj;
      let receipts = oldRec;
      if (body.addAdjustment) {
        const e = entry(body.addAdjustment, -1000000);
        if (e.amount === 0) throw new HttpError(400, "金額不能是 0");
        adjustments = [...adjustments, e];
      }
      if (typeof body.removeAdjustment === "number") adjustments = adjustments.filter((_, i) => i !== body.removeAdjustment);
      if (body.addReceipt) receipts = [...receipts, entry(body.addReceipt, 1)];
      if (typeof body.removeReceipt === "number") receipts = receipts.filter((_, i) => i !== body.removeReceipt);
      if (adjustments !== oldAdj) {
        patch.adjustments = adjustments;
        patch.total = baseTotal(o) + sum(adjustments);
        if (patch.total < 0) throw new HttpError(400, "調整後金額不能小於 0");
      }
      if (receipts !== oldRec) patch.receipts = receipts;
      if (Object.keys(patch).length === 0) return orderOut(o);
      const row = check(await db.from("orders").update(patch).eq("id", id).select("*, profiles(display_name, real_name, phone)").single());
      stockCache = null;
      // 預購到貨：用 LINE 通知買家轉帳付款
      if (patch.status === "arrived" && row.line_user_id) await pushLine([row.line_user_id], arrivalMessage(row));
      return orderOut(row);
    }
    if (route === "admin/members" && m === "GET") {
      return check(await db.from("member_stats").select().order("created_at", { ascending: false })).map(memberOut);
    }
    if (parts[1] === "members" && parts[2] && m === "PATCH") {
      if (typeof body.preorderBlocked !== "boolean") throw new HttpError(400, "資料格式錯誤");
      const row = check(
        await db.from("profiles").update({ preorder_blocked: body.preorderBlocked }).eq("line_user_id", parts[2]).select().maybeSingle(),
      );
      if (!row) throw new HttpError(404, "找不到會員");
      return memberOut(row);
    }
    if (route === "admin/inventory" && m === "GET") {
      return [...(await inventory()).values()];
    }
    if (route === "admin/inventory" && m === "POST") {
      const id = str(body.productId, 100); // SKU
      if (!id || !(await inventory()).has(id)) throw new HttpError(400, "找不到這件商品");
      const delta = int(body.delta, -999, 999);
      if (delta === 0) throw new HttpError(400, "數量不能是 0");
      check(await db.from("inventory_adjustments").insert({ product_id: id, delta, note: str(body.note, 100) }));
      stockCache = null;
      return (await inventory()).get(id);
    }
  }

  throw new HttpError(404, "找不到這個功能");
}

async function createOrder(userId: string | null, me: Row | null, body: Row) {
  const kind = body.kind;
  if (!["stock", "preorder", "proxy"].includes(kind)) throw new HttpError(400, "訂單類型錯誤");
  if (!userId && kind !== "stock") throw new HttpError(401, "預購與代購需要先登入");
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) throw new HttpError(400, "商品內容錯誤");
  if (kind === "preorder" && me?.preorder_blocked) throw new HttpError(403, "你的帳號目前無法預購，請 LINE 聯絡我們");

  const cat = await catalog();
  let items: Row[];
  if (kind === "proxy") {
    // 代購詢價：還沒報價，金額為 0
    items = body.items.map((i: Row) => {
      const link = str(i.url, 500);
      if (!link || !/^https?:\/\//i.test(link)) throw new HttpError(400, "商品網址不正確");
      return { name: str(i.name, 100) ?? "海外代購商品", price: 0, qty: int(i.qty, 1, 99), url: link, spec: str(i.spec, 200) };
    });
  } else {
    // 現貨／預購：商品、規格與單價以網站商品資料為準，不信任前端送來的價格
    items = [];
    for (const i of body.items) {
      const p = cat.products.find((x) => x.id === i.productId);
      if (!p) throw new HttpError(400, "商品已下架或不存在，請重新整理");
      let variant: Variant | undefined;
      if (p.variants?.length) {
        variant = p.variants.find((v) => v.id === i.variantId);
        if (!variant) throw new HttpError(400, `請選擇「${p.name}」的規格`);
      }
      const qty = int(i.qty, 1, userId ? 99 : 20);
      if (kind === "preorder" && !p.preorder) throw new HttpError(400, `「${p.name}」不是預購商品`);
      if (kind === "stock" && p.preorder) throw new HttpError(400, `「${p.name}」是預購商品，請用預購登記`);
      if (kind === "preorder" && p.preorder?.limit) {
        const mine = check(
          await db.from("orders").select("items").eq("line_user_id", userId).eq("kind", "preorder").not("status", "in", `(${INACTIVE.join(",")})`),
        );
        const already = mine.flatMap((o: Row) => o.items).filter((x: Row) => x.productId === p.id).reduce((s: number, x: Row) => s + x.qty, 0);
        if (already + qty > p.preorder.limit) throw new HttpError(409, `「${p.name}」每人限購 ${p.preorder.limit} 個，你已登記 ${already} 個`);
      }
      items.push({
        productId: p.id,
        ...(variant ? { variantId: variant.id, variant: variant.name } : {}),
        name: p.name,
        price: variant?.price ?? p.price,
        qty,
      });
    }
    await ensureAvailable(items); // 自動扣庫存：數量不夠就不成立
  }
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  // 現貨與預購：寄送方式、保價與付款方式都在網站結帳時決定，金額由這裡重新計算（預購只收轉帳，到貨後付款）
  let shipping: Row | null = null;
  let payment: Row | null = null;
  const r = body.recipient ?? {};
  const recipient = { name: str(r.name, 30), phone: str(r.phone, 20), store: str(r.store, 40), address: str(r.address, 120) };
  if (kind !== "proxy") {
    const s = body.shipping ?? {};
    const method = cat.shipping.find((x) => x.id === s.method && !x.requiresMyship);
    if (!method) throw new HttpError(400, "請選擇寄送方式");
    if (method.maxValue !== undefined && subtotal > method.maxValue) throw new HttpError(400, `${method.short}：${method.maxValueReason ?? "超過金額上限"}`);
    const declared = s.declaredValue === undefined ? undefined : int(s.declaredValue, 0, 1000000);
    const q = shipQuote(method, subtotal, !!s.insured, declared);
    shipping = {
      method: method.id,
      label: method.short,
      fee: q.fee,
      ...(q.declaredValue ? { declaredValue: q.declaredValue } : {}),
      insured: q.insured,
      ...(q.insuranceFee ? { insuranceFee: q.insuranceFee } : {}),
    };

    const pm = cat.payments.find((x) => x.id === body.payment?.method);
    if (!pm) throw new HttpError(400, "請選擇付款方式");
    if (kind === "preorder" && pm.id !== "transfer") throw new HttpError(400, "預購只接受到貨後銀行轉帳");
    const prods = items.map((i) => cat.products.find((p) => p.id === i.productId)!);
    if (prods.some((p) => !(p.payments ?? ["transfer", "cod"]).includes(pm.id))) throw new HttpError(400, `有商品不接受「${pm.label}」`);
    if (!pm.shipping.includes(method.id)) throw new HttpError(400, `${method.short}不能用「${pm.label}」`);
    const before = subtotal + q.fee + q.insuranceFee + pm.fee;
    if (pm.maxAmount !== undefined && before > pm.maxAmount) throw new HttpError(400, `「${pm.label}」金額上限為 ${ntd(pm.maxAmount)}`);
    payment = { method: pm.id, label: pm.label, fee: pm.fee };

    if (!recipient.name) throw new HttpError(400, "請填收件人姓名");
    if (!/^09\d{8}$/.test((recipient.phone ?? "").replace(/\D/g, ""))) throw new HttpError(400, "請填正確的手機號碼");
    if (method.id === "tcat" ? !recipient.address : !recipient.store) throw new HttpError(400, method.id === "tcat" ? "請填宅配地址" : "請填取貨門市");
  }
  const total = subtotal + (shipping ? shipping.fee + (shipping.insuranceFee ?? 0) : 0) + (payment?.fee ?? 0);

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await db
      .from("orders")
      .insert({
        code: newCode(),
        line_user_id: userId,
        guest: !userId,
        kind,
        items,
        shipping,
        payment,
        recipient,
        total,
        note: str(body.note, 300),
        status_history: [historyEntry("pending", "buyer", userId ? null : "訪客下單")],
      })
      .select()
      .single();
    if (!res.error) {
      stockCache = null;
      await notifyShop(orderMessage(res.data, me?.display_name ?? `訪客（${recipient.name ?? "未填姓名"}）`));
      return orderOut(res.data);
    }
    if (res.error.code !== "23505") throw new HttpError(500, `資料庫錯誤：${res.error.message}`); // 23505 = 訂單編號重複，重試
  }
  throw new HttpError(500, "建立訂單失敗，請再試一次");
}

/** 買家自行取消：還沒付款（預購還沒到貨）前都可以 */
async function buyerCancel(o: Row) {
  if (!["pending", "confirmed"].includes(o.status)) throw new HttpError(409, "這筆訂單目前無法自行取消，請 LINE 聯絡我們");
  const row = check(
    await db
      .from("orders")
      .update({ status: "cancelled", status_history: [...(o.status_history ?? []), historyEntry("cancelled", "buyer", "買家自行取消")] })
      .eq("id", o.id)
      .select()
      .single(),
  );
  stockCache = null;
  await notifyShop(`❎ 買家取消訂單 ${o.code}\n${SITE_URL}/admin/`);
  return orderOut(row);
}

/** 買家回報匯款（帳號末五碼），通知店家核對 */
async function reportPayment(o: Row, last5: unknown, buyer: string) {
  if (typeof last5 !== "string" || !/^\d{5}$/.test(last5)) throw new HttpError(400, "請輸入 5 位數字");
  if (o.payment?.method !== "transfer") throw new HttpError(400, "這筆訂單不是銀行轉帳");
  if (!["pending", "confirmed", "arrived"].includes(o.status)) throw new HttpError(409, "這筆訂單目前不需要回報匯款");
  const row = check(
    await db
      .from("orders")
      .update({ payment: { ...o.payment, report: { last5, at: new Date().toISOString() } } })
      .eq("id", o.id)
      .select()
      .single(),
  );
  await notifyShop(`💰 ${o.code} 回報已匯款\n買家：${buyer}\n應付：${ntd(dueOf(o))}\n帳號末五碼：${last5}\n${SITE_URL}/admin/`);
  return orderOut(row);
}

/** 訪客查詢訂單：訂單編號＋下單時填的手機號碼 */
async function guestOrder(body: Row) {
  const code = (str(body.code, 30) ?? "").toUpperCase();
  const phone = (str(body.phone, 20) ?? "").replace(/\D/g, "");
  if (!code || phone.length < 8) throw new HttpError(400, "請填訂單編號與手機號碼");
  const o = check(await db.from("orders").select().eq("code", code).maybeSingle());
  if (!o || (o.recipient?.phone ?? "").replace(/\D/g, "") !== phone) throw new HttpError(404, "找不到訂單，請確認訂單編號與手機號碼");
  if (body.action === "cancel") return await buyerCancel(o);
  if (body.action === "report") return await reportPayment(o, body.last5, `訪客（${o.recipient?.name ?? ""}）`);
  return orderOut(o);
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get("Origin")), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  try {
    return new Response(JSON.stringify(await handle(req)), { headers });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const message = e instanceof HttpError ? e.message : "伺服器錯誤";
    if (status === 500) console.error(e);
    return new Response(JSON.stringify({ error: message }), { status, headers });
  }
});

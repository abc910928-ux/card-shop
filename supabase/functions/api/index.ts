// TCG代購 會員 API（Supabase Edge Function，Deno）
// 前端帶 LINE（LIFF）access token → 這裡向 LINE 驗證 → 用 service role 讀寫資料庫。
// 環境變數（supabase secrets set）：
//   LINE_LOGIN_CHANNEL_ID  LINE Login 頻道 ID（驗證 token 是發給我們的頻道）
//   ADMIN_LINE_USER_IDS    管理員的 LINE userId，多個用逗號分隔
//   SITE_URL               網站網址，例：https://abc910928-ux.github.io/card-shop
// SUPABASE_URL、SUPABASE_SECRET_KEYS（或舊版 SUPABASE_SERVICE_ROLE_KEY）由 Supabase 自動提供。
import { createClient } from "npm:@supabase/supabase-js@2";

const CHANNEL_ID = Deno.env.get("LINE_LOGIN_CHANNEL_ID") ?? "";
const ADMINS = (Deno.env.get("ADMIN_LINE_USER_IDS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const SITE_URL = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
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
type Product = { id: string; name: string; price: number; stock: number; preorder: { limit?: number } | null };
let productCache: { at: number; list: Product[] } | null = null;
async function products(): Promise<Product[]> {
  if (productCache && Date.now() - productCache.at < 60_000) return productCache.list;
  const res = await fetch(`${SITE_URL}/products.json`);
  if (!res.ok) throw new HttpError(503, "暫時無法讀取商品資料，請稍後再試");
  const list = (await res.json()).products as Product[];
  productCache = { at: Date.now(), list };
  return list;
}

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

// ─── 庫存 ──────────────────────────────────────────────
// 剩餘 = 商品檔的 stock（進貨總數）＋ 手動調整 − 有效訂單占用的數量
function holdsStock(o: Row): boolean {
  if (o.kind === "proxy" || !ACTIVE.includes(o.status)) return false;
  if (o.kind === "stock" && o.status === "pending") {
    return Date.now() - new Date(o.created_at).getTime() < HOLD_HOURS * 3600_000;
  }
  return true;
}

type Stock = { id: string; name: string; preorder: boolean; base: number; adjust: number; sold: number; available: number };
async function inventory(excludeOrderId?: number): Promise<Map<string, Stock>> {
  const [list, orders, adjusts] = await Promise.all([
    products(),
    db.from("orders").select("id, kind, status, items, created_at").in("kind", ["stock", "preorder"]).in("status", ACTIVE),
    db.from("inventory_adjustments").select("product_id, delta"),
  ]);
  const map = new Map<string, Stock>();
  for (const p of list) map.set(p.id, { id: p.id, name: p.name, preorder: !!p.preorder, base: p.stock, adjust: 0, sold: 0, available: 0 });
  for (const a of check(adjusts)) {
    const s = map.get(a.product_id);
    if (s) s.adjust += a.delta;
  }
  for (const o of check(orders)) {
    if (o.id === excludeOrderId || !holdsStock(o)) continue;
    for (const i of o.items) {
      const s = i.productId && map.get(i.productId);
      if (s) s.sold += i.qty;
    }
  }
  for (const s of map.values()) s.available = Math.max(0, s.base + s.adjust - s.sold);
  return map;
}

/** 訂單要開始占用庫存時，確認數量還夠 */
async function ensureAvailable(items: Row[], excludeOrderId?: number) {
  const inv = await inventory(excludeOrderId);
  for (const i of items) {
    if (!i.productId) continue;
    const s = inv.get(i.productId);
    if (!s) throw new HttpError(400, `「${i.name}」已下架`);
    if (i.qty > s.available) throw new HttpError(409, `「${i.name}」庫存不足（剩 ${s.available} 個）`);
  }
}

let stockCache: { at: number; data: Record<string, number> } | null = null;
async function publicStock(): Promise<Record<string, number>> {
  if (stockCache && Date.now() - stockCache.at < 10_000) return stockCache.data;
  const data: Record<string, number> = {};
  for (const s of (await inventory()).values()) data[s.id] = s.available;
  stockCache = { at: Date.now(), data };
  return data;
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
  recipient: r.recipient,
  total: r.total,
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

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new HttpError(500, `資料庫錯誤：${res.error.message}`);
  return res.data;
}

function newCode(): string {
  const d = new Date(Date.now() + 8 * 3600_000).toISOString(); // 台灣時間
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
  return `TC-${d.slice(2, 4)}${d.slice(5, 7)}${d.slice(8, 10)}-${rand}`;
}

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
  if (parts[0] === "orders" && parts[2] === "cancel" && m === "POST") {
    // 買家自行取消：還沒付款（預購還沒到貨）前都可以
    const o = check(await db.from("orders").select().eq("id", Number(parts[1])).eq("line_user_id", line.userId).maybeSingle());
    if (!o) throw new HttpError(404, "找不到訂單");
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
    return orderOut(row);
  }

  // ── 收藏 ──
  if (route === "wishlist" && m === "GET") {
    const rows = check(await db.from("wishlist").select().eq("line_user_id", line.userId).order("created_at"));
    return rows.map(wishOut);
  }
  if (parts[0] === "wishlist" && parts[1] && m === "PUT") {
    const s = (await inventory()).get(parts[1]);
    if (!s) throw new HttpError(404, "找不到這件商品");
    const p = (await products()).find((x) => x.id === s.id)!;
    const row = check(
      await db
        .from("wishlist")
        .upsert({ line_user_id: line.userId, product_id: p.id, price_at_add: p.price, stock_at_add: s.available })
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
      if (Object.keys(patch).length === 0) return orderOut(o);
      const row = check(await db.from("orders").update(patch).eq("id", id).select("*, profiles(display_name, real_name, phone)").single());
      stockCache = null;
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
      const id = str(body.productId, 100);
      if (!id || !(await products()).some((p) => p.id === id)) throw new HttpError(400, "找不到這件商品");
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

  let items: Row[];
  if (kind === "proxy") {
    // 代購詢價：還沒報價，金額為 0
    items = body.items.map((i: Row) => {
      const link = str(i.url, 500);
      if (!link || !/^https?:\/\//i.test(link)) throw new HttpError(400, "商品網址不正確");
      return { name: str(i.name, 100) ?? "海外代購商品", price: 0, qty: int(i.qty, 1, 99), url: link, spec: str(i.spec, 200) };
    });
  } else {
    // 現貨／預購：商品與單價以網站商品資料為準，不信任前端送來的價格
    const list = await products();
    items = [];
    for (const i of body.items) {
      const p = list.find((x) => x.id === i.productId);
      if (!p) throw new HttpError(400, "商品已下架或不存在");
      const qty = int(i.qty, 1, userId ? 99 : 10);
      if (kind === "preorder" && !p.preorder) throw new HttpError(400, `「${p.name}」不是預購商品`);
      if (kind === "stock" && p.preorder) throw new HttpError(400, `「${p.name}」是預購商品，請用預購登記`);
      if (kind === "preorder" && p.preorder?.limit) {
        const mine = check(
          await db.from("orders").select("items").eq("line_user_id", userId).eq("kind", "preorder").not("status", "in", `(${INACTIVE.join(",")})`),
        );
        const already = mine.flatMap((o: Row) => o.items).filter((x: Row) => x.productId === p.id).reduce((s: number, x: Row) => s + x.qty, 0);
        if (already + qty > p.preorder.limit) throw new HttpError(409, `「${p.name}」每人限購 ${p.preorder.limit} 個，你已登記 ${already} 個`);
      }
      items.push({ productId: p.id, name: p.name, price: p.price, qty });
    }
    await ensureAvailable(items); // 自動扣庫存：數量不夠就不成立
  }

  let shipping: Row | null = null;
  if (kind === "stock" && body.shipping) {
    const s = body.shipping;
    shipping = {
      method: str(s.method, 20),
      label: str(s.label, 30),
      fee: int(s.fee, 0, 10000),
      declaredValue: s.declaredValue === undefined ? undefined : int(s.declaredValue, 0, 100000),
      insured: !!s.insured,
      insuranceFee: s.insuranceFee === undefined ? undefined : int(s.insuranceFee, 0, 10000),
    };
  }
  const r = body.recipient ?? {};
  const recipient = { name: str(r.name, 30), phone: str(r.phone, 20), store: str(r.store, 40), address: str(r.address, 120) };

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const total = subtotal + (shipping ? shipping.fee + (shipping.insuranceFee ?? 0) : 0);

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
        recipient,
        total,
        note: str(body.note, 300),
        status_history: [historyEntry("pending", "buyer", userId ? null : "訪客下單")],
      })
      .select()
      .single();
    if (!res.error) {
      stockCache = null;
      return orderOut(res.data);
    }
    if (res.error.code !== "23505") throw new HttpError(500, `資料庫錯誤：${res.error.message}`); // 23505 = 訂單編號重複，重試
  }
  throw new HttpError(500, "建立訂單失敗，請再試一次");
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

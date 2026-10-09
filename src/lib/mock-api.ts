// 本機開發用的假後端（PUBLIC_AUTH_MOCK=1）：資料存在 localStorage，行為模仿 Edge Function。
// 正式建置不會用到這個檔案。
import { ApiError, type OrderPatch } from "./api";
import { url } from "./url";
import { skuOf, skusOf, type ProductJson } from "./sku";
import { CANCELLED, HOLD_HOURS, type HistoryEntry, type Member, type NewOrder, type Order, type Profile, type WishItem } from "./orders";

const KEY = "mock-db-v3";
const ME = "Umock0000000000000000000000000001";

type DbOrder = Order & { lineUserId: string | null; createdMs: number };
type Db = {
  profiles: Record<string, Omit<Profile, "isAdmin">>;
  orders: DbOrder[];
  wishlist: (WishItem & { lineUserId: string })[];
  adjust: { productId: string; delta: number; note: string }[];
  seq: number;
};

const now = () => new Date().toISOString();
const hist = (status: Order["status"], by: HistoryEntry["by"], note?: string): HistoryEntry => ({ status, at: now(), by, ...(note ? { note } : {}) });
const digits = (s?: string | null) => (s ?? "").replace(/\D/g, "");

function seed(): Db {
  const ago = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();
  const base = { shipping: null, payment: null, tracking: null, guest: false, holdsStock: true, note: null } as const;
  return {
    profiles: {
      [ME]: { lineUserId: ME, displayName: "測試買家（管理員）", pictureUrl: null, realName: null, phone: null, storeName: null, address: null, preorderBlocked: false },
      Umock0000000000000000000000000002: {
        lineUserId: "Umock0000000000000000000000000002",
        displayName: "小明",
        pictureUrl: null,
        realName: "王小明",
        phone: "0912-000-000",
        storeName: "7-11 信義門市",
        address: null,
        preorderBlocked: false,
      },
    },
    orders: [
      {
        ...base,
        id: 1,
        code: "TC-260925-AB12",
        lineUserId: "Umock0000000000000000000000000002",
        kind: "stock",
        items: [{ productId: "tc-02-treasure-box", name: "海賊 TC-02寶藏箱", price: 3200, qty: 1 }],
        shipping: { method: "711", label: "7-11 交貨便", fee: 90, declaredValue: 4000 },
        payment: { method: "transfer", label: "銀行轉帳", fee: 0 },
        recipient: { name: "王小明", phone: "0912-000-000", store: "7-11 信義門市" },
        total: 3290,
        status: "paid",
        history: [{ status: "pending", at: ago(3), by: "buyer" }, { status: "confirmed", at: ago(3), by: "admin" }, { status: "paid", at: ago(2), by: "admin" }],
        createdAt: ago(3),
        createdMs: Date.now() - 3 * 86400_000,
        updatedAt: ago(2),
        arrivedAt: null,
      },
    ],
    wishlist: [],
    adjust: [],
    seq: 1,
  };
}

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const db = seed();
  save(db);
  return db;
}
function save(db: Db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {}
}

function holds(o: DbOrder): boolean {
  if (o.kind === "proxy" || CANCELLED.includes(o.status)) return false;
  if (o.kind === "stock" && o.status === "pending") return Date.now() - o.createdMs < HOLD_HOURS * 3600_000;
  return true;
}
const out = ({ lineUserId: _l, createdMs: _c, ...o }: DbOrder): Order => ({ ...o, holdsStock: holds({ ...o, lineUserId: null, createdMs: _c }) });

async function inventory(db: Db, exclude?: number) {
  const list: ProductJson[] = (await fetch(url("/products.json")).then((r) => r.json())).products;
  return list.flatMap(skusOf).map((s) => {
    const adjust = db.adjust.filter((a) => a.productId === s.sku).reduce((t, a) => t + a.delta, 0);
    const sold = db.orders
      .filter((o) => o.id !== exclude && holds(o))
      .flatMap((o) => o.items)
      .filter((i) => i.productId && skuOf(i.productId, i.variantId) === s.sku)
      .reduce((t, i) => t + i.qty, 0);
    return { id: s.sku, productId: s.productId, name: s.name, preorder: s.preorder, base: s.base, adjust, sold, available: Math.max(0, s.base + adjust - sold) };
  });
}
async function ensure(db: Db, items: Order["items"], exclude?: number) {
  const inv = await inventory(db, exclude);
  for (const i of items) {
    if (!i.productId) continue;
    const s = inv.find((x) => x.id === skuOf(i.productId!, i.variantId));
    if (s && i.qty > s.available) throw new ApiError(409, `「${s.name}」庫存不足（剩 ${s.available} 個）`);
  }
}

export async function mockCall<T>(method: string, path: string, body?: unknown): Promise<T> {
  await new Promise((r) => setTimeout(r, 150)); // 模擬網路延遲
  const db = load();
  const me = db.profiles[ME];
  const loggedIn = (() => {
    try {
      return !!localStorage.getItem("mock-auth-user");
    } catch {
      return false;
    }
  })();
  const parts = path.split("?")[0].split("/").filter(Boolean).map(decodeURIComponent);
  const route = parts.join("/");
  const done = (v: unknown) => {
    save(db);
    return v as T;
  };
  const cancel = (o: DbOrder) => {
    if (!["pending", "confirmed"].includes(o.status)) throw new ApiError(409, "這筆訂單目前無法自行取消");
    o.status = "cancelled";
    o.history.push(hist("cancelled", "buyer", "買家自行取消"));
    return done(out(o));
  };
  const report = (o: DbOrder, last5: unknown) => {
    if (typeof last5 !== "string" || !/^\d{5}$/.test(last5)) throw new ApiError(400, "請輸入 5 位數字");
    if (o.payment?.method !== "transfer") throw new ApiError(400, "這筆訂單不是銀行轉帳");
    o.payment.report = { last5, at: now() };
    console.info(`[mock] LINE 通知店家：${o.code} 回報匯款 ${last5}`);
    return done(out(o));
  };

  if (route === "stock") {
    const inv = await inventory(db);
    const map: Record<string, number> = {};
    for (const s of inv) {
      map[s.id] = s.available;
      if (s.id !== s.productId) map[s.productId] = (map[s.productId] ?? 0) + s.available;
    }
    return done(map);
  }
  if (route === "guest/order") {
    const b = body as { code: string; phone: string; action: string; last5?: string };
    const o = db.orders.find((x) => x.code === b.code?.toUpperCase());
    if (!o || !digits(b.phone) || digits(o.recipient?.phone) !== digits(b.phone))
      throw new ApiError(404, "找不到訂單，請確認訂單編號與手機號碼");
    if (b.action === "cancel") return cancel(o);
    if (b.action === "report") return report(o, b.last5);
    return done(out(o));
  }
  if (route === "me" && method === "GET") return done({ ...me, isAdmin: true });
  if (route === "me" && method === "PUT") {
    Object.assign(me, body);
    return done({ ...me, isAdmin: true });
  }
  if (route === "orders" && method === "GET") return done(db.orders.filter((o) => o.lineUserId === ME).map(out).reverse());
  if (route === "orders" && method === "POST") {
    const o = body as NewOrder;
    if (o.kind === "preorder" && me.preorderBlocked) throw new ApiError(403, "你的帳號目前無法預購，請 LINE 聯絡我們");
    if (o.kind !== "proxy") await ensure(db, o.items);
    const subtotal = o.items.reduce((s, i) => s + i.price * i.qty, 0);
    const ship = o.shipping ? o.shipping.fee + (o.shipping.insuranceFee ?? 0) : 0;
    const order: DbOrder = {
      id: ++db.seq,
      code: `TC-MOCK-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      lineUserId: loggedIn ? ME : null,
      guest: !loggedIn,
      kind: o.kind,
      items: o.items,
      shipping: o.shipping ?? null,
      payment: o.payment ?? null,
      recipient: o.recipient ?? null,
      total: subtotal + ship + (o.payment?.fee ?? 0),
      status: "pending",
      note: o.note ?? null,
      tracking: null,
      history: [hist("pending", "buyer", loggedIn ? undefined : "訪客下單")],
      holdsStock: true,
      createdAt: now(),
      createdMs: Date.now(),
      updatedAt: now(),
      arrivedAt: null,
    };
    db.orders.push(order);
    console.info(`[mock] LINE 通知店家：新訂單 ${order.code}`);
    return done(out(order));
  }
  if (parts[0] === "orders" && parts[2]) {
    const o = db.orders.find((x) => x.id === Number(parts[1]) && x.lineUserId === ME);
    if (!o) throw new ApiError(404, "找不到訂單");
    if (parts[2] === "cancel") return cancel(o);
    if (parts[2] === "report") return report(o, (body as { last5?: string }).last5);
  }
  if (route === "wishlist" && method === "GET")
    return done(db.wishlist.filter((w) => w.lineUserId === ME).map(({ lineUserId: _, ...w }) => w));
  if (parts[0] === "wishlist" && method === "PUT") {
    const snap = body as { price: number; stock: number };
    const item = { productId: parts[1], priceAtAdd: snap.price, stockAtAdd: snap.stock, createdAt: now() };
    db.wishlist = db.wishlist.filter((w) => !(w.lineUserId === ME && w.productId === parts[1]));
    db.wishlist.push({ ...item, lineUserId: ME });
    return done(item);
  }
  if (parts[0] === "wishlist" && method === "DELETE") {
    db.wishlist = db.wishlist.filter((w) => !(w.lineUserId === ME && w.productId === parts[1]));
    return done({ ok: true });
  }
  if (route === "admin/orders" && method === "GET") {
    return done(
      db.orders
        .map((o) => {
          const p = o.lineUserId ? db.profiles[o.lineUserId] : null;
          return { ...out(o), ...(p ? { member: { displayName: p.displayName, realName: p.realName, phone: p.phone } } : {}) };
        })
        .reverse(),
    );
  }
  if (parts[0] === "admin" && parts[1] === "orders" && method === "PATCH") {
    const o = db.orders.find((x) => x.id === Number(parts[2]));
    if (!o) throw new ApiError(404, "找不到訂單");
    const patch = body as { status?: Order["status"]; note?: string; tracking?: string; reason?: string };
    if (patch.status && patch.status !== o.status) {
      const next = { ...o, status: patch.status, createdMs: patch.status === "pending" ? o.createdMs : Date.now() };
      if (!holds(o) && holds(next)) await ensure(db, o.items, o.id);
      o.status = patch.status;
      o.history.push(hist(patch.status, "admin", patch.reason));
      if (patch.status === "arrived") {
        o.arrivedAt = now();
        if (o.lineUserId) console.info(`[mock] LINE 通知買家：${o.code} 到貨，請轉帳`);
      }
    }
    if (patch.note !== undefined) o.note = patch.note || null;
    if (patch.tracking !== undefined) o.tracking = patch.tracking || null;
    const p2 = body as OrderPatch;
    const entry = (e: { amount: number; note: string }) => ({ amount: e.amount, note: e.note || null, at: now() });
    if (p2.addAdjustment || typeof p2.removeAdjustment === "number") {
      let adj = o.adjustments ?? [];
      if (p2.addAdjustment) adj = [...adj, entry(p2.addAdjustment)];
      if (typeof p2.removeAdjustment === "number") adj = adj.filter((_, i) => i !== p2.removeAdjustment);
      const base = o.items.reduce((s, i) => s + i.price * i.qty, 0) + (o.shipping ? o.shipping.fee + (o.shipping.insuranceFee ?? 0) : 0) + (o.payment?.fee ?? 0);
      o.adjustments = adj;
      o.total = base + adj.reduce((s, x) => s + x.amount, 0);
    }
    if (p2.addReceipt) o.receipts = [...(o.receipts ?? []), entry(p2.addReceipt)];
    if (typeof p2.removeReceipt === "number") o.receipts = (o.receipts ?? []).filter((_, i) => i !== p2.removeReceipt);
    o.updatedAt = now();
    return done(out(o));
  }
  if (route === "admin/members" && method === "GET") {
    const members: Member[] = Object.values(db.profiles).map((p) => ({
      lineUserId: p.lineUserId,
      displayName: p.displayName,
      pictureUrl: p.pictureUrl,
      realName: p.realName,
      phone: p.phone,
      preorderBlocked: p.preorderBlocked,
      orderCount: db.orders.filter((o) => o.lineUserId === p.lineUserId).length,
      abandonedCount: db.orders.filter((o) => o.lineUserId === p.lineUserId && o.status === "abandoned").length,
      createdAt: now(),
    }));
    return done(members);
  }
  if (parts[0] === "admin" && parts[1] === "members" && method === "PATCH") {
    const p = db.profiles[parts[2]];
    if (!p) throw new ApiError(404, "找不到會員");
    p.preorderBlocked = (body as { preorderBlocked: boolean }).preorderBlocked;
    return done({ ...p, orderCount: 0, abandonedCount: 0, createdAt: "" });
  }
  if (route === "admin/inventory" && method === "GET") return done(await inventory(db));
  if (route === "admin/inventory" && method === "POST") {
    const b = body as { productId: string; delta: number; note: string };
    db.adjust.push(b);
    return done((await inventory(db)).find((s) => s.id === b.productId));
  }
  throw new ApiError(404, `mock：沒有這個路由 ${method} ${path}`);
}

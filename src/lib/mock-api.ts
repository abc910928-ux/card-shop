// 本機開發用的假後端（PUBLIC_AUTH_MOCK=1）：資料存在 localStorage，行為模仿 Edge Function。
// 正式建置不會用到這個檔案。
import { ApiError } from "./api";
import type { Member, NewOrder, Order, Profile, WishItem } from "./orders";

const KEY = "mock-db";
const ME = "Umock0000000000000000000000000001";

type Db = {
  profiles: Record<string, Omit<Profile, "isAdmin">>;
  orders: (Order & { lineUserId: string })[];
  wishlist: (WishItem & { lineUserId: string })[];
  seq: number;
};

function seed(): Db {
  const days = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();
  return {
    profiles: {
      [ME]: {
        lineUserId: ME,
        displayName: "測試買家（管理員）",
        pictureUrl: null,
        realName: null,
        phone: null,
        storeName: null,
        address: null,
        preorderBlocked: false,
      },
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
        id: 1,
        code: "TC-260925-AB12",
        lineUserId: "Umock0000000000000000000000000002",
        kind: "preorder",
        items: [{ productId: "tc-02-treasure-box", name: "海賊 TC-02寶藏箱", price: 3200, qty: 1 }],
        shipping: null,
        recipient: { name: "王小明", phone: "0912-000-000", store: "7-11 信義門市" },
        total: 3200,
        status: "arrived",
        note: null,
        createdAt: days(8),
        updatedAt: days(5),
        arrivedAt: days(5),
      },
      {
        id: 2,
        code: "TC-260901-CD34",
        lineUserId: "Umock0000000000000000000000000002",
        kind: "stock",
        items: [{ productId: "tc-02-treasure-box", name: "海賊 TC-02寶藏箱", price: 3200, qty: 1 }],
        shipping: { method: "711", label: "7-11 交貨便", fee: 90, declaredValue: 4000 },
        recipient: { name: "王小明", phone: "0912-000-000", store: "7-11 信義門市" },
        total: 3290,
        status: "abandoned",
        note: "逾期未付款",
        createdAt: days(30),
        updatedAt: days(25),
        arrivedAt: null,
      },
    ],
    wishlist: [],
    seq: 2,
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

const strip = ({ lineUserId: _, ...o }: Order & { lineUserId: string }): Order => o;

export async function mockCall<T>(method: string, path: string, body?: unknown): Promise<T> {
  await new Promise((r) => setTimeout(r, 150)); // 模擬網路延遲
  const db = load();
  const me = db.profiles[ME];
  const [route, query] = path.split("?");
  const parts = route.split("/").filter(Boolean).map(decodeURIComponent);
  const out = (v: unknown) => {
    save(db);
    return v as T;
  };

  if (route === "/me" && method === "GET") return out({ ...me, isAdmin: true });
  if (route === "/me" && method === "PUT") {
    Object.assign(me, body);
    return out({ ...me, isAdmin: true });
  }
  if (route === "/orders" && method === "GET")
    return out(db.orders.filter((o) => o.lineUserId === ME).map(strip).reverse());
  if (route === "/orders" && method === "POST") {
    const o = body as NewOrder;
    if (o.kind === "preorder" && me.preorderBlocked) throw new ApiError(403, "你的帳號目前無法預購，請 LINE 聯絡我們");
    const subtotal = o.items.reduce((s, i) => s + i.price * i.qty, 0);
    const ship = o.kind === "stock" && o.shipping ? o.shipping.fee + (o.shipping.insuranceFee ?? 0) : 0;
    const now = new Date().toISOString();
    const order = {
      id: ++db.seq,
      code: `TC-${now.slice(2, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      lineUserId: ME,
      kind: o.kind,
      items: o.items,
      shipping: o.shipping ?? null,
      recipient: o.recipient ?? null,
      total: subtotal + ship,
      status: "pending" as const,
      note: o.note ?? null,
      createdAt: now,
      updatedAt: now,
      arrivedAt: null,
    };
    db.orders.push(order);
    return out(strip(order));
  }
  if (route === "/wishlist" && method === "GET")
    return out(db.wishlist.filter((w) => w.lineUserId === ME).map(({ lineUserId: _, ...w }) => w));
  if (parts[0] === "wishlist" && method === "PUT") {
    const snap = body as { price: number; stock: number };
    const item = { productId: parts[1], priceAtAdd: snap.price, stockAtAdd: snap.stock, createdAt: new Date().toISOString() };
    db.wishlist = db.wishlist.filter((w) => !(w.lineUserId === ME && w.productId === parts[1]));
    db.wishlist.push({ ...item, lineUserId: ME });
    return out(item);
  }
  if (parts[0] === "wishlist" && method === "DELETE") {
    db.wishlist = db.wishlist.filter((w) => !(w.lineUserId === ME && w.productId === parts[1]));
    return out({ ok: true });
  }
  if (route === "/admin/orders" && method === "GET") {
    const status = new URLSearchParams(query).get("status");
    return out(
      db.orders
        .filter((o) => !status || o.status === status)
        .map((o) => ({ ...strip(o), member: { displayName: db.profiles[o.lineUserId]?.displayName ?? "", realName: db.profiles[o.lineUserId]?.realName ?? null, phone: db.profiles[o.lineUserId]?.phone ?? null } }))
        .reverse(),
    );
  }
  if (parts[0] === "admin" && parts[1] === "orders" && method === "PATCH") {
    const o = db.orders.find((x) => x.id === Number(parts[2]));
    if (!o) throw new ApiError(404, "找不到訂單");
    const patch = body as { status?: Order["status"]; note?: string };
    if (patch.status === "arrived" && o.status !== "arrived") o.arrivedAt = new Date().toISOString();
    Object.assign(o, patch, { updatedAt: new Date().toISOString() });
    return out(strip(o));
  }
  if (route === "/admin/members" && method === "GET") {
    const members: Member[] = Object.values(db.profiles).map((p) => ({
      lineUserId: p.lineUserId,
      displayName: p.displayName,
      pictureUrl: p.pictureUrl,
      realName: p.realName,
      phone: p.phone,
      preorderBlocked: p.preorderBlocked,
      orderCount: db.orders.filter((o) => o.lineUserId === p.lineUserId).length,
      abandonedCount: db.orders.filter((o) => o.lineUserId === p.lineUserId && o.status === "abandoned").length,
      createdAt: new Date().toISOString(),
    }));
    return out(members);
  }
  if (parts[0] === "admin" && parts[1] === "members" && method === "PATCH") {
    const p = db.profiles[parts[2]];
    if (!p) throw new ApiError(404, "找不到會員");
    p.preorderBlocked = (body as { preorderBlocked: boolean }).preorderBlocked;
    return out({ ...p, orderCount: 0, abandonedCount: 0, createdAt: "" });
  }
  throw new ApiError(404, `mock：沒有這個路由 ${method} ${path}`);
}

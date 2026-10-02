import { useEffect, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { login, logout, useAuth } from "../lib/auth";
import { setProfile, useProfile, useWishlist } from "../lib/profile";
import { api } from "../lib/api";
import { ntd } from "../lib/format";
import { url } from "../lib/url";
import { refreshStock } from "../lib/stock";
import {
  BUYER_CANCELLABLE,
  buyerStatus,
  isOverdue,
  itemLabel,
  kindLabel,
  payDeadline,
  statusTone,
  type Order,
  type ProfileInput,
} from "../lib/orders";
import OrderTimeline from "./OrderTimeline";

export type WishProduct = {
  id: string;
  name: string;
  href: string;
  price: number;
  stock: number;
  thumb?: string;
  preorder: boolean;
};

type Tab = "profile" | "orders" | "wishlist";
const TABS: { id: Tab; label: string }[] = [
  { id: "profile", label: "收件資料" },
  { id: "orders", label: "我的訂單" },
  { id: "wishlist", label: "我的收藏" },
];

// 會員中心：收件資料、訂單紀錄、收藏（與目前商品比對，提示已補貨／已降價）
export default function AccountApp({ products }: { products: WishProduct[] }) {
  const { enabled, ready, user } = useAuth();
  const [tab, setTab] = useState<Tab>("profile");

  useEffect(() => {
    const t = new URLSearchParams(location.search).get("tab") as Tab | null;
    if (t && TABS.some((x) => x.id === t)) setTab(t);
  }, []);
  function pick(t: Tab) {
    setTab(t);
    const sp = new URLSearchParams(location.search);
    sp.set("tab", t);
    history.replaceState(null, "", `${location.pathname}?${sp}`);
  }

  if (!enabled) return <Notice title="會員功能尚未開放" body="目前請直接用 LINE 官方帳號聯絡我們。" />;
  if (!ready) return <div class="h-40 animate-pulse rounded-2xl bg-surface" />;
  if (!user)
    return (
      <Notice title="登入會員" body="用 LINE 一鍵登入，不用註冊。登入後可以保存收件資料、查看訂單進度、收藏商品，預購商品也需要登入。">
        <button onClick={() => login()} class="mt-5 rounded-xl bg-[#06c755] px-6 py-3 font-bold text-white">
          LINE 登入
        </button>
      </Notice>
    );

  return (
    <div>
      <div class="flex items-center gap-3">
        {user.pictureUrl ? (
          <img src={user.pictureUrl} alt="" class="h-12 w-12 rounded-full" />
        ) : (
          <span class="grid h-12 w-12 place-items-center rounded-full bg-accent text-lg font-bold text-accent-ink">
            {user.displayName.slice(0, 1)}
          </span>
        )}
        <div class="min-w-0 flex-1">
          <div class="truncate text-lg font-bold">{user.displayName}</div>
          <div class="text-xs text-muted">LINE 會員</div>
        </div>
        <button onClick={() => logout()} class="text-sm text-muted underline underline-offset-2 hover:text-ink">
          登出
        </button>
      </div>

      <div class="mt-6 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            onClick={() => pick(t.id)}
            class={
              "-mb-px border-b-2 px-4 py-2.5 text-sm transition " +
              (tab === t.id ? "border-ink font-bold" : "border-transparent text-muted hover:text-ink")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div class="mt-6">
        {tab === "profile" && <ProfileForm />}
        {tab === "orders" && <OrderList />}
        {tab === "wishlist" && <Wishlist products={products} />}
      </div>
    </div>
  );
}

function ProfileForm() {
  const profile = useProfile();
  const [form, setForm] = useState<ProfileInput>({ realName: "", phone: "", storeName: "", address: "" });
  const [state, setState] = useState<"" | "saving" | "saved" | "error">("");

  useEffect(() => {
    if (profile)
      setForm({
        realName: profile.realName ?? "",
        phone: profile.phone ?? "",
        storeName: profile.storeName ?? "",
        address: profile.address ?? "",
      });
  }, [profile?.lineUserId]);

  if (!profile) return <div class="h-60 animate-pulse rounded-2xl bg-surface" />;

  async function save(e: Event) {
    e.preventDefault();
    setState("saving");
    try {
      setProfile(await api.saveMe(form));
      setState("saved");
    } catch {
      setState("error");
    }
  }

  const field = (key: keyof ProfileInput, label: string, placeholder: string, type = "text") => (
    <label class="block">
      <span class="mb-1.5 block text-sm font-medium">{label}</span>
      <input
        type={type}
        value={form[key] ?? ""}
        onInput={(e) => {
          setForm({ ...form, [key]: (e.target as HTMLInputElement).value });
          setState("");
        }}
        placeholder={placeholder}
        class="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-ink"
      />
    </label>
  );

  return (
    <form onSubmit={save} class="max-w-lg space-y-4">
      <p class="text-sm text-muted">下單時會自動帶入這些資料，不用每次重打。</p>
      {field("realName", "收件人姓名", "與證件相同，取貨時要核對")}
      {field("phone", "手機號碼", "09xx-xxx-xxx", "tel")}
      {field("storeName", "常用 7-11 門市", "門市名稱或店號，例：信義門市")}
      {field("address", "宅配地址（黑貓）", "需要宅配時才填")}
      <div class="flex items-center gap-3">
        <button
          type="submit"
          disabled={state === "saving"}
          class="rounded-xl bg-ink px-6 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {state === "saving" ? "儲存中…" : "儲存"}
        </button>
        {state === "saved" && <span class="text-sm text-ok">已儲存</span>}
        {state === "error" && <span class="text-sm text-sale">儲存失敗，請稍後再試</span>}
      </div>
      <p class="text-xs text-muted">
        資料只用於出貨與聯絡，詳見
        <a href={url("/terms/privacy/")} class="mx-0.5 underline">
          隱私權政策
        </a>
        。
      </p>
      <p class="break-all pt-4 text-[11px] text-muted/70">會員 ID：{profile.lineUserId}</p>
    </form>
  );
}

function OrderList() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .orders()
      .then(setOrders)
      .catch((e) => setError(e instanceof Error ? e.message : "讀取失敗"));
  }, []);

  async function cancel(o: Order) {
    if (!confirm(`確定要取消訂單 ${o.code}？取消後無法自行恢復。`)) return;
    try {
      const saved = await api.cancelOrder(o.id);
      setOrders((list) => list?.map((x) => (x.id === o.id ? saved : x)) ?? null);
      refreshStock();
    } catch (e) {
      alert(e instanceof Error ? e.message : "取消失敗");
    }
  }

  if (error) return <p class="text-sm text-sale">{error}</p>;
  if (!orders) return <div class="h-40 animate-pulse rounded-2xl bg-surface" />;
  if (orders.length === 0)
    return (
      <Notice title="還沒有訂單" body="登入後在網站上下單或預購，紀錄會出現在這裡。賣貨便的訂單請到賣貨便查詢。">
        <a href={url("/order/")} class="mt-4 inline-block text-sm underline underline-offset-2">
          沒登入時下的訂單？用訂單編號查詢
        </a>
      </Notice>
    );

  return (
    <ul class="space-y-3">
      {orders.map((o) => (
        <li class="rounded-2xl border border-line bg-surface p-4">
          <div class="flex flex-wrap items-center gap-2">
            <a href={url(`/order/?code=${o.code}`)} class="font-display font-bold hover:underline">
              {o.code}
            </a>
            <span class="rounded border border-line px-1.5 py-px text-[11px] text-ink-soft">{kindLabel[o.kind]}</span>
            <span class={`rounded px-2 py-0.5 text-xs font-medium ${statusTone[o.status]}`}>{buyerStatus(o)}</span>
            <span class="ml-auto text-xs text-muted">{new Date(o.createdAt).toLocaleDateString("zh-TW")}</span>
          </div>
          <div class="mt-4">
            <OrderTimeline o={o} compact />
          </div>
          <ul class="mt-4 space-y-0.5 text-sm text-ink-soft">
            {o.items.map((i) => (
              <li class="flex justify-between gap-3">
                <span class="min-w-0 truncate">
                  {itemLabel(i)} × {i.qty}
                </span>
                {i.price > 0 && <span class="shrink-0">{ntd(i.price * i.qty)}</span>}
              </li>
            ))}
          </ul>
          <div class="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-sm">
            <span class="text-muted">
              {o.shipping
                ? [o.shipping.label, o.payment?.label].filter(Boolean).join("・")
                : o.kind === "proxy"
                  ? "等待報價"
                  : "到貨後選寄送方式"}
            </span>
            {o.total > 0 && <span class="font-display font-bold">{ntd(o.total)}</span>}
          </div>
          {o.status === "arrived" && o.arrivedAt && (
            <p class={`mt-2 rounded-lg p-2 text-xs ${isOverdue(o) ? "bg-sale/10 text-sale" : "bg-accent/15"}`}>
              商品已到貨，請在 {payDeadline(o.arrivedAt).toLocaleDateString("zh-TW")} 前轉帳（匯款資訊在訂單頁）
              {isOverdue(o) && "（已超過付款期限，請盡快聯絡我們）"}
            </p>
          )}
          {o.payment?.method === "transfer" && o.status === "confirmed" && !o.payment.report && (
            <p class="mt-2 rounded-lg bg-accent/15 p-2 text-xs">訂單已確認，請到訂單頁查看匯款資訊。</p>
          )}
          {o.tracking && <p class="mt-2 text-sm">物流單號：<span class="font-medium">{o.tracking}</span></p>}
          {o.note && <p class="mt-2 text-xs text-muted">店家備註：{o.note}</p>}
          <div class="mt-3 flex items-center justify-end gap-4 border-t border-line pt-2">
            {BUYER_CANCELLABLE.includes(o.status) && (
              <button onClick={() => cancel(o)} class="text-xs text-muted underline underline-offset-2 hover:text-sale">
                取消訂單
              </button>
            )}
            <a href={url(`/order/?code=${o.code}`)} class="text-xs font-medium underline underline-offset-2">
              訂單詳情 →
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Wishlist({ products }: { products: WishProduct[] }) {
  const wish = useWishlist();
  if (!wish.items) return <div class="h-40 animate-pulse rounded-2xl bg-surface" />;
  if (wish.items.length === 0)
    return <Notice title="還沒有收藏" body="在商品頁按愛心收藏，補貨或降價時這裡會提示你。" />;

  return (
    <ul class="grid gap-3 sm:grid-cols-2">
      {wish.items.map((w) => {
        const p = products.find((x) => x.id === w.productId);
        if (!p)
          return (
            <li class="flex items-center justify-between rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
              <span>此商品已下架</span>
              <button onClick={() => wish.toggle(w.productId, { price: 0, stock: 0 })} class="underline">
                移除
              </button>
            </li>
          );
        const drop = w.priceAtAdd - p.price;
        const restocked = w.stockAtAdd === 0 && p.stock > 0;
        return (
          <li class="flex gap-3 rounded-2xl border border-line bg-surface p-3">
            <a href={p.href} class="h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-bg">
              {p.thumb && <img src={p.thumb} alt="" class="h-full w-full object-contain p-1" />}
            </a>
            <div class="flex min-w-0 flex-1 flex-col">
              <a href={p.href} class="line-clamp-2 text-sm font-medium hover:underline">
                {p.name}
              </a>
              <div class="mt-1 flex flex-wrap gap-1">
                {drop > 0 && (
                  <span class="rounded bg-sale px-1.5 py-0.5 text-[11px] font-bold text-white">已降價 {ntd(drop)}</span>
                )}
                {restocked && (
                  <span class="rounded bg-ok px-1.5 py-0.5 text-[11px] font-bold text-white">
                    {p.preorder ? "可預購" : "已補貨"}
                  </span>
                )}
                {p.stock === 0 && (
                  <span class="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600">
                    {p.preorder ? "預購額滿" : "已售完"}
                  </span>
                )}
              </div>
              <div class="mt-auto flex items-end justify-between">
                <span class="font-display font-bold">{ntd(p.price)}</span>
                <button
                  onClick={() => wish.toggle(p.id, { price: p.price, stock: p.stock })}
                  class="text-xs text-muted underline underline-offset-2 hover:text-ink"
                >
                  取消收藏
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Notice({ title, body, children }: { title: string; body: string; children?: ComponentChildren }) {
  return (
    <div class="rounded-2xl border border-dashed border-line bg-surface px-6 py-10 text-center">
      <div class="text-lg font-bold">{title}</div>
      <p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{body}</p>
      {children}
    </div>
  );
}

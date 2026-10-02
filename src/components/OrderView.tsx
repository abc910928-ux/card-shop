import { useEffect, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { shop } from "../config/shop";
import { login, useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { ntd } from "../lib/format";
import { oaMessageUrl } from "../lib/line";
import { savedOrders, rememberOrder, type SavedOrder } from "../lib/cart";
import { refreshStock } from "../lib/stock";
import { url } from "../lib/url";
import {
  BUYER_CANCELLABLE,
  CANCELLED,
  buyerStatus,
  itemLabel,
  kindLabel,
  payDeadline,
  statusTone,
  type Order,
} from "../lib/orders";
import OrderTimeline from "./OrderTimeline";

const TRACKING: Record<string, string> = {
  "711": "https://eservice.7-11.com.tw/e-tracking/search.aspx",
  tcat: "https://www.t-cat.com.tw/Inquire/Trace.aspx",
};

// 訂單頁（/order/?code=）：會員直接看；訪客用「訂單編號＋下單手機」查詢（同一台裝置會自動記住）
export default function OrderView() {
  const { enabled, ready, user } = useAuth();
  const [code, setCode] = useState("");
  const [isNew, setIsNew] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [guestPhone, setGuestPhone] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "lookup" | "ok">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    setCode((sp.get("code") ?? "").trim().toUpperCase());
    setIsNew(sp.get("new") === "1");
  }, []);

  useEffect(() => {
    if (!ready && enabled) return;
    if (!code) {
      setState("lookup");
      return;
    }
    (async () => {
      if (user) {
        const mine = await api.orders().catch(() => [] as Order[]);
        const hit = mine.find((o) => o.code === code);
        if (hit) {
          setOrder(hit);
          setState("ok");
          return;
        }
      }
      const saved = savedOrders().find((o) => o.code === code);
      if (saved) {
        try {
          setOrder(await api.guestOrder(code, saved.phone));
          setGuestPhone(saved.phone);
          setState("ok");
          return;
        } catch {}
      }
      setState("lookup");
    })();
  }, [code, ready, user?.userId]);

  async function lookup(c: string, phone: string) {
    setError("");
    try {
      const o = await api.guestOrder(c.trim().toUpperCase(), phone.trim());
      rememberOrder(o.code, phone.trim());
      setOrder(o);
      setGuestPhone(phone.trim());
      setCode(o.code);
      history.replaceState(null, "", url(`/order/?code=${o.code}`));
      setState("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : "查詢失敗");
    }
  }

  if (!enabled) return <Box>訂單查詢尚未開放，請用 LINE 聯絡我們。</Box>;
  if (state === "loading") return <div class="h-60 animate-pulse rounded-2xl bg-surface" />;
  if (state === "lookup" || !order)
    return <Lookup code={code} error={error} onLookup={lookup} loggedIn={!!user} />;

  const act = {
    cancel: () => (guestPhone ? api.guestOrder(order.code, guestPhone, "cancel") : api.cancelOrder(order.id)),
    report: (last5: string) =>
      guestPhone ? api.guestOrder(order.code, guestPhone, "report", last5) : api.reportPayment(order.id, last5),
  };
  return (
    <Detail
      o={order}
      isNew={isNew}
      guest={!!guestPhone}
      showLogin={enabled && !user}
      onChange={setOrder}
      act={act}
    />
  );
}

function Detail({
  o,
  isNew,
  guest,
  showLogin,
  onChange,
  act,
}: {
  o: Order;
  isNew: boolean;
  guest: boolean;
  showLogin: boolean;
  onChange: (o: Order) => void;
  act: { cancel: () => Promise<Order>; report: (last5: string) => Promise<Order> };
}) {
  const cancelled = CANCELLED.includes(o.status);
  const r = o.recipient;
  const goods = o.items.reduce((s, i) => s + i.price * i.qty, 0);

  async function cancel() {
    if (!confirm(`確定要取消訂單 ${o.code}？取消後無法自行恢復。`)) return;
    try {
      onChange(await act.cancel());
      refreshStock();
    } catch (e) {
      alert(e instanceof Error ? e.message : "取消失敗");
    }
  }

  return (
    <div class="space-y-4">
      {isNew && (
        <div class="rounded-2xl border border-ok/40 bg-ok/5 p-5">
          <div class="text-lg font-bold text-ok">訂單已送出！</div>
          <p class="mt-1 text-sm leading-relaxed text-ink-soft">
            店家已收到通知，確認訂單後這頁的進度會更新
            {o.payment?.method === "transfer" && "，並顯示匯款資訊"}。
            {guest && (
              <>
                {" "}
                請記下訂單編號 <b>{o.code}</b>，之後用訂單編號＋手機號碼就能查詢。
              </>
            )}
          </p>
          {showLogin && (
            <p class="mt-2 text-xs text-muted">
              下次可以先
              <button onClick={() => login()} class="mx-0.5 underline underline-offset-2">
                LINE 登入
              </button>
              ，訂單會自動存在「我的訂單」。
            </p>
          )}
        </div>
      )}

      {/* 標題 */}
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="font-display text-2xl font-bold">{o.code}</h1>
        <span class="rounded border border-line px-1.5 py-px text-[11px] text-ink-soft">{kindLabel[o.kind]}</span>
        <span class={`rounded px-2 py-0.5 text-xs font-medium ${statusTone[o.status]}`}>{buyerStatus(o)}</span>
        <span class="ml-auto text-xs text-muted">{new Date(o.createdAt).toLocaleString("zh-TW")}</span>
      </div>

      <div class="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
        <Card title="訂單進度">
          <OrderTimeline o={o} />
        </Card>

        <div class="space-y-4">
          {!cancelled && <PaymentCard o={o} onChange={onChange} report={act.report} />}

          {(o.shipping || o.tracking) && (
            <Card title="寄送">
              <dl class="space-y-1.5 text-sm">
                {o.shipping && (
                  <Line label="方式">
                    {o.shipping.label}
                    {o.shipping.declaredValue ? `（申報 ${ntd(o.shipping.declaredValue)}）` : ""}
                    {o.shipping.insured ? "（加保）" : ""}
                  </Line>
                )}
                {r?.name && <Line label="收件人">{[r.name, r.phone].filter(Boolean).join("・")}</Line>}
                {r?.store && <Line label="取貨門市">{r.store}</Line>}
                {r?.address && <Line label="地址">{r.address}</Line>}
                {o.tracking && (
                  <Line label="物流單號">
                    <span class="font-medium">{o.tracking}</span>
                    {o.shipping && TRACKING[o.shipping.method] && (
                      <a
                        href={TRACKING[o.shipping.method]}
                        target="_blank"
                        rel="noopener"
                        class="ml-2 text-xs underline underline-offset-2"
                      >
                        查詢貨態 ↗
                      </a>
                    )}
                  </Line>
                )}
              </dl>
            </Card>
          )}

          <Card title="商品">
            <ul class="space-y-1 text-sm">
              {o.items.map((i) => (
                <li class="flex justify-between gap-3">
                  <span class="min-w-0">
                    {i.url ? (
                      <a href={i.url} target="_blank" rel="noopener" class="underline">
                        {itemLabel(i)}
                      </a>
                    ) : (
                      itemLabel(i)
                    )}{" "}
                    × {i.qty}
                  </span>
                  {i.price > 0 && <span class="shrink-0">{ntd(i.price * i.qty)}</span>}
                </li>
              ))}
            </ul>
            {o.total > 0 && (
              <dl class="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                <Line label="商品小計">{ntd(goods)}</Line>
                {o.shipping && <Line label="運費">{ntd(o.shipping.fee)}</Line>}
                {!!o.shipping?.insuranceFee && <Line label="保價費">{ntd(o.shipping.insuranceFee)}</Line>}
                {!!o.payment?.fee && <Line label="付款手續費">{ntd(o.payment.fee)}</Line>}
                <div class="flex justify-between pt-1 font-bold">
                  <dt>合計</dt>
                  <dd class="font-display text-lg">{ntd(o.total)}</dd>
                </div>
              </dl>
            )}
          </Card>

          {o.note && (
            <Card title="店家備註">
              <p class="text-sm text-ink-soft">{o.note}</p>
            </Card>
          )}

          <div class="flex flex-wrap items-center gap-3">
            <a
              href={oaMessageUrl(`訂單 ${o.code} 想詢問：`)}
              target="_blank"
              rel="noopener"
              class="rounded-xl bg-[#06c755] px-4 py-2.5 text-sm font-bold text-white hover:brightness-105"
            >
              LINE 詢問這筆訂單
            </a>
            {BUYER_CANCELLABLE.includes(o.status) && (
              <button onClick={cancel} class="text-sm text-muted underline underline-offset-2 hover:text-sale">
                取消訂單
              </button>
            )}
            <a href={url("/shop/")} class="ml-auto text-sm text-muted underline underline-offset-2 hover:text-ink">
              繼續購物
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentCard({
  o,
  onChange,
  report,
}: {
  o: Order;
  onChange: (o: Order) => void;
  report: (last5: string) => Promise<Order>;
}) {
  const p = o.payment;
  const [last5, setLast5] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!p) {
    if (o.kind === "preorder")
      return (
        <Card title="付款">
          <p class="text-sm text-ink-soft">
            {o.status === "arrived" && o.arrivedAt
              ? `商品已到貨，請在 ${payDeadline(o.arrivedAt).toLocaleDateString("zh-TW")} 前透過 LINE 完成付款並選擇寄送方式。`
              : "預購不收訂金，到貨後會通知你付款並選擇寄送方式。"}
          </p>
        </Card>
      );
    return null;
  }

  if (p.method === "cod")
    return (
      <Card title="付款：取貨付款">
        <p class="text-sm text-ink-soft">
          {o.status === "completed" ? "已取貨付款，謝謝！" : `取貨時付現 ${ntd(o.total)}，不用先轉帳。`}
        </p>
      </Card>
    );

  const paid = ["paid", "shipped", "completed"].includes(o.status);
  const confirmedAt = [...o.history].reverse().find((h) => h.status === "confirmed")?.at;
  const deadline = confirmedAt && new Date(new Date(confirmedAt).getTime() + shop.payDays * 86400_000);
  const b = shop.bank;

  async function submit(e: Event) {
    e.preventDefault();
    if (!/^\d{5}$/.test(last5)) return setErr("請輸入 5 位數字");
    setBusy(true);
    setErr("");
    try {
      onChange(await report(last5));
      setLast5("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "回報失敗");
    }
    setBusy(false);
  }

  return (
    <Card title="付款：銀行轉帳">
      {paid ? (
        <p class="text-sm text-ok">已確認收款，謝謝！</p>
      ) : o.status === "pending" ? (
        <p class="text-sm text-ink-soft">店家確認訂單（確認庫存）後，這裡會顯示匯款帳號，請先不用轉帳。</p>
      ) : (
        <div class="space-y-3 text-sm">
          {b.account ? (
            <dl class="space-y-1 rounded-xl bg-bg p-3">
              <Line label="銀行">{`${b.name}${b.code ? `（${b.code}）` : ""}`}</Line>
              <Line label="帳號">
                <span class="font-display font-bold tracking-wide">{b.account}</span>
              </Line>
              {b.holder && <Line label="戶名">{b.holder}</Line>}
              <Line label="金額">
                <span class="font-bold">{ntd(o.total)}</span>
              </Line>
            </dl>
          ) : (
            <p class="rounded-xl bg-bg p-3 text-ink-soft">
              請
              <a href={oaMessageUrl(`訂單 ${o.code} 想索取匯款帳號`)} target="_blank" rel="noopener" class="mx-0.5 underline">
                LINE 詢問
              </a>
              匯款帳號，金額 <b>{ntd(o.total)}</b>。
            </p>
          )}
          {deadline && <p class="text-xs text-muted">請在 {deadline.toLocaleDateString("zh-TW")} 前完成轉帳。</p>}
          {p.report ? (
            <p class="rounded-lg bg-ok/10 px-3 py-2 text-ok">
              已回報匯款（帳號末五碼 {p.report.last5}），等待店家核對。
            </p>
          ) : (
            <form onSubmit={submit} class="flex flex-wrap items-center gap-2">
              <input
                value={last5}
                onInput={(e) => setLast5((e.target as HTMLInputElement).value.replace(/\D/g, "").slice(0, 5))}
                inputMode="numeric"
                placeholder="轉出帳號末五碼"
                class="w-40 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
              />
              <button disabled={busy} class="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {busy ? "送出中…" : "回報已匯款"}
              </button>
              {err && <span class="w-full text-xs text-sale">{err}</span>}
            </form>
          )}
        </div>
      )}
    </Card>
  );
}

function Lookup({
  code,
  error,
  loggedIn,
  onLookup,
}: {
  code: string;
  error: string;
  loggedIn: boolean;
  onLookup: (code: string, phone: string) => void;
}) {
  const [c, setC] = useState(code);
  const [phone, setPhone] = useState("");
  const [recent, setRecent] = useState<SavedOrder[]>([]);
  useEffect(() => setRecent(savedOrders()), []);
  return (
    <div class="mx-auto max-w-md space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onLookup(c, phone);
        }}
        class="space-y-4 rounded-2xl border border-line bg-surface p-5"
      >
        <h1 class="text-lg font-bold">查詢訂單</h1>
        <label class="block">
          <span class="mb-1.5 block text-sm font-medium">訂單編號</span>
          <input
            value={c}
            onInput={(e) => setC((e.target as HTMLInputElement).value)}
            placeholder="TC-261003-XXXX"
            class="w-full rounded-lg border border-line px-3 py-2.5 text-sm uppercase outline-none focus:border-ink"
          />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-sm font-medium">下單時填的手機號碼</span>
          <input
            type="tel"
            value={phone}
            onInput={(e) => setPhone((e.target as HTMLInputElement).value)}
            placeholder="09xx-xxx-xxx"
            class="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-ink"
          />
        </label>
        {error && <p class="text-sm text-sale">{error}</p>}
        <button class="w-full rounded-xl bg-ink py-3 text-sm font-medium text-white">查詢</button>
        {loggedIn ? (
          <p class="text-center text-xs text-muted">
            會員訂單請到
            <a href={url("/account/?tab=orders")} class="mx-0.5 underline">
              我的訂單
            </a>
          </p>
        ) : (
          <p class="text-center text-xs text-muted">
            會員請先
            <button type="button" onClick={() => login()} class="mx-0.5 underline">
              LINE 登入
            </button>
            直接查看
          </p>
        )}
      </form>
      {recent.length > 0 && (
        <div class="rounded-2xl border border-line bg-surface p-5">
          <h2 class="mb-2 text-sm font-bold">這台裝置下過的訂單</h2>
          <ul class="space-y-1 text-sm">
            {recent.map((r) => (
              <li>
                <button onClick={() => onLookup(r.code, r.phone)} class="font-display underline underline-offset-2">
                  {r.code}
                </button>
                <span class="ml-2 text-xs text-muted">{new Date(r.at).toLocaleDateString("zh-TW")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section class="rounded-2xl border border-line bg-surface p-5">
      <h2 class="mb-3 text-sm font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Line({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="flex gap-3">
      <dt class="w-16 shrink-0 text-muted">{label}</dt>
      <dd class="min-w-0 flex-1 text-ink-soft">{children}</dd>
    </div>
  );
}

function Box({ children }: { children: ComponentChildren }) {
  return (
    <p class="rounded-2xl border border-dashed border-line bg-surface px-6 py-10 text-center text-sm text-muted">{children}</p>
  );
}

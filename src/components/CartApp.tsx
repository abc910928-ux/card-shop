import { useEffect, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { paymentMethods, shippingMethods, shop, type PaymentId } from "../config/shop";
import { availability, defaultMethod, quote } from "../lib/shipping";
import { ntd, subline } from "../lib/format";
import { login, useAuth } from "../lib/auth";
import { setProfile, useProfile } from "../lib/profile";
import { api, ApiError } from "../lib/api";
import { PAY_DEADLINE_DAYS } from "../lib/orders";
import { clearCart, rememberOrder, removeFromCart, setCartQty, useCart, type CartLine } from "../lib/cart";
import { skuOf } from "../lib/sku";
import { refreshStock, useStockMap } from "../lib/stock";
import { url } from "../lib/url";
import type { ProductView } from "../lib/types";
import ShippingPicker, { type ShippingChoice } from "./ShippingPicker";
import Stepper from "./Stepper";

type Form = { name: string; phone: string; store: string; address: string; note: string };
const EMPTY: Form = { name: "", phone: "", store: "", address: "", note: "" };
const digits = (s: string) => s.replace(/\D/g, "");

// 購物車＋結帳：商品數量 → 寄送與保價 → 付款方式 → 收件資料 → 送出訂單（全部在網站內完成）
// ?buy=商品&v=規格&qty=數量：直接購買，只結這一件，不動購物車
export default function CartApp({ products }: { products: ProductView[] }) {
  const { enabled: authOn, ready, user } = useAuth();
  const profile = useProfile();
  const cart = useCart();
  const live = useStockMap();
  const [mounted, setMounted] = useState(false);
  const [buyNow, setBuyNow] = useState<CartLine | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const id = sp.get("buy");
    if (id) setBuyNow({ productId: id, variantId: sp.get("v") || undefined, qty: Math.max(1, Number(sp.get("qty")) || 1) });
    setMounted(true);
  }, []);

  const lines = buyNow ? [buyNow] : cart;
  const rows = lines.map((l) => {
    const p = products.find((x) => x.id === l.productId);
    const v = p?.variants?.find((x) => x.id === l.variantId);
    // 預購商品只能從商品頁「預購」直接結帳（不放購物車）
    const valid = !!p && (!p.preorder || !!buyNow) && (p.variants?.length ? !!v : !l.variantId);
    const sku = skuOf(l.productId, l.variantId);
    const stock = live?.[sku] ?? v?.stock ?? p?.stock ?? 0;
    const available = Math.min(stock, p?.preorder?.limit ?? Infinity);
    return { line: l, p, v, valid, sku, available, price: v?.price ?? p?.price ?? 0 };
  });
  const ok = rows.filter((r) => r.valid && r.available > 0);
  const goods = ok.reduce((s, r) => s + r.price * Math.min(r.line.qty, r.available), 0);
  const overStock = ok.some((r) => r.line.qty > r.available);
  // 預購：要登入、同意預購條款，只收轉帳（到貨後通知付款）
  const preorder = !!ok[0]?.p?.preorder;
  const [agreed, setAgreed] = useState(false);

  function changeQty(l: CartLine, n: number) {
    if (buyNow) setBuyNow({ ...buyNow, qty: n });
    else setCartQty(l, n);
  }
  function remove(l: CartLine) {
    if (buyNow) {
      setBuyNow(null);
      history.replaceState(null, "", url("/cart/"));
    } else removeFromCart(l);
  }

  // ── 寄送 ──
  const methods = shippingMethods.filter((m) => !m.requiresMyship); // 賣貨便只在商品頁連結
  const [ship, setShip] = useState<ShippingChoice>({ methodId: "711", insure: false });
  const [shipTouched, setShipTouched] = useState(false);
  useEffect(() => {
    if (!shipTouched && goods > 0) setShip((s) => ({ ...s, methodId: defaultMethod(methods, goods) }));
  }, [goods]);
  const picked = methods.find((m) => m.id === ship.methodId) ?? methods[0];
  const method = availability(picked, goods).ok ? picked : (methods.find((m) => availability(m, goods).ok) ?? picked);
  const anyShip = methods.some((m) => availability(m, goods).ok);
  const q = quote(method.id, goods, { insure: ship.insure, declared: ship.declared });

  // ── 付款：所有商品都接受、且能搭配目前寄送方式 ──
  const accepted = paymentMethods.filter(
    (pm) => ok.every((r) => r.p!.payments.includes(pm.id)) && (!preorder || pm.id === "transfer"),
  );
  const payState = (pm: (typeof paymentMethods)[number]) =>
    !pm.shipping.includes(method.id)
      ? `${method.short}不提供`
      : pm.maxAmount !== undefined && q.total + pm.fee > pm.maxAmount
        ? `金額超過 ${ntd(pm.maxAmount)}`
        : "";
  const [payId, setPayId] = useState<PaymentId | null>(null);
  const pay = accepted.find((pm) => pm.id === payId && !payState(pm)) ?? accepted.find((pm) => !payState(pm));
  const total = q.total + (pay?.fee ?? 0);

  // ── 收件資料：登入的人自動帶入，可修改 ──
  const [form, setForm] = useState<Form>(EMPTY);
  const [filledFor, setFilledFor] = useState<string | null>(null);
  const [saveProfile, setSaveProfile] = useState(true);
  useEffect(() => {
    if (!profile || filledFor === profile.lineUserId) return;
    setFilledFor(profile.lineUserId);
    setForm((f) => ({
      ...f,
      name: f.name || profile.realName || "",
      phone: f.phone || profile.phone || "",
      store: f.store || profile.storeName || "",
      address: f.address || profile.address || "",
    }));
  }, [profile]);
  const set = (k: keyof Form) => (e: Event) => setForm({ ...form, [k]: (e.target as HTMLInputElement).value });

  const errors: Partial<Record<keyof Form, string>> = {};
  if (!form.name.trim()) errors.name = "請填收件人姓名";
  if (!/^09\d{8}$/.test(digits(form.phone))) errors.phone = "請填 09 開頭的 10 碼手機號碼（取貨簡訊會傳到這支）";
  if (method.id === "711" && !form.store.trim()) errors.store = "請填取貨門市";
  if (method.id === "tcat" && form.address.trim().length < 6) errors.address = "請填完整地址";
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const profileChanged =
    !!profile &&
    (form.name.trim() !== (profile.realName ?? "") ||
      digits(form.phone) !== digits(profile.phone ?? "") ||
      (method.id === "711" && form.store.trim() !== (profile.storeName ?? "")) ||
      (method.id === "tcat" && form.address.trim() !== (profile.address ?? "")));

  async function submit(e: Event) {
    e.preventDefault();
    setTried(true);
    setError("");
    if (Object.keys(errors).length) {
      document.querySelector("[data-recipient]")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (!pay || overStock || !anyShip || ok.length === 0 || (preorder && !agreed)) return;
    setBusy(true);
    const phone = form.phone.trim();
    try {
      const o = await api.createOrder({
        kind: preorder ? "preorder" : "stock",
        items: ok.map((r) => ({
          productId: r.p!.id,
          variantId: r.v?.id,
          variant: r.v?.name,
          name: r.p!.name,
          price: r.price,
          qty: r.line.qty,
        })),
        shipping: {
          method: method.id,
          label: method.short,
          fee: q.shippingFee,
          declaredValue: q.declaredValue || undefined,
          insured: q.insured,
          insuranceFee: q.insuranceFee || undefined,
        },
        payment: { method: pay.id, label: pay.label, fee: pay.fee },
        recipient:
          method.id === "tcat"
            ? { name: form.name.trim(), phone, address: form.address.trim() }
            : { name: form.name.trim(), phone, store: form.store.trim() },
        note: form.note.trim() || undefined,
      });
      if (user && profile && saveProfile && profileChanged) {
        await api
          .saveMe({
            realName: form.name.trim(),
            phone,
            storeName: method.id === "711" ? form.store.trim() : profile.storeName,
            address: method.id === "tcat" ? form.address.trim() : profile.address,
          })
          .then(setProfile)
          .catch(() => {});
      }
      rememberOrder(o.code, phone);
      if (!buyNow) clearCart();
      refreshStock();
      location.href = url(`/order/?code=${encodeURIComponent(o.code)}&new=1`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) refreshStock();
      setError(err instanceof Error ? err.message : "送出失敗，請稍後再試");
      setBusy(false);
    }
  }

  if (!mounted) return <div class="h-60 animate-pulse rounded-2xl bg-surface" />;
  if (lines.length === 0)
    return (
      <div class="rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
        <div class="text-lg font-bold">購物車是空的</div>
        <p class="mt-2 text-sm text-muted">在商品頁選好規格與數量，按「加入購物車」或「直接購買」。</p>
        <a href={url("/shop/")} class="mt-5 inline-block rounded-xl bg-ink px-6 py-3 text-sm font-medium text-white">
          逛逛商品
        </a>
      </div>
    );

  if (preorder && ready && !user)
    return (
      <div class="rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
        <div class="text-lg font-bold">預購需要 LINE 登入</div>
        <p class="mt-2 text-sm text-muted">登入後選寄送方式、填收件資料就能登記，到貨時會用 LINE 通知你轉帳。</p>
        <button onClick={() => login()} class="mt-5 rounded-xl bg-[#06c755] px-6 py-3 font-bold text-white">
          LINE 登入
        </button>
      </div>
    );
  if (preorder && profile?.preorderBlocked)
    return (
      <p class="rounded-2xl bg-sale/10 p-6 text-center text-sm text-sale">
        你的帳號目前無法預購（依預購服務條款第七條），如有疑問請 LINE 聯絡我們。
      </p>
    );

  const field = (k: keyof Form, label: string, props: Record<string, unknown> = {}, hint?: ComponentChildren) => (
    <label class="block">
      <span class="mb-1.5 block text-sm font-medium">{label}</span>
      <input
        value={form[k]}
        onInput={set(k)}
        class={
          "w-full rounded-lg border bg-surface px-3 py-2.5 text-sm outline-none focus:border-ink " +
          (tried && errors[k] ? "border-sale" : "border-line")
        }
        {...props}
      />
      {tried && errors[k] ? (
        <span class="mt-1 block text-xs text-sale">{errors[k]}</span>
      ) : (
        hint && <span class="mt-1 block text-xs text-muted">{hint}</span>
      )}
    </label>
  );

  return (
    <form onSubmit={submit} class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8">
      <div class="space-y-6">
        {/* 1. 商品 */}
        <Section n={1} title={preorder ? "預購" : buyNow ? "直接購買" : "購物車"}>
          {buyNow && cart.length > 0 && (
            <p class="mb-3 text-xs text-muted">
              只結帳這一件，購物車裡的 {cart.length} 項商品不受影響（
              <a href={url("/cart/")} class="underline">
                改結購物車
              </a>
              ）
            </p>
          )}
          <ul class="divide-y divide-line">
            {rows.map((r) => (
              <li class="flex gap-3 py-3 first:pt-0 last:pb-0">
                <a href={r.p?.href} class="h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-bg">
                  {r.p?.thumb && <img src={r.p.thumb} alt="" class="h-full w-full object-contain p-1" />}
                </a>
                <div class="min-w-0 flex-1">
                  {r.p ? (
                    <>
                      <a href={r.p.href} class="line-clamp-2 text-sm font-medium hover:underline">
                        {r.p.name}
                      </a>
                      <div class="mt-0.5 text-xs text-muted">
                        {[r.v?.name, subline(r.p)].filter(Boolean).join("・")}
                      </div>
                    </>
                  ) : (
                    <div class="text-sm text-muted">此商品已下架</div>
                  )}
                  {r.valid && r.available === 0 && <div class="mt-1 text-xs text-sale">已售完，請移除</div>}
                  {r.valid && r.available > 0 && r.line.qty > r.available && (
                    <div class="mt-1 text-xs text-sale">只剩 {r.available} 件，請調整數量</div>
                  )}
                  {r.p && !r.valid && <div class="mt-1 text-xs text-sale">此規格已不提供，請移除後重新選擇</div>}
                  <div class="mt-2 flex items-center justify-between gap-2">
                    {r.valid && r.available > 0 ? (
                      <Stepper
                        size="sm"
                        value={Math.min(r.line.qty, r.available)}
                        max={r.available}
                        onChange={(n) => changeQty(r.line, n)}
                      />
                    ) : (
                      <span />
                    )}
                    <div class="flex items-center gap-3">
                      {r.valid && <span class="font-display text-sm font-bold">{ntd(r.price * r.line.qty)}</span>}
                      <button
                        type="button"
                        onClick={() => remove(r.line)}
                        class="text-xs text-muted underline underline-offset-2 hover:text-sale"
                      >
                        移除
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        {ok.length > 0 && (
          <>
            {/* 2. 寄送 */}
            <Section n={2} title="寄送方式">
              {anyShip ? (
                <ShippingPicker
                  methods={methods}
                  goods={goods}
                  value={{ ...ship, methodId: method.id }}
                  quote={q}
                  onChange={(v) => {
                    setShipTouched(true);
                    setShip(v);
                  }}
                />
              ) : (
                <p class="text-sm text-sale">
                  商品金額超過所有寄送方式的上限，請
                  <a href={shop.lineUrl} target="_blank" rel="noopener" class="mx-0.5 underline">
                    LINE 洽詢
                  </a>
                  寄送方式。
                </p>
              )}
            </Section>

            {/* 3. 付款 */}
            <Section n={3} title="付款方式">
              {accepted.length === 0 ? (
                <p class="text-sm text-sale">購物車裡的商品付款方式不同，請分開結帳。</p>
              ) : (
                <div class="space-y-2">
                  {accepted.map((pm) => {
                    const why = payState(pm);
                    const on = pay?.id === pm.id;
                    return (
                      <label
                        class={
                          "flex gap-3 rounded-xl border p-3 text-sm transition " +
                          (why
                            ? "cursor-not-allowed border-line bg-bg opacity-60"
                            : on
                              ? "cursor-pointer border-ink ring-1 ring-ink"
                              : "cursor-pointer border-line hover:border-ink-soft")
                        }
                      >
                        <input
                          type="radio"
                          name="payment"
                          class="mt-1 accent-ink"
                          checked={on}
                          disabled={!!why}
                          onChange={() => setPayId(pm.id)}
                        />
                        <div class="flex-1">
                          <div class="flex justify-between gap-2 font-medium">
                            <span>{pm.label}</span>
                            {pm.fee > 0 && <span>+{ntd(pm.fee)}</span>}
                          </div>
                          <div class="mt-0.5 text-xs text-muted">{why
                            ? `無法選擇：${why}`
                            : preorder
                              ? `不收訂金，商品到貨後通知你，${PAY_DEADLINE_DAYS} 天內轉帳`
                              : pm.note}</div>
                        </div>
                      </label>
                    );
                  })}
                  {paymentMethods.length > accepted.length && (
                    <p class="text-xs text-muted">部分商品只接受上面列出的付款方式。</p>
                  )}
                </div>
              )}
            </Section>

            {/* 4. 收件資料 */}
            <Section n={4} title="收件資料" anchor>
              {authOn && ready && !user && !preorder && (
                <p class="mb-4 rounded-lg bg-bg px-3 py-2.5 text-xs text-ink-soft">
                  不用登入也能下單。
                  <button type="button" onClick={() => login()} class="mx-0.5 font-medium underline underline-offset-2">
                    LINE 登入
                  </button>
                  可自動帶入收件資料，並在「我的訂單」追蹤進度。
                </p>
              )}
              {user && profile && (profile.realName || profile.phone) && (
                <p class="mb-4 text-xs text-muted">已帶入你的會員收件資料，可直接修改。</p>
              )}
              <div class="grid gap-4 sm:grid-cols-2">
                {field("name", "收件人姓名", { autoComplete: "name", placeholder: "與證件相同，取貨時要核對" })}
                {field("phone", "手機號碼", { type: "tel", autoComplete: "tel", placeholder: "0912-345-678" })}
              </div>
              <div class="mt-4">
                {method.id === "tcat"
                  ? field("address", "宅配地址", { autoComplete: "street-address", placeholder: "縣市、區、路、號、樓" })
                  : field(
                      "store",
                      "取貨門市（7-11）",
                      { placeholder: "門市名稱或店號，例：信義門市 / 123456" },
                      <>
                        不確定店名可到
                        <a href="https://emap.pcsc.com.tw/" target="_blank" rel="noopener" class="mx-0.5 underline">
                          7-11 門市查詢
                        </a>
                        找
                      </>,
                    )}
              </div>
              <label class="mt-4 block">
                <span class="mb-1.5 block text-sm font-medium">
                  備註 <span class="font-normal text-muted">（選填）</span>
                </span>
                <textarea
                  value={form.note}
                  onInput={set("note")}
                  rows={2}
                  maxLength={300}
                  placeholder="想對店家說的話，例：卡套需求、方便聯絡的時間"
                  class="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-ink"
                />
              </label>
              {user && profileChanged && (
                <label class="mt-3 flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={saveProfile}
                    onChange={() => setSaveProfile(!saveProfile)}
                    class="h-4 w-4 accent-ink"
                  />
                  同時更新我的會員收件資料
                </label>
              )}
            </Section>
          </>
        )}
      </div>

      {/* 金額與送出 */}
      {ok.length > 0 && (
        <aside class="rounded-2xl border border-line bg-surface p-5 lg:sticky lg:top-28">
          <h2 class="font-bold">訂單金額</h2>
          <dl class="mt-3 space-y-1.5 text-sm">
            <Row label={`商品（${ok.reduce((s, r) => s + r.line.qty, 0)} 件）`} value={ntd(goods)} />
            <Row label={`運費（${method.short}）`} value={ntd(q.shippingFee)} />
            {q.insured && <Row label="保價費" value={ntd(q.insuranceFee)} />}
            {pay && pay.fee > 0 && <Row label={`${pay.label}手續費`} value={ntd(pay.fee)} />}
            <div class="flex justify-between border-t border-line pt-2 text-base font-bold">
              <dt>合計</dt>
              <dd class="font-display text-xl">{ntd(total)}</dd>
            </div>
            <div class={`text-right text-xs ${q.coverCap < goods ? "text-sale" : "text-muted"}`}>
              遺失最高理賠 {ntd(q.coverCap)}
            </div>
          </dl>
          {preorder && (
            <label class="mt-3 flex cursor-pointer gap-2.5 rounded-lg border border-line p-3 text-xs leading-relaxed">
              <input
                type="checkbox"
                checked={agreed}
                onChange={() => setAgreed(!agreed)}
                class="mt-0.5 h-4 w-4 shrink-0 accent-ink"
              />
              <span>
                我已閱讀並同意
                <a href={url("/terms/preorder/")} target="_blank" class="mx-0.5 underline">
                  預購服務條款
                </a>
                ，了解到貨通知後 {PAY_DEADLINE_DAYS} 天內要轉帳，逾期視為取消，累計棄單會停止受理預購。
              </span>
            </label>
          )}
          {pay && (
            <p class="mt-3 rounded-lg bg-bg px-3 py-2 text-xs text-ink-soft">
              付款：{pay.label}・{preorder ? `商品到貨後會用 LINE 與訂單頁通知你，請在 ${PAY_DEADLINE_DAYS} 天內轉帳` : pay.note}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !pay || overStock || !anyShip || (preorder && (!agreed || !user || !!profile?.preorderBlocked))}
            class="mt-4 w-full rounded-xl bg-accent py-3.5 font-bold text-accent-ink transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "送出中…" : preorder ? `送出預購・${ntd(total)}` : `送出訂單・${ntd(total)}`}
          </button>
          {tried && Object.keys(errors).length > 0 && (
            <p class="mt-2 text-center text-xs text-sale">收件資料還沒填完整</p>
          )}
          {overStock && <p class="mt-2 text-center text-xs text-sale">有商品超過剩餘數量，請先調整</p>}
          {error && <p class="mt-2 text-center text-xs text-sale">{error}</p>}
          <p class="mt-3 text-center text-[11px] leading-relaxed text-muted">
            {preorder ? "預購不收訂金，到貨後才付款。" : "送出後店家會收到通知並確認訂單，進度可在訂單頁查看。"}
            <br />
            {preorder ? "付款確認後 1–2 個工作天內出貨。" : `${shop.leadTime}。`}
          </p>
        </aside>
      )}
    </form>
  );
}

function Section({ n, title, anchor, children }: { n: number; title: string; anchor?: boolean; children: ComponentChildren }) {
  return (
    <section {...(anchor ? { "data-recipient": "" } : {})} class="scroll-mt-28 rounded-2xl border border-line bg-surface p-5">
      <h2 class="mb-4 flex items-center gap-2 font-bold">
        <span class="grid h-6 w-6 place-items-center rounded-full bg-ink text-xs text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div class="flex justify-between text-ink-soft">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

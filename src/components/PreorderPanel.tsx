import { useState } from "preact/hooks";
import { shop, shippingMethods } from "../config/shop";
import { ntd } from "../lib/format";
import { feeLabel } from "../lib/shipping";
import { login, useAuth } from "../lib/auth";
import { useProfile } from "../lib/profile";
import { api } from "../lib/api";
import { PAY_DEADLINE_DAYS } from "../lib/orders";
import type { ProductView } from "../lib/types";
import { url } from "../lib/url";
import { skuOf } from "../lib/sku";
import { refreshStock, useStockMap } from "../lib/stock";
import Stepper from "./Stepper";

// 預購商品的下單面板：必須登入、同意預購條款才能登記。不收訂金，到貨通知後才付款與選寄送方式。
export default function PreorderPanel({ p }: { p: ProductView }) {
  const termsHref = url("/terms/preorder/");
  const pre = p.preorder!;
  const { enabled: authOn, ready, user } = useAuth();
  const profile = useProfile();
  const live = useStockMap();
  const variants = p.variants ?? [];
  const [variantId, setVariantId] = useState<string | undefined>(() => (variants.find((v) => v.stock > 0) ?? variants[0])?.id);
  const v = variants.find((x) => x.id === variantId);
  const price = v?.price ?? p.price;
  const stockOf = (id?: string, fallback = p.stock) => live?.[skuOf(p.id, id)] ?? fallback;
  const stock = stockOf(variantId, v?.stock ?? p.stock); // 扣掉已登記後的剩餘名額
  const full = stock === 0;
  const maxQty = Math.max(1, Math.min(stock, pre.limit ?? stock));
  const [qty, setQty] = useState(1);
  const q = Math.min(qty, maxQty);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const o = await api.createOrder({
        kind: "preorder",
        items: [{ productId: p.id, variantId, variant: v?.name, name: p.name, price, qty: q }],
        recipient: {
          name: profile?.realName ?? undefined,
          phone: profile?.phone ?? undefined,
          store: profile?.storeName ?? undefined,
          address: profile?.address ?? undefined,
        },
      });
      setDone(o.code);
      refreshStock();
    } catch (e) {
      setError(e instanceof Error ? e.message : "登記失敗，請稍後再試");
    }
    setBusy(false);
  }

  return (
    <div class="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div class="flex flex-wrap items-center gap-2">
        <span class="rounded bg-accent px-2 py-0.5 text-xs font-bold text-accent-ink">預購</span>
        <span class="font-display text-3xl font-bold">{ntd(price)}</span>
      </div>
      <dl class="mt-3 space-y-1 text-sm">
        <Info label="預計到貨" value={pre.eta} />
        {pre.deadline && <Info label="預購截止" value={pre.deadline} />}
        {pre.limit && <Info label="每人限購" value={`${pre.limit} 個`} />}
        <Info label="剩餘名額" value={full ? "預購額滿" : `${stock} 個`} />
      </dl>

      {variants.length > 0 && (
        <fieldset class="mt-4">
          <legend class="mb-2 text-sm text-muted">規格</legend>
          <div class="flex flex-wrap gap-2">
            {variants.map((x) => {
              const s = stockOf(x.id, x.stock);
              const on = x.id === variantId;
              return (
                <button
                  type="button"
                  onClick={() => setVariantId(x.id)}
                  disabled={s === 0}
                  aria-pressed={on}
                  class={
                    "rounded-lg border px-3 py-2 text-sm " +
                    (s === 0
                      ? "cursor-not-allowed border-dashed border-line text-muted line-through"
                      : on
                        ? "border-ink bg-ink text-white"
                        : "border-line hover:border-ink")
                  }
                >
                  {x.name}
                  {p.priceMax !== p.price && <span class="ml-1.5 text-xs opacity-70">{ntd(x.price)}</span>}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div class="mt-4 rounded-xl bg-bg p-3 text-xs leading-relaxed text-ink-soft">
        <b>不收訂金</b>：到貨後會在「我的訂單」通知，請在 {PAY_DEADLINE_DAYS} 天內付款並選寄送方式（
        {shippingMethods.filter((m) => !m.requiresMyship).map((m) => `${m.short} ${feeLabel(m)}`).join("、")}）。
      </div>

      {done ? (
        <div class="mt-5 space-y-2 rounded-xl border border-ok/40 bg-ok/5 p-4 text-sm">
          <div class="font-bold text-ok">已登記預購 {done}</div>
          <p class="text-ink-soft">店家確認後，進度會更新在訂單頁。</p>
          <a href={url(`/order/?code=${done}`)} class="inline-block font-medium underline underline-offset-2">
            查看訂單進度 →
          </a>
        </div>
      ) : full ? (
        <a
          href={shop.lineUrl}
          target="_blank"
          rel="noopener"
          class="mt-5 block rounded-xl border border-ink py-3 text-center text-sm font-medium"
        >
          預購額滿，LINE 詢問候補
        </a>
      ) : !authOn ? (
        // 會員功能尚未啟用時，先改用 LINE 詢問預購
        <a
          href={shop.lineUrl}
          target="_blank"
          rel="noopener"
          class="mt-5 block rounded-xl bg-accent py-3.5 text-center font-bold text-accent-ink"
        >
          LINE 詢問預購
        </a>
      ) : (
        <div class="mt-5 space-y-3">
          {maxQty > 1 && (
            <div class="flex items-center justify-between">
              <span class="text-sm text-muted">數量</span>
              <Stepper value={q} max={maxQty} onChange={setQty} />
            </div>
          )}

          <label class="flex cursor-pointer gap-2.5 rounded-xl border border-line p-3 text-sm">
            <input
              type="checkbox"
              checked={agreed}
              onChange={() => setAgreed(!agreed)}
              class="mt-0.5 h-4 w-4 shrink-0 accent-ink"
            />
            <span>
              我已閱讀並同意
              <a href={termsHref} target="_blank" class="mx-0.5 underline">
                預購服務條款
              </a>
              ，了解到貨通知後 {PAY_DEADLINE_DAYS} 天內要付款，逾期視為取消，累計棄單會停止受理預購。
            </span>
          </label>

          {!ready ? (
            <div class="h-12 animate-pulse rounded-xl bg-bg" />
          ) : !user ? (
            <button
              onClick={() => login()}
              class="w-full rounded-xl bg-[#06c755] py-3.5 font-bold text-white hover:brightness-105"
            >
              LINE 登入後預購
            </button>
          ) : profile?.preorderBlocked ? (
            <p class="rounded-xl bg-sale/10 p-3 text-sm text-sale">
              你的帳號目前無法預購（依預購服務條款第七條），如有疑問請 LINE 聯絡我們。
            </p>
          ) : (
            <button
              onClick={submit}
              disabled={!agreed || busy}
              class="w-full rounded-xl bg-accent py-3.5 font-bold text-accent-ink transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "登記中…" : `登記預購 ${q} 個・${ntd(price * q)}`}
            </button>
          )}
          {user && !agreed && !profile?.preorderBlocked && (
            <p class="text-center text-xs text-muted">請先勾選同意預購服務條款</p>
          )}
          {error && <p class="text-center text-xs text-sale">{error}</p>}
          <p class="text-center text-xs text-muted">預購商品需要登入 LINE，現貨商品不用</p>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div class="flex justify-between gap-4">
      <dt class="text-muted">{label}</dt>
      <dd class="font-medium">{value}</dd>
    </div>
  );
}

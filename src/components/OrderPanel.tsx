import { useEffect, useState } from "preact/hooks";
import { paymentMethods, shippingMethods, shop } from "../config/shop";
import { discountPercent, ntd } from "../lib/format";
import { feeLabel } from "../lib/shipping";
import { addToCart, useCart } from "../lib/cart";
import { skuOf } from "../lib/sku";
import { useStockMap } from "../lib/stock";
import { url } from "../lib/url";
import type { ProductView } from "../lib/types";
import Stepper from "./Stepper";

// 商品頁的購買面板（現貨）：選規格與數量 → 加入購物車或直接購買。寄送、付款、收件資料在結帳頁填。
export default function OrderPanel({ p }: { p: ProductView }) {
  const live = useStockMap();
  const cart = useCart();
  const variants = p.variants ?? [];
  const stockOf = (variantId?: string, fallback = p.stock) => live?.[skuOf(p.id, variantId)] ?? fallback;

  // 預設選第一個有貨的規格
  const [variantId, setVariantId] = useState<string | undefined>(
    () => (variants.find((v) => v.stock > 0) ?? variants[0])?.id,
  );
  useEffect(() => {
    if (!live || !variants.length) return;
    if (variantId && stockOf(variantId) > 0) return;
    const first = variants.find((v) => stockOf(v.id, v.stock) > 0);
    if (first) setVariantId(first.id);
  }, [live]);

  const v = variants.find((x) => x.id === variantId);
  const price = v?.price ?? p.price;
  const original = v ? v.originalPrice : p.originalPrice;
  const stock = stockOf(variantId, v?.stock ?? p.stock);
  const inCart = cart.find((l) => skuOf(l.productId, l.variantId) === skuOf(p.id, variantId))?.qty ?? 0;
  const canAdd = Math.max(0, stock - inCart);
  const totalStock = variants.length ? variants.reduce((s, x) => s + stockOf(x.id, x.stock), 0) : stock;
  const soldOut = totalStock === 0;

  const [qty, setQty] = useState(1);
  const q = Math.max(1, Math.min(qty, stock || 1));
  const [added, setAdded] = useState(false);
  useEffect(() => setAdded(false), [variantId]);

  const off = discountPercent({ price, originalPrice: original });
  const payments = paymentMethods.filter((m) => p.payments.includes(m.id));
  const ships = shippingMethods.filter((m) => !m.requiresMyship);

  function add() {
    addToCart({ productId: p.id, variantId, qty: Math.min(q, canAdd) }, stock);
    setAdded(true);
  }
  const buyHref = url(
    `/cart/?buy=${encodeURIComponent(p.id)}${variantId ? `&v=${encodeURIComponent(variantId)}` : ""}&qty=${q}`,
  );

  return (
    <div class="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      {/* 價格 */}
      <div class="flex flex-wrap items-baseline gap-2">
        <span class={`font-display text-3xl font-bold ${off > 0 ? "text-sale" : ""}`}>{ntd(price)}</span>
        {p.unit && <span class="text-sm text-muted">／{p.unit}</span>}
        {off > 0 && (
          <>
            <span class="text-sm text-muted line-through">{ntd(original!)}</span>
            <span class="rounded bg-sale px-1.5 py-0.5 text-xs font-bold text-white">-{off}%</span>
          </>
        )}
      </div>
      <div class={`mt-1 text-sm ${stock === 0 ? "text-sale" : "text-ok"}`}>
        {soldOut ? "已售完" : stock === 0 ? "此規格已售完" : `現貨 ${stock} 件`}
      </div>

      {/* 規格 */}
      {variants.length > 0 && (
        <fieldset class="mt-5">
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
                    "rounded-lg border px-3 py-2 text-left text-sm transition " +
                    (s === 0
                      ? "cursor-not-allowed border-dashed border-line text-muted line-through"
                      : on
                        ? "border-ink bg-ink text-white"
                        : "border-line hover:border-ink")
                  }
                >
                  {x.name}
                  {p.priceMax !== p.price && (
                    <span class={`ml-1.5 text-xs ${on ? "text-white/70" : "text-muted"}`}>{ntd(x.price)}</span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {stock > 0 && (
        <>
          {/* 數量 */}
          <div class="mt-5 flex items-center justify-between gap-3">
            <span class="text-sm text-muted">數量</span>
            <div class="flex items-center gap-3">
              {inCart > 0 && <span class="text-xs text-muted">購物車已有 {inCart} 件</span>}
              <Stepper value={q} max={stock} onChange={setQty} />
            </div>
          </div>

          <div class="mt-3 flex items-center justify-between text-sm">
            <span class="text-muted">小計</span>
            <span class="font-display font-bold">{ntd(price * q)}</span>
          </div>

          {/* 按鈕 */}
          <div class="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={add}
              disabled={canAdd === 0}
              class="rounded-xl border-2 border-ink py-3 font-bold transition hover:bg-ink hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink"
            >
              加入購物車
            </button>
            <a
              href={buyHref}
              class="grid place-items-center rounded-xl bg-accent py-3 font-bold text-accent-ink transition hover:brightness-95"
            >
              直接購買
            </a>
          </div>
          {added ? (
            <p class="mt-2 text-center text-sm text-ok">
              已加入購物車・
              <a href={url("/cart/")} class="font-medium underline underline-offset-2">
                前往結帳 →
              </a>
            </p>
          ) : (
            canAdd === 0 && <p class="mt-2 text-center text-xs text-muted">購物車裡已是剩餘的全部數量</p>
          )}
        </>
      )}

      {soldOut && (
        <a
          href={shop.lineUrl}
          target="_blank"
          rel="noopener"
          class="mt-5 block rounded-xl border border-ink py-3 text-center text-sm font-medium"
        >
          LINE 詢問補貨
        </a>
      )}

      {/* 寄送與付款摘要 */}
      <dl class="mt-5 space-y-1.5 border-t border-line pt-4 text-xs">
        <div class="flex gap-3">
          <dt class="w-10 shrink-0 text-muted">寄送</dt>
          <dd class="text-ink-soft">{ships.map((m) => `${m.short} ${feeLabel(m)}`).join("・")}</dd>
        </div>
        <div class="flex gap-3">
          <dt class="w-10 shrink-0 text-muted">付款</dt>
          <dd class="text-ink-soft">{payments.map((m) => m.label).join("・")}</dd>
        </div>
        <p class="pt-1 text-muted">寄送方式、保價與付款方式在結帳時選擇。</p>
      </dl>

      {p.myshipUrl && !soldOut && (
        <a
          href={p.myshipUrl}
          target="_blank"
          rel="noopener"
          class="mt-4 flex items-center justify-between rounded-xl border border-line px-4 py-3 text-sm hover:border-ink"
        >
          <span>
            也可以在 7-11 賣貨便下單
            <span class="block text-xs text-muted">運費 38 元・取貨付款，在賣貨便選門市</span>
          </span>
          <span aria-hidden="true">↗</span>
        </a>
      )}
    </div>
  );
}

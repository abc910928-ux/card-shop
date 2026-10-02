import { useState } from "preact/hooks";
import { shop, shippingMethods } from "../config/shop";
import { ntd } from "../lib/format";
import { feeLabel } from "../lib/shipping";
import { login, useAuth } from "../lib/auth";
import { useProfile } from "../lib/profile";
import { PAY_DEADLINE_DAYS } from "../lib/orders";
import type { ProductView } from "../lib/types";
import { url } from "../lib/url";
import { skuOf } from "../lib/sku";
import { useStockMap } from "../lib/stock";
import Stepper from "./Stepper";

// 預購商品的下單面板：選規格與數量，登入後進結帳頁登記（選寄送、填收件資料、同意預購條款）。不收訂金，到貨後通知轉帳。
export default function PreorderPanel({ p }: { p: ProductView }) {
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
  // 寄送方式、收件資料與條款同意都在結帳頁填（和現貨同一個結帳流程，只收轉帳）
  const buyHref = url(
    `/cart/?buy=${encodeURIComponent(p.id)}${variantId ? `&v=${encodeURIComponent(variantId)}` : ""}&qty=${q}`,
  );

  return (
    <div class="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div class="flex flex-wrap items-center gap-2">
        <span class="rounded bg-accent px-2 py-0.5 text-xs font-bold text-accent-ink">預購</span>
        <span class="font-display text-3xl font-bold">{ntd(price)}</span>
        {p.unit && <span class="text-sm text-muted">／{p.unit}</span>}
      </div>
      <dl class="mt-3 space-y-1 text-sm">
        <Info label="預計到貨" value={pre.eta ?? "到貨後通知"} />
        {pre.deadline && <Info label="預購截止" value={pre.deadline} />}
        {pre.limit && <Info label="每人限購" value={`${pre.limit} 個`} />}
        <Info label="庫存" value={full ? "已額滿" : `${stock} ${p.unit ?? "個"}`} />
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
        <b>不收訂金</b>：登記時選好寄送方式（
        {shippingMethods.filter((m) => !m.requiresMyship).map((m) => `${m.short} ${feeLabel(m)}`).join("、")}
        ）與收件資料，<b>到貨後會用 LINE 與訂單頁通知你轉帳</b>，請在 {PAY_DEADLINE_DAYS} 天內付款。
      </div>

      {full ? (
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
            <a
              href={buyHref}
              class="block w-full rounded-xl bg-accent py-3.5 text-center font-bold text-accent-ink transition hover:brightness-95"
            >
              預購 {q} 個・{ntd(price * q)}
            </a>
          )}
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

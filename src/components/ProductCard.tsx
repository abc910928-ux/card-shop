import type { ComponentChildren } from "preact";
import type { ProductView } from "../lib/types";
import { discountPercent, ntd, rarityTier, subline } from "../lib/format";
import { CardArt } from "./CardArt";
import WishlistButton from "./WishlistButton";

// wish：顯示愛心收藏按鈕（只在會互動的列表裡開，靜態頁面上按不了）
export function ProductCard({ p, wish = false }: { p: ProductView; wish?: boolean }) {
  const soldOut = p.stock === 0;
  const off = discountPercent(p);
  const tier = rarityTier(p.rarity);

  return (
    <a
      href={p.href}
      class="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5"
    >
      <div class="relative aspect-[63/88] bg-gradient-to-b from-slate-50 to-slate-200/70">
        {p.thumb ? (
          <img
            src={p.thumb}
            alt={p.name}
            loading="lazy"
            class="h-full w-full object-contain p-3 transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div class="h-full w-full transition duration-300 group-hover:scale-[1.03]">
            <CardArt {...p} />
          </div>
        )}

        {/* 左上：稀有度；鑑定卡改放左下，避免蓋住鑑定殼上方的標籤 */}
        <div class={`absolute left-2 flex flex-col items-start gap-1 ${p.grade ? "bottom-2" : "top-2"}`}>
          {p.grade ? (
            <span class="rounded bg-ink px-1.5 py-0.5 text-[11px] font-bold text-white">
              {p.grade.company} {p.grade.score}
            </span>
          ) : (
            p.rarity && (
              <span class={`badge-${tier} rounded px-1.5 py-0.5 text-[11px] font-bold`}>
                {p.rarity}
              </span>
            )
          )}
        </div>

        {/* 右上：預購、特價 */}
        <div class="absolute right-2 top-2 flex flex-col items-end gap-1">
          {p.preorder && (
            <span class="rounded bg-accent px-1.5 py-0.5 text-[11px] font-bold text-accent-ink">預購</span>
          )}
          {off > 0 && !soldOut && (
            <span class="rounded bg-sale px-1.5 py-0.5 text-[11px] font-bold text-white">-{off}%</span>
          )}
        </div>

        {soldOut && (
          <div class="absolute inset-0 grid place-items-center bg-white/60 backdrop-grayscale">
            <span class="rounded-full bg-ink/85 px-3 py-1 text-xs font-medium text-white">
              {p.preorder ? "預購額滿" : "已售完"}
            </span>
          </div>
        )}

        {wish && (
          <div class="absolute bottom-2 right-2">
            <WishlistButton productId={p.id} price={p.price} stock={p.stock} />
          </div>
        )}
      </div>

      <div class="flex flex-1 flex-col gap-1.5 p-3">
        <div class="truncate text-[11px] text-muted">
          {subline(p) || p.game}
        </div>
        <h3 class="line-clamp-2 text-sm font-medium leading-snug">
          {p.name}
          {p.rarity && p.category === "單卡&卡冊" && (
            <span class="ml-1 text-muted">{p.rarity}</span>
          )}
        </h3>
        <div class="flex flex-wrap gap-1">
          {p.language && <Chip>{p.language}</Chip>}
        </div>
        <div class="mt-auto pt-1 leading-tight">
          <div class="flex flex-wrap items-baseline gap-x-1">
            <span class={`font-display text-base font-bold ${off > 0 ? "text-sale" : ""}`}>
              {ntd(p.price)}
              {p.priceMax > p.price && <span class="ml-0.5 text-xs font-normal text-muted">起</span>}
            </span>
            {off > 0 && (
              <span class="text-[11px] text-muted line-through">{ntd(p.originalPrice!)}</span>
            )}
          </div>
          <div class="mt-0.5 text-[11px] text-muted">
            {p.preorder
              ? `預計 ${p.preorder.eta} 到貨`
              : soldOut
                ? "已售完"
                : p.variants?.length
                  ? `${p.variants.length} 種規格・剩 ${p.stock} 件`
                  : `剩 ${p.stock} 件`}
          </div>
        </div>
      </div>
    </a>
  );
}

function Chip({ children }: { children: ComponentChildren }) {
  return (
    <span class="rounded border border-line bg-bg px-1.5 py-px text-[11px] text-ink-soft">
      {children}
    </span>
  );
}

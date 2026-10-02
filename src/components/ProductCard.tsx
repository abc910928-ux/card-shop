import type { ComponentChildren } from "preact";
import type { ProductView } from "../lib/types";
import { discountPercent, ntd, rarityTier, subline } from "../lib/format";
import { CardArt } from "./CardArt";

export function ProductCard({ p }: { p: ProductView }) {
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

        {/* 右上：特價 */}
        {off > 0 && !soldOut && (
          <span class="absolute right-2 top-2 rounded bg-sale px-1.5 py-0.5 text-[11px] font-bold text-white">
            -{off}%
          </span>
        )}

        {soldOut && (
          <div class="absolute inset-0 grid place-items-center bg-white/60 backdrop-grayscale">
            <span class="rounded-full bg-ink/85 px-3 py-1 text-xs font-medium text-white">
              已售完
            </span>
          </div>
        )}
      </div>

      <div class="flex flex-1 flex-col gap-1.5 p-3">
        <div class="truncate text-[11px] text-muted">
          {subline(p) || p.game}
        </div>
        <h3 class="line-clamp-2 text-sm font-medium leading-snug">
          {p.name}
          {p.rarity && p.category === "單卡" && (
            <span class="ml-1 text-muted">{p.rarity}</span>
          )}
        </h3>
        <div class="flex flex-wrap gap-1">
          {p.language && <Chip>{p.language}</Chip>}
          {p.condition && p.category !== "原盒・擴充包" && p.category !== "周邊" && (
            <Chip>{p.condition}</Chip>
          )}
        </div>
        <div class="mt-auto pt-1 leading-tight">
          <div class="flex flex-wrap items-baseline gap-x-1">
            <span class={`font-display text-base font-bold ${off > 0 ? "text-sale" : ""}`}>
              {ntd(p.price)}
            </span>
            {off > 0 && (
              <span class="text-[11px] text-muted line-through">{ntd(p.originalPrice!)}</span>
            )}
          </div>
          <div class="mt-0.5 text-[11px] text-muted">
            {soldOut ? "已售完" : `剩 ${p.stock} 件`}
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

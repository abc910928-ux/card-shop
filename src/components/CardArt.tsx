import type { ProductView } from "../lib/types";

// 沒有商品照片時的佔位圖：依類別畫出卡片、原盒或周邊的示意
type Props = Pick<
  ProductView,
  "name" | "category" | "game" | "set" | "rarity" | "number"
>;

function hue(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function CardFace({ p, small = false }: { p: Props; small?: boolean }) {
  const h = hue(p.game + (p.set ?? ""));
  return (
    <div
      class="relative flex h-full w-full flex-col overflow-hidden rounded-[6%] p-[6%]"
      style={{
        background: `linear-gradient(160deg, hsl(${h} 70% 62%), hsl(${(h + 40) % 360} 65% 38%))`,
        boxShadow: "inset 0 0 0 3px rgba(255,255,255,.55)",
      }}
    >
      {/* 卡名放在插圖下方，避免被商品卡左上角的稀有度徽章蓋住 */}
      <div
        class="flex-1 rounded-[4%]"
        style={{
          background: `radial-gradient(circle at 30% 30%, hsl(${(h + 80) % 360} 90% 85%), hsl(${h} 60% 45%) 70%)`,
        }}
      />
      <div
        class={`mt-[5%] truncate font-bold text-white drop-shadow ${small ? "text-[9px]" : "text-xs"}`}
      >
        {p.name}
      </div>
      <div
        class={`mt-[5%] flex items-center justify-between text-white/90 ${small ? "text-[8px]" : "text-[10px]"}`}
      >
        <span class="truncate">{p.number ?? p.game}</span>
        {p.rarity && <span class="font-bold">{p.rarity}</span>}
      </div>
    </div>
  );
}

export function CardArt(p: Props) {
  if (p.category === "原盒・擴充包") {
    const h = hue(p.game + (p.set ?? p.name));
    return (
      <div class="flex h-full w-full items-center justify-center p-[8%]">
        <div
          class="relative flex aspect-[4/5] w-full flex-col justify-between rounded-md p-[8%] text-white shadow-lg"
          style={{
            background: `linear-gradient(150deg, hsl(${h} 65% 45%), hsl(${(h + 30) % 360} 70% 25%))`,
          }}
        >
          <span class="text-[10px] tracking-[0.2em] opacity-80">BOOSTER BOX</span>
          <span class="text-sm font-bold leading-snug">{p.set ?? p.name}</span>
          <span class="text-[10px] opacity-80">{p.game}</span>
          <div class="absolute inset-x-0 top-0 h-[12%] rounded-t-md bg-white/15" />
        </div>
      </div>
    );
  }

  if (p.category === "周邊") {
    return (
      <div class="flex h-full w-full flex-col items-center justify-center gap-3 p-[10%] text-center">
        <div class="grid h-16 w-12 place-items-center rounded-md border-2 border-dashed border-muted/50 bg-white/60 text-2xl">
          ✦
        </div>
        <span class="text-xs leading-snug text-muted">{p.name}</span>
      </div>
    );
  }

  return (
    <div class="h-full w-full p-[6%]">
      <CardFace p={p} />
    </div>
  );
}

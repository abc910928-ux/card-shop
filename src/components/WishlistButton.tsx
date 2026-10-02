import { login, useAuth } from "../lib/auth";
import { useWishlist } from "../lib/profile";

type Props = { productId: string; price: number; stock: number; variant?: "icon" | "full" };

// 愛心收藏：未登入按了會先登入。收藏時記下當下價格與庫存，之後用來提示「已降價」「已補貨」
export default function WishlistButton({ productId, price, stock, variant = "icon" }: Props) {
  const { enabled, user } = useAuth();
  const wish = useWishlist();
  if (!enabled) return null;
  const on = wish.has(productId);

  function onClick(e: MouseEvent) {
    e.preventDefault(); // 放在商品卡片連結裡時，不要跳頁
    e.stopPropagation();
    if (!user) {
      if (confirm("登入 LINE 後就能收藏商品，補貨或降價時會在「我的收藏」提示你。要現在登入嗎？")) login();
      return;
    }
    wish.toggle(productId, { price, stock });
  }

  if (variant === "full") {
    return (
      <button
        onClick={onClick}
        aria-pressed={on}
        class={
          "flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition " +
          (on ? "border-sale bg-sale/5 text-sale" : "border-line hover:border-ink")
        }
      >
        <Heart filled={on} />
        {on ? "已收藏" : "收藏（補貨・降價會提示）"}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-label={on ? "取消收藏" : "收藏"}
      class={
        "grid h-8 w-8 place-items-center rounded-full bg-white/90 shadow transition hover:scale-110 " +
        (on ? "text-sale" : "text-muted")
      }
    >
      <Heart filled={on} />
    </button>
  );
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" class="h-4 w-4" aria-hidden="true">
      <path
        d="M12 21s-7.5-4.6-9.6-9.4C.9 8.1 3 4.5 6.6 4.5c2 0 3.6 1.1 4.4 2.6.8-1.5 2.4-2.6 4.4-2.6 3.6 0 5.7 3.6 4.2 7.1C19.5 16.4 12 21 12 21z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        stroke-width="2"
        stroke-linejoin="round"
      />
    </svg>
  );
}

import { useCart } from "../lib/cart";
import { url } from "../lib/url";

// 頁首購物車圖示與件數
export default function CartButton() {
  const count = useCart().reduce((s, l) => s + l.qty, 0);
  return (
    <a
      href={url("/cart/")}
      class="relative grid h-8 w-8 shrink-0 place-items-center rounded-full text-white hover:text-accent"
      aria-label={count ? `購物車（${count} 件）` : "購物車"}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5" aria-hidden="true">
        <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="9" cy="20" r="1.3" />
        <circle cx="17" cy="20" r="1.3" />
      </svg>
      {count > 0 && (
        <span class="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-ink">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </a>
  );
}

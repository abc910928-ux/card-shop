import { useEffect, useRef, useState } from "preact/hooks";
import { login, logout, useAuth } from "../lib/auth";
import { useProfile } from "../lib/profile";
import { url } from "../lib/url";

// 頁首的登入狀態：未登入顯示「LINE 登入」，登入後顯示頭貼與選單
export default function AuthButton() {
  const { enabled, ready, user, error } = useAuth();
  const profile = useProfile();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  if (!enabled) return null;
  if (!ready) return <span class="h-8 w-8 animate-pulse rounded-full bg-white/10" />;

  if (!user) {
    return (
      <button
        onClick={() => login()}
        title={error ? `登入功能暫時無法使用：${error}` : undefined}
        class="shrink-0 whitespace-nowrap rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold text-white hover:border-accent"
      >
        登入
      </button>
    );
  }

  return (
    <div ref={ref} class="relative">
      <button
        onClick={() => setOpen(!open)}
        class="flex items-center gap-2 rounded-full border border-white/15 py-0.5 pl-0.5 pr-2.5 hover:border-accent"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {user.pictureUrl ? (
          <img src={user.pictureUrl} alt="" class="h-7 w-7 rounded-full" />
        ) : (
          <span class="grid h-7 w-7 place-items-center rounded-full bg-accent text-xs font-bold text-accent-ink">
            {user.displayName.slice(0, 1)}
          </span>
        )}
        <span class="hidden max-w-24 truncate text-xs text-white sm:block">{user.displayName}</span>
      </button>
      {open && (
        <div
          role="menu"
          class="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-xl border border-line bg-surface py-1 text-sm text-ink shadow-xl"
        >
          <a href={url("/account/")} class="block px-4 py-2.5 hover:bg-bg" role="menuitem">
            我的帳號
          </a>
          <a href={url("/account/?tab=orders")} class="block px-4 py-2.5 hover:bg-bg" role="menuitem">
            我的訂單
          </a>
          <a href={url("/account/?tab=wishlist")} class="block px-4 py-2.5 hover:bg-bg" role="menuitem">
            我的收藏
          </a>
          {profile?.isAdmin && (
            <a href={url("/admin/")} class="block border-t border-line px-4 py-2.5 font-medium hover:bg-bg" role="menuitem">
              管理後台
            </a>
          )}
          <button
            onClick={() => {
              setOpen(false);
              logout();
            }}
            class="block w-full border-t border-line px-4 py-2.5 text-left text-muted hover:bg-bg"
            role="menuitem"
          >
            登出
          </button>
        </div>
      )}
    </div>
  );
}

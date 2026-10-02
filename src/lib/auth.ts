// LINE 登入（LIFF）。全站共用一份登入狀態：各個互動元件 import 同一個模組，
// 狀態變化時通知所有訂閱的元件。沒設定 LIFF ID / API 網址時整個功能關閉。
import { useEffect, useState } from "preact/hooks";
import { shop } from "../config/shop";

export type User = { userId: string; displayName: string; pictureUrl?: string };
export type AuthState = { enabled: boolean; ready: boolean; user: User | null; error?: string };

// 本機開發用：PUBLIC_AUTH_MOCK=1 時不連 LINE，改用假帳號（正式建置一定關閉）
export const MOCK = import.meta.env.DEV && import.meta.env.PUBLIC_AUTH_MOCK === "1";
export const authEnabled = MOCK || !!(shop.liffId && shop.apiBase);

const MOCK_KEY = "mock-auth-user";
const MOCK_USER: User = { userId: "Umock0000000000000000000000000001", displayName: "測試買家（管理員）" };

let state: AuthState = { enabled: authEnabled, ready: !authEnabled, user: null };
const listeners = new Set<(s: AuthState) => void>();
function update(patch: Partial<AuthState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

type Liff = (typeof import("@line/liff"))["default"];
let liffPromise: Promise<Liff> | null = null;
function getLiff(): Promise<Liff> {
  liffPromise ??= (async () => {
    const { default: liff } = await import("@line/liff");
    await liff.init({ liffId: shop.liffId });
    return liff;
  })();
  return liffPromise;
}

let started = false;
/** 第一個用到登入狀態的元件會觸發初始化（處理 LINE 登入後導回時的參數） */
export function initAuth() {
  if (started || !authEnabled || typeof window === "undefined") return;
  started = true;
  if (MOCK) {
    let user: User | null = null;
    try {
      user = JSON.parse(localStorage.getItem(MOCK_KEY) ?? "null");
    } catch {}
    update({ ready: true, user });
    return;
  }
  getLiff()
    .then(async (liff) => {
      if (!liff.isLoggedIn()) return update({ ready: true });
      const p = await liff.getProfile();
      update({ ready: true, user: { userId: p.userId, displayName: p.displayName, pictureUrl: p.pictureUrl } });
    })
    .catch((e) => update({ ready: true, error: e instanceof Error ? e.message : String(e) }));
}

/** 登入後回到目前這一頁 */
export async function login() {
  if (MOCK) {
    try {
      localStorage.setItem(MOCK_KEY, JSON.stringify(MOCK_USER));
    } catch {}
    return update({ user: MOCK_USER });
  }
  const liff = await getLiff();
  if (!liff.isLoggedIn()) liff.login({ redirectUri: location.href });
}

export async function logout() {
  if (MOCK) {
    try {
      localStorage.removeItem(MOCK_KEY);
    } catch {}
    return update({ user: null });
  }
  const liff = await getLiff();
  liff.logout();
  update({ user: null });
}

/** 呼叫會員 API 用的 access token；沒登入回傳 null */
export async function getToken(): Promise<string | null> {
  if (MOCK) return state.user ? "mock-token" : null;
  if (!authEnabled) return null;
  const liff = await getLiff();
  return liff.isLoggedIn() ? liff.getAccessToken() : null;
}

export function useAuth(): AuthState {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    initAuth();
    setS(state);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}

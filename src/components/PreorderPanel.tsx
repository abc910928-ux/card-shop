import { useState } from "preact/hooks";
import { shop, shippingMethods } from "../config/shop";
import { ntd, subline } from "../lib/format";
import { feeLabel } from "../lib/shipping";
import { copyAndOpenLine } from "../lib/line";
import { login, useAuth } from "../lib/auth";
import { useProfile } from "../lib/profile";
import { api } from "../lib/api";
import { PAY_DEADLINE_DAYS } from "../lib/orders";
import type { ProductView } from "../lib/types";
import { url } from "../lib/url";
import { Stepper } from "./OrderPanel";

// 預購商品的下單面板：必須登入、同意預購條款才能登記。不收訂金，到貨通知後才付款與選寄送方式。
export default function PreorderPanel({ p }: { p: ProductView }) {
  const termsHref = url("/terms/preorder/");
  const pre = p.preorder!;
  const { enabled: authOn, ready, user } = useAuth();
  const profile = useProfile();
  const full = p.stock === 0;
  const maxQty = Math.max(1, Math.min(p.stock, pre.limit ?? p.stock));
  const [qty, setQty] = useState(1);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ code: string; text: string } | null>(null);
  const [error, setError] = useState("");

  const buildText = (code: string) =>
    [
      `【${shop.name} 預購登記】`,
      `訂單編號：${code}`,
      `商品：${[subline(p), p.name].filter(Boolean).join(" ")}`,
      `數量：${qty}`,
      `預購價：${ntd(p.price)} × ${qty} = ${ntd(p.price * qty)}`,
      `預計到貨：${pre.eta}`,
      "",
      "我已閱讀並同意預購服務條款。",
    ].join("\n");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const o = await api.createOrder({
        kind: "preorder",
        items: [{ productId: p.id, name: p.name, price: p.price, qty }],
        recipient: {
          name: profile?.realName ?? undefined,
          phone: profile?.phone ?? undefined,
          store: profile?.storeName ?? undefined,
          address: profile?.address ?? undefined,
        },
      });
      const text = buildText(o.code);
      setDone({ code: o.code, text });
      await copyAndOpenLine(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "登記失敗，請稍後再試");
    }
    setBusy(false);
  }

  return (
    <div class="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div class="flex flex-wrap items-center gap-2">
        <span class="rounded bg-accent px-2 py-0.5 text-xs font-bold text-accent-ink">預購</span>
        <span class="font-display text-3xl font-bold">{ntd(p.price)}</span>
      </div>
      <dl class="mt-3 space-y-1 text-sm">
        <Info label="預計到貨" value={pre.eta} />
        {pre.deadline && <Info label="預購截止" value={pre.deadline} />}
        {pre.limit && <Info label="每人限購" value={`${pre.limit} 個`} />}
        <Info label="剩餘名額" value={full ? "預購額滿" : `${p.stock} 個`} />
      </dl>

      <div class="mt-4 rounded-xl bg-bg p-3 text-xs leading-relaxed text-ink-soft">
        <b>不收訂金</b>：到貨後我們會用 LINE 通知，請在 {PAY_DEADLINE_DAYS} 天內付款並選寄送方式（
        {shippingMethods.map((m) => `${m.short} ${feeLabel(m)}`).join("、")}）。
      </div>

      {done ? (
        <div class="mt-5 space-y-2 rounded-xl border border-ok/40 bg-ok/5 p-4 text-sm">
          <div class="font-bold text-ok">已登記預購 {done.code}</div>
          <p class="text-ink-soft">
            已開啟 LINE 官方帳號並填好預購內容，按送出即可。我們確認後會傳「預購確認」給你，可在
            <a href={url("/account/?tab=orders")} class="mx-0.5 underline">
              我的訂單
            </a>
            查看進度。
          </p>
          <button onClick={() => copyAndOpenLine(done.text)} class="text-xs underline underline-offset-2">
            沒有開啟 LINE？再試一次
          </button>
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
              <Stepper value={qty} max={maxQty} onChange={setQty} />
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
              {busy ? "登記中…" : `登記預購 ${qty} 個`}
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

import { useMemo, useState } from "preact/hooks";
import { shop, type ShippingId } from "../config/shop";
import {
  availability,
  defaultMethod,
  feeLabel,
  insuranceRequired,
  methodsFor,
  quote,
  rateFee,
  tierFor,
} from "../lib/shipping";
import { discountPercent, ntd, subline } from "../lib/format";
import { copyAndOpenLine } from "../lib/line";
import type { ProductView } from "../lib/types";

// 商品頁右側的下單面板：選寄送方式與保價，即時算出合計並導向下單管道
export default function OrderPanel({ p }: { p: ProductView }) {
  const soldOut = p.stock === 0;
  const methods = methodsFor(p);
  const [qty, setQty] = useState(1);
  const goods = p.price * qty;
  const [methodId, setMethodId] = useState<ShippingId>(() => defaultMethod(methods, p.price));
  const [wantIns, setWantIns] = useState(false);
  const [declared, setDeclared] = useState<number | undefined>(undefined); // undefined = 依商品金額自動選級距
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");

  const anyAvailable = methods.some((m) => availability(m, goods).ok);
  // 數量變動後若原本的方式超過上限，自動換成可用的
  const picked = methods.find((m) => m.id === methodId) ?? methods[0];
  const method = availability(picked, goods).ok
    ? picked
    : (methods.find((m) => availability(m, goods).ok) ?? picked);
  const q = quote(method.id, goods, { insure: wantIns, declared });
  const c = method.coverage;
  const off = discountPercent(p);

  const orderText = useMemo(() => {
    const item = [subline(p), p.name, p.rarity, p.grade && `${p.grade.company} ${p.grade.score}`]
      .filter(Boolean)
      .join(" ");
    const lines = [
      `【${shop.name} 訂單】`,
      `商品：${item}`,
      `商品編號：${p.id}`,
      `單價：${ntd(p.price)} × ${qty}`,
      `寄送：${method.short}（運費 ${ntd(q.shippingFee)}）`,
    ];
    if (c.kind === "tiers") lines.push(`申報價值：${ntd(q.declaredValue)}`);
    if (c.kind === "rate")
      lines.push(
        q.insured ? `加保：是（報值 ${ntd(q.declaredValue)}，保價費 ${ntd(q.insuranceFee)}）` : "加保：否",
      );
    lines.push(`合計：${ntd(q.total)}`, "");
    lines.push(
      method.id === "tcat"
        ? "收件人姓名：\n電話：\n地址："
        : "取貨門市（店名或店號）：\n收件人姓名：\n電話：",
    );
    return lines.join("\n");
  }, [p, qty, method, q, c.kind]);

  async function orderByLine() {
    setCopied((await copyAndOpenLine(orderText)) ? "ok" : "fail");
  }

  return (
    <div class="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      {/* 價格 */}
      <div class="flex flex-wrap items-baseline gap-2">
        <span class={`font-display text-3xl font-bold ${off > 0 ? "text-sale" : ""}`}>
          {ntd(p.price)}
        </span>
        {off > 0 && (
          <>
            <span class="text-sm text-muted line-through">{ntd(p.originalPrice!)}</span>
            <span class="rounded bg-sale px-1.5 py-0.5 text-xs font-bold text-white">-{off}%</span>
          </>
        )}
      </div>
      <div class={`mt-1 text-sm ${soldOut ? "text-sale" : "text-ok"}`}>
        {soldOut ? "已售完" : `現貨 ${p.stock} 件`}
      </div>

      {!soldOut && (
        <>
          {/* 數量 */}
          {p.stock > 1 && (
            <div class="mt-5 flex items-center justify-between">
              <span class="text-sm text-muted">數量</span>
              <div class="flex items-center rounded-lg border border-line">
                <button
                  class="px-3 py-1.5 text-lg leading-none disabled:opacity-30"
                  disabled={qty <= 1}
                  onClick={() => setQty(qty - 1)}
                  aria-label="減少"
                >
                  −
                </button>
                <span class="w-8 text-center text-sm">{qty}</span>
                <button
                  class="px-3 py-1.5 text-lg leading-none disabled:opacity-30"
                  disabled={qty >= p.stock}
                  onClick={() => setQty(qty + 1)}
                  aria-label="增加"
                >
                  +
                </button>
              </div>
            </div>
          )}

          {/* 寄送方式 */}
          <fieldset class="mt-5">
            <legend class="mb-2 text-sm text-muted">寄送方式</legend>
            <div class="space-y-2">
              {methods.map((m) => {
                const av = availability(m, goods);
                const on = m.id === method.id && av.ok;
                return (
                  <label
                    class={
                      "flex gap-3 rounded-xl border p-3 transition " +
                      (!av.ok
                        ? "cursor-not-allowed border-line bg-bg opacity-60"
                        : on
                          ? "cursor-pointer border-ink ring-1 ring-ink"
                          : "cursor-pointer border-line hover:border-ink-soft")
                    }
                  >
                    <input
                      type="radio"
                      name="shipping"
                      class="mt-1 accent-ink"
                      checked={on}
                      disabled={!av.ok}
                      onChange={() => setMethodId(m.id)}
                    />
                    <div class="flex-1 text-sm">
                      <div class="flex justify-between gap-2 font-medium">
                        <span>{m.label}</span>
                        <span class="shrink-0">{feeLabel(m)}</span>
                      </div>
                      <div class="mt-0.5 text-xs text-muted">
                        {av.ok ? `${m.feeNote}・${m.payment}` : `無法選擇：${av.reason}`}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* 保價 */}
          <div class="mt-4 rounded-xl bg-bg p-3 text-sm">
            {c.kind === "tiers" && (
              <div>
                <label class="mb-1.5 block font-medium" for="declared">
                  申報價值（保價）
                </label>
                <select
                  id="declared"
                  value={q.declaredValue}
                  onChange={(e) => setDeclared(Number((e.target as HTMLSelectElement).value))}
                  class="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                >
                  {c.tiers.map((t, i) => (
                    <option value={t.upTo}>
                      {ntd(i === 0 ? 1 : c.tiers[i - 1].upTo + 1)}–{ntd(t.upTo)}・運費 {ntd(t.fee)}
                    </option>
                  ))}
                </select>
                <div class="mt-1.5 text-xs leading-relaxed text-muted">
                  遺失最多賠到申報價值。預設依商品金額選擇
                  {declared !== undefined && (
                    <button
                      class="ml-1 underline underline-offset-2 hover:text-ink"
                      onClick={() => setDeclared(undefined)}
                    >
                      （改回 {ntd(tierFor(c.tiers, goods).upTo)}）
                    </button>
                  )}
                  。
                  {goods > c.tiers[c.tiers.length - 1].upTo ? (
                    <span class="mt-1 block text-sale">
                      商品金額超過交貨便最高申報價值 {ntd(c.tiers[c.tiers.length - 1].upTo)}
                      ，遺失最多只賠 {ntd(q.coverCap)}，建議改選黑貓宅配加保。
                    </span>
                  ) : (
                    q.declaredValue < goods && (
                      <span class="mt-1 block text-sale">
                        申報價值低於商品金額，遺失最多只賠 {ntd(q.coverCap)}。
                      </span>
                    )
                  )}
                </div>
              </div>
            )}

            {c.kind === "rate" && (
              <label
                class={`flex gap-3 ${insuranceRequired(method, goods) ? "" : "cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  class="mt-1 accent-ink"
                  checked={q.insured}
                  disabled={insuranceRequired(method, goods)}
                  onChange={() => setWantIns(!wantIns)}
                />
                <div>
                  <div class="font-medium">
                    加保（黑貓報值）
                    <span class="ml-1 font-normal text-muted">+{ntd(rateFee(method, goods))}</span>
                  </div>
                  <div class="mt-0.5 text-xs leading-relaxed text-muted">
                    保價費 = 商品金額 × {c.rate * 100}%，遺失或毀損依報值金額理賠（上限{" "}
                    {ntd(c.maxValue)}）。未加保最多賠 {ntd(c.baseCap)}。
                    {insuranceRequired(method, goods) && (
                      <span class="text-ink">
                        {" "}
                        商品超過 {ntd(c.requiredAbove)}，依黑貓規定必須報值。
                      </span>
                    )}
                  </div>
                </div>
              </label>
            )}

            {c.kind === "fixed" && (
              <div class="text-xs leading-relaxed text-muted">
                {method.short}沒有加保選項，遺失依訂單金額理賠，上限 {ntd(c.cap)}。
                想自選保價請改選交貨便或黑貓宅配。
              </div>
            )}
          </div>

          {/* 金額明細 */}
          <dl class="mt-5 space-y-1.5 text-sm">
            <Row label={`商品 × ${qty}`} value={ntd(goods)} />
            <Row label={`運費（${method.short}）`} value={ntd(q.shippingFee)} />
            {q.insured && <Row label="保價費" value={ntd(q.insuranceFee)} />}
            <div class="flex justify-between border-t border-line pt-2 text-base font-bold">
              <dt>合計</dt>
              <dd class="font-display">{ntd(q.total)}</dd>
            </div>
            <div class={`text-right text-xs ${q.coverCap < goods ? "text-sale" : "text-muted"}`}>
              遺失最高理賠 {ntd(q.coverCap)}
            </div>
          </dl>
        </>
      )}

      {/* 下單按鈕 */}
      <div class="mt-5 space-y-2">
        {soldOut || !anyAvailable ? (
          <a
            href={shop.lineUrl}
            target="_blank"
            rel="noopener"
            class="block rounded-xl border border-ink py-3 text-center text-sm font-medium"
          >
            {soldOut ? "LINE 詢問補貨" : "金額較高，請 LINE 洽詢寄送方式"}
          </a>
        ) : method.orderVia === "myship" && p.myshipUrl ? (
          <>
            <a
              href={p.myshipUrl}
              target="_blank"
              rel="noopener"
              class="block rounded-xl bg-accent py-3.5 text-center font-bold text-accent-ink transition hover:brightness-95"
            >
              前往 7-11 賣貨便下單 ↗
            </a>
            <p class="text-center text-xs text-muted">在賣貨便選擇數量與取貨門市，取貨時付款即可</p>
          </>
        ) : (
          <>
            <button
              onClick={orderByLine}
              class="w-full rounded-xl bg-accent py-3.5 font-bold text-accent-ink transition hover:brightness-95"
            >
              複製訂單並用 LINE 下單
            </button>
            <p class="text-center text-xs text-muted">
              {copied === "ok"
                ? "已複製訂單內容，請在 LINE 對話中貼上送出"
                : copied === "fail"
                  ? "無法自動複製，請手動複製下方訂單內容"
                  : `會開啟 LINE（ID：${shop.lineId}），貼上訂單即可，確認後轉帳出貨`}
            </p>
            {copied && (
              <textarea
                readOnly
                rows={9}
                value={orderText}
                class="w-full rounded-lg border border-line bg-bg p-3 text-xs"
                onFocus={(e) => (e.target as HTMLTextAreaElement).select()}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div class="flex justify-between text-ink-soft">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

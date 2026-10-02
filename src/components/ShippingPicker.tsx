import type { ShippingId, ShippingMethod } from "../config/shop";
import { availability, feeLabel, insuranceRequired, rateFee, tierFor, type Quote } from "../lib/shipping";
import { ntd } from "../lib/format";

export type ShippingChoice = { methodId: ShippingId; insure: boolean; declared?: number };

// 結帳頁的寄送方式＋保價選擇（交貨便選申報價值、黑貓可加保）
export default function ShippingPicker({
  methods,
  goods,
  value,
  quote: q,
  onChange,
}: {
  methods: ShippingMethod[];
  goods: number;
  value: ShippingChoice;
  quote: Quote;
  onChange: (v: ShippingChoice) => void;
}) {
  const method = q.method;
  const c = method.coverage;
  return (
    <div>
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
                onChange={() => onChange({ ...value, methodId: m.id })}
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

      <div class="mt-3 rounded-xl bg-bg p-3 text-sm">
        {c.kind === "tiers" && (
          <div>
            <label class="mb-1.5 block font-medium" for="declared">
              申報價值（保價）
            </label>
            <select
              id="declared"
              value={q.declaredValue}
              onChange={(e) => onChange({ ...value, declared: Number((e.target as HTMLSelectElement).value) })}
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
              {value.declared !== undefined && (
                <button
                  type="button"
                  class="ml-1 underline underline-offset-2 hover:text-ink"
                  onClick={() => onChange({ ...value, declared: undefined })}
                >
                  （改回 {ntd(tierFor(c.tiers, goods).upTo)}）
                </button>
              )}
              。
              {goods > c.tiers[c.tiers.length - 1].upTo ? (
                <span class="mt-1 block text-sale">
                  商品金額超過交貨便最高申報價值 {ntd(c.tiers[c.tiers.length - 1].upTo)}，遺失最多只賠{" "}
                  {ntd(q.coverCap)}，建議改選黑貓宅配加保。
                </span>
              ) : (
                q.declaredValue < goods && (
                  <span class="mt-1 block text-sale">申報價值低於商品金額，遺失最多只賠 {ntd(q.coverCap)}。</span>
                )
              )}
            </div>
          </div>
        )}

        {c.kind === "rate" && (
          <label class={`flex gap-3 ${insuranceRequired(method, goods) ? "" : "cursor-pointer"}`}>
            <input
              type="checkbox"
              class="mt-1 accent-ink"
              checked={q.insured}
              disabled={insuranceRequired(method, goods)}
              onChange={() => onChange({ ...value, insure: !value.insure })}
            />
            <div>
              <div class="font-medium">
                加保（黑貓報值）
                <span class="ml-1 font-normal text-muted">+{ntd(rateFee(method, goods))}</span>
              </div>
              <div class="mt-0.5 text-xs leading-relaxed text-muted">
                保價費 = 商品金額 × {c.rate * 100}%，遺失或毀損依報值金額理賠（上限 {ntd(c.maxValue)}）。未加保最多賠{" "}
                {ntd(c.baseCap)}。
                {insuranceRequired(method, goods) && (
                  <span class="text-ink"> 商品超過 {ntd(c.requiredAbove)}，依黑貓規定必須報值。</span>
                )}
              </div>
            </div>
          </label>
        )}

        {c.kind === "fixed" && (
          <div class="text-xs leading-relaxed text-muted">
            {method.short}沒有加保選項，遺失依訂單金額理賠，上限 {ntd(c.cap)}。
          </div>
        )}
      </div>
    </div>
  );
}

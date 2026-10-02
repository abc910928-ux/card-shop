import {
  shippingMethods,
  type Coverage,
  type ShippingId,
  type ShippingMethod,
  type ValueTier,
} from "../config/shop";
import { ntd } from "./format";

export function methodById(id: ShippingId): ShippingMethod {
  return shippingMethods.find((m) => m.id === id)!;
}

/** 取某個方式的保障設定（首頁、說明頁顯示用） */
export function coverageOf<K extends Coverage["kind"]>(id: ShippingId, kind: K) {
  const c = methodById(id).coverage;
  if (c.kind !== kind) throw new Error(`${id} 的 coverage 不是 ${kind}`);
  return c as Extract<Coverage, { kind: K }>;
}
export const rateCoverage = () => coverageOf("tcat", "rate");
export const tiersCoverage = () => coverageOf("711", "tiers");

/** 運費顯示文字：級距制顯示「NT$60 起」；可加保的（黑貓）顯示「NT$150 起」 */
export function feeLabel(m: ShippingMethod): string {
  if (m.coverage.kind === "tiers") return `${ntd(m.coverage.tiers[0].fee)} 起`;
  return m.coverage.kind === "rate" ? `${ntd(m.fee)} 起` : ntd(m.fee);
}

/** 這件商品提供哪些寄送方式（沒開賣貨便的商品不顯示賣貨便） */
export function methodsFor(p: { myshipUrl?: string }): ShippingMethod[] {
  return shippingMethods.filter((m) => !m.requiresMyship || !!p.myshipUrl);
}

/** 這筆金額能不能用這個寄送方式；不能時回傳原因 */
export function availability(
  method: ShippingMethod,
  goodsTotal: number,
): { ok: true } | { ok: false; reason: string } {
  if (method.maxValue !== undefined && goodsTotal > method.maxValue) {
    return { ok: false, reason: method.maxValueReason ?? "超過金額上限" };
  }
  return { ok: true };
}

/** 這個方式最高能保障多少 */
export function maxCover(method: ShippingMethod): number {
  const c = method.coverage;
  if (c.kind === "fixed") return c.cap;
  if (c.kind === "tiers") return c.tiers[c.tiers.length - 1].upTo;
  return c.maxValue;
}

/** 交貨便：能涵蓋商品金額的最小級距（超過最高級距就用最高級距） */
export function tierFor(tiers: ValueTier[], goodsTotal: number): ValueTier {
  return tiers.find((t) => t.upTo >= goodsTotal) ?? tiers[tiers.length - 1];
}

/** 黑貓：依商品金額算保價費 */
export function rateFee(method: ShippingMethod, goodsTotal: number): number {
  const c = method.coverage;
  if (c.kind !== "rate") return 0;
  return Math.ceil(Math.min(goodsTotal, c.maxValue) * c.rate);
}

/** 黑貓：超過門檻必須加保 */
export function insuranceRequired(method: ShippingMethod, goodsTotal: number) {
  const c = method.coverage;
  return c.kind === "rate" && goodsTotal > c.requiredAbove;
}

export type QuoteOptions = {
  insure?: boolean; // 黑貓是否加保
  declared?: number; // 交貨便選的申報價值（級距上限）
};

export type Quote = {
  method: ShippingMethod;
  goodsTotal: number;
  shippingFee: number;
  insured: boolean;
  insuranceFee: number;
  declaredValue: number; // 交貨便申報價值／黑貓報值金額；賣貨便為 0
  coverCap: number; // 遺失時最多賠多少
  total: number;
};

/** 算出一筆訂單的完整金額與保障 */
export function quote(methodId: ShippingId, goodsTotal: number, opts: QuoteOptions = {}): Quote {
  const method = methodById(methodId);
  const c = method.coverage;
  let shippingFee = method.fee;
  let insured = false;
  let insuranceFee = 0;
  let declaredValue = 0;
  let coverCap = 0;

  if (c.kind === "fixed") {
    coverCap = Math.min(goodsTotal, c.cap);
  } else if (c.kind === "tiers") {
    const tier = (opts.declared && c.tiers.find((t) => t.upTo === opts.declared)) || tierFor(c.tiers, goodsTotal);
    shippingFee = tier.fee;
    declaredValue = tier.upTo;
    coverCap = Math.min(goodsTotal, tier.upTo);
  } else {
    insured = !!opts.insure || insuranceRequired(method, goodsTotal);
    insuranceFee = insured ? rateFee(method, goodsTotal) : 0;
    declaredValue = insured ? Math.min(goodsTotal, c.maxValue) : 0;
    coverCap = insured ? declaredValue : Math.min(goodsTotal, c.baseCap);
  }

  return {
    method,
    goodsTotal,
    shippingFee,
    insured,
    insuranceFee,
    declaredValue,
    coverCap,
    total: goodsTotal + shippingFee + insuranceFee,
  };
}

/** 預設寄送方式：優先選「能全額保障」的方式，其次第一個可用的 */
export function defaultMethod(methods: ShippingMethod[], goodsTotal: number): ShippingId {
  const usable = methods.filter((m) => availability(m, goodsTotal).ok);
  const covered = usable.find((m) => maxCover(m) >= goodsTotal);
  return (covered ?? usable[0] ?? methods[methods.length - 1]).id;
}

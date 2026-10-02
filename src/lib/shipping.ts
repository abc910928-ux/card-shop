import {
  insurance,
  shippingMethods,
  type ShippingId,
  type ShippingMethod,
} from "../config/shop";

export function methodById(id: ShippingId): ShippingMethod {
  return shippingMethods.find((m) => m.id === id)!;
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

/** 依商品金額算保價費 */
export function insuranceFee(goodsTotal: number): number {
  const declared = Math.min(goodsTotal, insurance.maxValue);
  return Math.ceil(declared * insurance.rate);
}

/** 是否強制加保（黑貓：超過 2 萬元必須報值） */
export function insuranceRequired(method: ShippingMethod, goodsTotal: number) {
  return method.insurable && goodsTotal > insurance.requiredAbove;
}

export type Quote = {
  method: ShippingMethod;
  goodsTotal: number;
  shippingFee: number;
  insured: boolean;
  insuranceFee: number;
  declaredValue: number;
  total: number;
};

/** 算出一筆訂單的完整金額 */
export function quote(
  methodId: ShippingId,
  goodsTotal: number,
  wantInsurance: boolean,
): Quote {
  const method = methodById(methodId);
  const insured =
    method.insurable &&
    (wantInsurance || insuranceRequired(method, goodsTotal));
  const fee = insured ? insuranceFee(goodsTotal) : 0;
  return {
    method,
    goodsTotal,
    shippingFee: method.fee,
    insured,
    insuranceFee: fee,
    declaredValue: insured ? Math.min(goodsTotal, insurance.maxValue) : 0,
    total: goodsTotal + method.fee + fee,
  };
}

/** 第一個可用的寄送方式（預設選 7-11，超過上限時換黑貓） */
export function defaultMethod(goodsTotal: number): ShippingId {
  const ok = shippingMethods.find((m) => availability(m, goodsTotal).ok);
  return (ok ?? shippingMethods[shippingMethods.length - 1]).id;
}

import type { ProductView } from "./types";

export function ntd(n: number): string {
  return `NT$${n.toLocaleString("en-US")}`;
}

/** 卡號那一行：「sv2a 寶可夢卡牌151 · 205/165」 */
export function subline(p: Pick<ProductView, "set" | "number">): string {
  return [p.set, p.number].filter(Boolean).join(" · ");
}

// 稀有度分級（只影響徽章顏色，沒列到的都算一般）
const TOP = ["SAR", "UR", "SEC", "QCSE", "SER", "PSER", "MUR", "HR", "SP", "BWR", "CSR", "UTR", "20SER"];
const MID = ["SR", "AR", "CHR", "RR", "RRR", "L", "SSR", "SA", "PR", "CR"];

export function rarityTier(rarity?: string): "top" | "mid" | "base" {
  if (!rarity) return "base";
  const r = rarity.toUpperCase();
  if (TOP.includes(r)) return "top";
  if (MID.includes(r)) return "mid";
  return "base";
}

export function discountPercent(p: Pick<ProductView, "price" | "originalPrice">) {
  if (!p.originalPrice || p.originalPrice <= p.price) return 0;
  return Math.round((1 - p.price / p.originalPrice) * 100);
}

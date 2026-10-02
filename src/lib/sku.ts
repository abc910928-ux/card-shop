// 庫存單位（SKU）：沒有規格的商品就是商品 id；有規格的是「商品id:規格id」
// 後端（supabase/functions/api）用同樣的規則，改這裡要一起改。
import type { PaymentId } from "../config/shop";

export const skuOf = (productId: string, variantId?: string | null) =>
  variantId ? `${productId}:${variantId}` : productId;

/** products.json 裡每件商品的格式（建置時輸出，後端與假後端共用） */
export type ProductJson = {
  id: string;
  name: string;
  price: number;
  stock: number;
  preorder: { eta: string; deadline?: string; limit?: number } | null;
  payments: PaymentId[];
  variants: { id: string; name: string; price: number; stock: number }[] | null;
};

export type SkuInfo = {
  sku: string;
  productId: string;
  variantId?: string;
  name: string; // 含規格名稱
  price: number;
  base: number;
  preorder: boolean;
};

export function skusOf(p: ProductJson): SkuInfo[] {
  if (!p.variants?.length)
    return [{ sku: p.id, productId: p.id, name: p.name, price: p.price, base: p.stock, preorder: !!p.preorder }];
  return p.variants.map((v) => ({
    sku: skuOf(p.id, v.id),
    productId: p.id,
    variantId: v.id,
    name: `${p.name}（${v.name}）`,
    price: v.price,
    base: v.stock,
    preorder: !!p.preorder,
  }));
}

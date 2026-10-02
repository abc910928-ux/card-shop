// 建置時輸出商品清單（/card-shop/products.json），給會員 API 驗證訂單的商品、規格、單價、限購、
// 寄送與付款方式用（後端以這份資料重新計算金額，不信任前端送來的價格與運費）
import type { APIRoute } from "astro";
import { getProductViews } from "../lib/catalog";
import { paymentMethods, shippingMethods } from "../config/shop";
import type { ProductJson } from "../lib/sku";

export const GET: APIRoute = async () => {
  const products: ProductJson[] = (await getProductViews()).map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    stock: p.stock,
    preorder: p.preorder ?? null,
    payments: p.payments,
    variants: p.variants?.map((v) => ({ id: v.id, name: v.name, price: v.price, stock: v.stock })) ?? null,
  }));
  return new Response(
    JSON.stringify({
      updatedAt: new Date().toISOString(),
      products,
      shipping: shippingMethods,
      payments: paymentMethods,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};

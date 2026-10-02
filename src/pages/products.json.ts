// 建置時輸出商品清單（/card-shop/products.json），給會員 API 驗證訂單的商品、單價與限購用
import type { APIRoute } from "astro";
import { getProductViews } from "../lib/catalog";

export const GET: APIRoute = async () => {
  const products = (await getProductViews()).map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    stock: p.stock,
    preorder: p.preorder ?? null,
  }));
  return new Response(JSON.stringify({ updatedAt: new Date().toISOString(), products }), {
    headers: { "Content-Type": "application/json" },
  });
};

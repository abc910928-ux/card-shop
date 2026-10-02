// 只在建置時（伺服器端）使用：讀商品、產生縮圖
import { getCollection, type CollectionEntry } from "astro:content";
import { getImage } from "astro:assets";
import type { ProductView } from "./types";
import { url } from "./url";

export type ProductEntry = CollectionEntry<"products">;

export async function getProducts(): Promise<ProductEntry[]> {
  const all = await getCollection("products", (e) => !e.data.hidden);
  // 預設排序：新上架在前
  return all.sort((a, b) => b.data.addedAt.getTime() - a.data.addedAt.getTime());
}

export async function toView(entry: ProductEntry): Promise<ProductView> {
  const d = entry.data;
  const first = d.images[0];
  const thumb = first
    ? (await getImage({ src: first, width: 480, format: "webp" })).src
    : undefined;
  return {
    id: entry.id,
    href: url(`/item/${entry.id}/`),
    name: d.name,
    category: d.category,
    game: d.game,
    set: d.set,
    number: d.number,
    rarity: d.rarity,
    language: d.language,
    condition: d.condition,
    grade: d.grade,
    ...priceAndStock(d),
    payments: d.payments,
    preorder: d.preorder,
    myshipUrl: d.myshipUrl || undefined,
    addedAt: d.addedAt.toISOString().slice(0, 10),
    featured: d.featured,
    thumb,
  };
}

// 有規格時：列表顯示最低價（priceMax 用來顯示「起」），數量為各規格合計
function priceAndStock(d: ProductEntry["data"]) {
  if (!d.variants?.length) return { price: d.price, priceMax: d.price, originalPrice: d.originalPrice, stock: d.stock };
  const variants = d.variants.map((v) => ({
    id: v.id,
    name: v.name,
    price: v.price ?? d.price,
    originalPrice: v.originalPrice ?? (v.price === undefined ? d.originalPrice : undefined),
    stock: v.stock,
  }));
  const prices = variants.map((v) => v.price);
  const cheapest = variants.find((v) => v.price === Math.min(...prices))!;
  return {
    price: cheapest.price,
    priceMax: Math.max(...prices),
    originalPrice: cheapest.originalPrice,
    stock: variants.reduce((s, v) => s + v.stock, 0),
    variants,
  };
}

export async function getProductViews(): Promise<ProductView[]> {
  return Promise.all((await getProducts()).map(toView));
}

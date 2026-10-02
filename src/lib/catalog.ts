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
    price: d.price,
    originalPrice: d.originalPrice,
    stock: d.stock,
    myshipUrl: d.myshipUrl || undefined,
    addedAt: d.addedAt.toISOString().slice(0, 10),
    featured: d.featured,
    thumb,
  };
}

export async function getProductViews(): Promise<ProductView[]> {
  return Promise.all((await getProducts()).map(toView));
}

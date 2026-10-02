import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

// 商品：src/content/products/ 底下一件商品一個 .md 檔
// 檔名就是商品網址，例如 mew-ex-sar.md → /item/mew-ex-sar/
const products = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/products" }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      category: z.enum(["單卡", "原盒・擴充包", "鑑定卡", "周邊"]),
      game: z.string(),
      set: z.string().optional(),
      number: z.string().optional(),
      rarity: z.string().optional(),
      language: z.string().optional(),
      condition: z.enum(["全新", "近全新", "輕微瑕疵", "明顯瑕疵"]).optional(),
      grade: z.object({ company: z.string(), score: z.string() }).optional(),
      price: z.number().int().positive(),
      originalPrice: z.number().int().positive().optional(),
      stock: z.number().int().min(0),
      images: z.array(image()).default([]),
      myshipUrl: z.string().optional(),
      addedAt: z.coerce.date(),
      featured: z.boolean().default(false),
    }),
});

export const collections = { products };

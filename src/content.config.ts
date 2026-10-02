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
      stock: z.number().int().min(0), // 現貨：庫存；預購：剩餘可預購數量
      // 有填就是預購商品（必須登入才能預購）
      preorder: z
        .object({
          eta: z.string(), // 預計到貨，例："2026 年 11 月中"
          deadline: z.string().optional(), // 預購截止，例："10/31"
          limit: z.number().int().positive().optional(), // 每人限購
        })
        .optional(),
      images: z.array(image()).default([]),
      myshipUrl: z.string().optional(),
      addedAt: z.coerce.date(),
      featured: z.boolean().default(false),
      hidden: z.boolean().default(false), // true = 不上架（範本、暫時下架）
    }),
});

export const collections = { products };

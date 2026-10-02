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
      category: z.enum(["單卡&卡冊", "原盒・擴充包", "鑑定卡", "周邊"]),
      game: z.string(),
      set: z.string().optional(),
      number: z.string().optional(),
      rarity: z.string().optional(),
      language: z.string().optional(),
      grade: z.object({ company: z.string(), score: z.string() }).optional(),
      price: z.number().int().positive(),
      originalPrice: z.number().int().positive().optional(),
      stock: z.number().int().min(0).default(0), // 現貨：進貨總數；預購：可預購總數（有規格時改填在各規格）
      // 規格（選填）：同一商品不同版本，各自的價格與數量。沒填價格就用上面的 price
      // 例：- { id: jp, name: 日文版, stock: 3 }
      //     - { id: en, name: 英文版, price: 2800, stock: 1 }
      variants: z
        .array(
          z.object({
            id: z.string().regex(/^[a-z0-9-]+$/i, "規格 id 只能用英數字與 -"),
            name: z.string(),
            price: z.number().int().positive().optional(),
            originalPrice: z.number().int().positive().optional(),
            stock: z.number().int().min(0),
          }),
        )
        .optional(),
      // 這件商品接受的付款方式（結帳時取所有商品的交集）
      payments: z.array(z.enum(["transfer", "cod"])).min(1).default(["transfer", "cod"]),
      // 有填就是預購商品（必須登入才能預購）
      preorder: z
        .object({
          eta: z.string().optional(), // 預計到貨，例："2026 年 11 月中"；還不確定就不填
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

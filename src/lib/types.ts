// 給互動元件（Preact）用的商品資料：只含可序列化的欄位，不依賴 astro:content
import type { PaymentId } from "../config/shop";

export type Category = "單卡&卡冊" | "原盒・擴充包" | "周邊";
export const categories: Category[] = ["單卡&卡冊", "原盒・擴充包", "周邊"];

export type Variant = { id: string; name: string; price: number; originalPrice?: number; stock: number };

export type ProductView = {
  id: string;
  href: string;
  name: string;
  category: Category;
  game: string;
  set?: string;
  number?: string;
  rarity?: string;
  language?: string;
  price: number; // 有規格時為最低價
  priceMax: number; // 有規格且價格不同時 > price
  originalPrice?: number;
  unit?: string; // 計價單位
  stock: number; // 有規格時為各規格合計
  variants?: Variant[];
  payments: PaymentId[];
  preorder?: { eta?: string; deadline?: string; limit?: number };
  myshipUrl?: string;
  addedAt: string; // YYYY-MM-DD
  featured: boolean;
  thumb?: string; // 已最佳化的縮圖網址；沒有照片時為 undefined
};

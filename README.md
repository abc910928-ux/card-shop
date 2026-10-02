# 卡牌小舖

個人卡牌商店網站，可以賣單卡、原盒、鑑定卡和周邊。用 [Astro](https://astro.build) 建置成純靜態網站，免費部署在 GitHub Pages。

- **7-11 店到店**：點商品頁按鈕，前往該商品的賣貨便頁面下單
- **黑貓宅配**：可以選擇加保，保價費依商品金額計算。按鈕會複製訂單內容並開啟 LINE，買家貼上後由你確認

## 本機預覽

```bash
npm install
npm run dev
```

打開 http://localhost:4321/card-shop/

## 新增商品

到 `src/content/products/` 複製一個 `.md` 檔，改內容即可。**檔名就是網址**（例如 `pikachu-ar.md` 對應 `/item/pikachu-ar/`），請用英文、數字和連字號。

```yaml
---
name: 夢幻ex
category: 單卡            # 單卡 / 原盒・擴充包 / 鑑定卡 / 周邊
game: 寶可夢              # 自由填，篩選按鈕會自動產生
set: sv2a 寶可夢卡牌151
number: 205/165
rarity: SAR
language: 繁中
condition: 近全新         # 全新 / 近全新 / 輕微瑕疵 / 明顯瑕疵
grade: { company: PSA, score: "10" }   # 只有鑑定卡要填
price: 7800
originalPrice: 8500     # 選填，有填會顯示劃線價和折扣
stock: 1                # 0 = 已售完
images: ["../../assets/products/mew-front.jpg"]
myshipUrl: https://myship.7-11.com.tw/...   # 沒填的話，7-11 也會改成 LINE 下單
addedAt: 2026-10-02
featured: true          # 首頁精選
---
商品說明寫在這裡（卡況細節等）。
```

**商品照片**放在 `src/assets/products/`，直接放手機拍的 JPG 就好。建置時會自動壓縮、轉成 WebP 並產生縮圖。沒有照片的商品會顯示自動產生的示意圖。

## 改店名、運費、加保費率

全部集中在 `src/config/shop.ts`：

- 店名、公告條、LINE 聯絡方式
- 7-11 店到店與黑貓宅配的運費、金額上限
- 加保規則：費率 `rate`（預設 1%）、必須報值的門檻（2 萬）、報值上限（5 萬）

運費資料查詢日期是 2026-10-02，物流商調價時改這個檔案就好，全站會一起更新。

## 部署到 GitHub Pages

1. 在 GitHub 建立名為 `card-shop` 的 repo，把這個資料夾推上去
2. 到 repo 的 Settings → Pages，把 Source 設成 **GitHub Actions**
3. 之後每次推到 `main`，`.github/workflows/deploy.yml` 都會自動建置並更新網站

網址：https://abc910928-ux.github.io/card-shop/
如果 repo 名稱或網域不同，要改 `astro.config.mjs` 裡的 `site` 和 `base`。

## 專案結構

```
src/
  config/shop.ts          店家設定、運費、加保規則
  content/products/*.md   商品（一件一個檔）
  assets/products/        商品照片
  lib/shipping.ts         運費和保價費計算
  components/
    ShopBrowser.tsx       列表頁的篩選、搜尋、排序（互動元件）
    OrderPanel.tsx        商品頁的寄送方式、加保、下單（互動元件）
    ProductCard.tsx       商品卡片
  pages/                  首頁、/shop/、/item/[id]/、/guide/
```

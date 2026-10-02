# TCG代購

個人卡牌商店網站，可以賣單卡、原盒、鑑定卡和周邊。用 [Astro](https://astro.build) 建置成純靜態網站，免費部署在 GitHub Pages。

- **7-11 賣貨便**：商品有填 `myshipUrl` 才會出現這個選項，點按鈕前往該商品的賣貨便頁面下單
- **7-11 交貨便**：買家可選申報價值，運費 60–100 元，遺失最多賠到申報價值
- **黑貓宅配**：可以選擇加保，保價費依商品金額計算
- 交貨便與黑貓的訂單：按鈕會開啟 LINE 官方帳號並自動填好訂單內容，買家按送出後由你確認
- **會員（LINE 登入）**：保存收件資料、訂單紀錄、收藏（補貨／降價提示）；**預購商品必須登入**，現貨不用。設定方式見下方「會員功能」

## 本機預覽

```bash
npm install
npm run dev
```

打開 http://localhost:4321/card-shop/

## 新增商品

到 `src/content/products/` 複製一個 `.md` 檔，改內容即可。資料夾裡的範例商品都設了 `hidden: true`（不上架），複製後記得**刪掉 `hidden: true` 這行**，商品才會出現；之後要暫時下架某件商品，也可以加回這行。**檔名就是網址**（例如 `pikachu-ar.md` 對應 `/item/pikachu-ar/`），請用英文、數字和連字號。

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
myshipUrl: https://myship.7-11.com.tw/...   # 選填，沒填就不提供賣貨便選項
addedAt: 2026-10-02
featured: true          # 首頁精選
---
商品說明寫在這裡（卡況細節等）。
```

**預購商品**：多加一段 `preorder`，`stock` 改成可預購的名額。預購商品會顯示「預購」標籤，買家要登入 LINE、同意預購條款才能登記：

```yaml
stock: 20               # 剩餘可預購名額
preorder:
  eta: 2026 年 11 月中    # 預計到貨
  deadline: 10/31       # 選填：預購截止
  limit: 2              # 選填：每人限購
```

**商品照片**放在 `src/assets/products/`，直接放手機拍的 JPG 就好。建置時會自動壓縮、轉成 WebP 並產生縮圖。沒有照片的商品會顯示自動產生的示意圖。

## 改店名、運費、加保費率

全部集中在 `src/config/shop.ts`：

- 店名、公告條、LINE 聯絡方式
- `shippingMethods`：三種寄送方式的運費、金額上限、保障方式
  - 賣貨便：固定運費，遺失依訂單金額理賠到 2 萬
  - 交貨便：`tiers` 申報價值級距表（價值上限 → 運費）
  - 黑貓：加保費率 `rate`（預設 1%）、必須報值的門檻（2 萬）、報值上限（5 萬）

運費資料查詢日期是 2026-10-02，物流商調價時改這個檔案就好，全站會一起更新。

## 標誌與圖示

正式標誌是向量檔 `public/logo.svg`，其他圖檔都從它匯出：

- `brand/tcg-logo.svg`：向量原檔副本（印刷、放大都不會糊）
- `brand/tcg-logo-1024.png`：1024px，圓形外透明，一般用途
- `brand/tcg-logo-line-640.png`：640px 白底，LINE 官方帳號大頭貼用
- `public/favicon-32.png`、`public/apple-touch-icon.png`：瀏覽器分頁與手機主畫面圖示

## LINE 官方帳號

網站上的「LINE 詢問」、下單、詢價按鈕都連到 `src/config/shop.ts` 裡的 `lineUrl`（目前是官方帳號 @195azlpr）。換帳號時改 `lineId`、`lineUrl`，再執行這行重新產生頁尾的 QR Code（ID 開頭的 @ 要寫成 %40）：

```bash
node scripts/make-line-qr.mjs https://line.me/R/ti/p/%40你的ID
```

## 會員功能（LINE 登入＋會員資料庫）

```
網站（GitHub Pages）── LINE 登入（LIFF）取得 token
   └─ 會員 API（Supabase Edge Function：supabase/functions/api）
        ├─ 每次請求向 LINE 驗證 token
        └─ 讀寫 Supabase 資料庫（supabase/migrations；前端無法直接存取）
```

全部用免費方案：Supabase（每月 50 萬次 API、500MB 資料庫）、LINE Login。

### 啟用步驟
1. **LINE Developers**（https://developers.line.biz/console/ ，用你的 LINE 登入）
   1. 建立 Provider「TCG代購」
   2. 建立 **LINE Login** 頻道（App type 勾 Web app）
   3. 頻道裡的 **LIFF** 分頁新增一個 LIFF app：Size 選 Full、Endpoint URL 填 `https://abc910928-ux.github.io/card-shop/`、Scopes 勾 `openid` 和 `profile`
   4. 把頻道狀態從 Developing 改成 **Published**（沒發佈的話只有你自己能登入）
   5. 記下 **Channel ID** 和 **LIFF ID**
2. **Supabase**（https://supabase.com ）：建立專案，記下專案網址 `https://<專案代號>.supabase.co`，並在終端機執行 `npx supabase login`
3. 部署資料庫與 API（在這個資料夾執行）：
   ```bash
   npx supabase link --project-ref <專案代號>
   npx supabase db push
   npx supabase secrets set LINE_LOGIN_CHANNEL_ID=<Channel ID> SITE_URL=https://abc910928-ux.github.io/card-shop ADMIN_LINE_USER_IDS=<你的會員 ID>
   npx supabase functions deploy api
   ```
   「你的會員 ID」在網站登入後的「我的帳號」最下方可以看到（U 開頭的一串）。
4. 把 LIFF ID 和 `https://<專案代號>.supabase.co/functions/v1/api` 填進 `.github/workflows/deploy.yml` 的 `PUBLIC_LIFF_ID`、`PUBLIC_API_BASE`，API 網址也填進 `keepalive.yml` 的 `API_BASE`，推上去就生效

### 管理後台
用管理員的 LINE 登入後，頁首選單會出現「管理後台」（`/admin/`）：
- **訂單**：依狀態篩選、改狀態、寫備註（買家在「我的訂單」看得到備註）。預購到貨時改成「已到貨・待付款」，系統會記下日期並在 3 天後標示「逾期未付款」
- **會員**：每位會員的訂單數與棄單數；可勾「停止受理預購」（預購服務條款第七條）

### 本機測試（不用真的登入 LINE）
在專案資料夾建立 `.env.development.local`，內容寫 `PUBLIC_AUTH_MOCK=1`，重新執行 `npm run dev`，就會用假帳號與假資料（存在瀏覽器裡）測試所有會員畫面。測完刪掉這個檔案。

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
  lib/auth.ts             LINE 登入（LIFF）
  lib/api.ts              會員 API 呼叫（mock-api.ts 是本機測試用假後端）
  components/
    ShopBrowser.tsx       列表頁的篩選、搜尋、排序（互動元件）
    OrderPanel.tsx        現貨商品的寄送方式、加保、下單
    PreorderPanel.tsx     預購商品的登記（需登入）
    AccountApp.tsx        我的帳號：收件資料、訂單、收藏
    AdminApp.tsx          管理後台
    ProductCard.tsx       商品卡片
  pages/                  首頁、/shop/、/item/[id]/、/guide/、/proxy/（海外代購詢價）、
                          /account/、/admin/、/terms/（條款與隱私權政策）、products.json
supabase/
  migrations/             資料庫結構
  functions/api/          會員 API
```

// ─────────────────────────────────────────────────────────────
// 商店設定：店名、聯絡方式、運費、加保規則都在這裡改。
// 運費資料查詢日期：2026-10-02（官方調價時更新這裡即可，全站同步）
// ─────────────────────────────────────────────────────────────

export const shop = {
  name: "TCG代購", // 店名
  tagline: "TCG Singles · Sealed · Supplies",
  description: "TCG代購：單卡、卡冊、原盒與周邊。7-11 賣貨便、交貨便或黑貓宅配，可選保價。",

  // 頂部公告條
  announcements: [
    "7-11 賣貨便 38 元・交貨便 60 元起・黑貓宅配 150 元起",
    "交貨便可選申報價值，黑貓宅配可加保，高價卡寄送更安心",
  ],

  // 聯絡方式（宅配訂單透過 LINE 確認）
  // LINE 官方帳號（改 ID 後執行 node scripts/make-line-qr.mjs <加好友網址> 重新產生 QR Code）
  lineId: "@195azlpr",
  lineUrl: "https://line.me/R/ti/p/%40195azlpr", // @ 依 LINE 規定要編碼成 %40
  lineQr: "line-qr.png", // 放在 public/

  // 店家資訊（消保法第 18 條：經營者名稱、聯絡方式），顯示在頁尾與各條款
  owner: {
    name: "莊子洋",
    phone: "0910-109-489",
    email: "abc24679220@gmail.com",
    city: "桃園市",
  },

  // 會員功能（LINE 登入＋會員資料庫）。兩個都是公開值，沒設定時登入功能自動隱藏
  liffId: import.meta.env.PUBLIC_LIFF_ID ?? "",
  apiBase: import.meta.env.PUBLIC_API_BASE ?? "", // Supabase Edge Function 網址，例：https://xxxx.supabase.co/functions/v1/api

  // 你的 7-11 賣貨便賣場首頁（選填，填了頁首會出現連結）
  myshipStoreUrl: "",

  // 出貨時間
  leadTime: "付款確認後 1–2 個工作天內出貨",

  // 匯款帳號：訂單確認後顯示在買家的訂單頁。沒填時會請買家用 LINE 詢問
  bank: {
    name: "國泰世華", // 銀行名稱
    code: "013", // 銀行代碼
    account: "110700016854", // 帳號
    holder: "", // 戶名（可只寫姓氏＋○○）
  },
  payDays: 3, // 訂單確認後幾天內要匯款
};

// ─── 付款方式 ────────────────────────────────────────────────
// 每件商品可在商品檔用 payments 限制（預設兩種都收），結帳時取所有商品的交集。
export type PaymentId = "transfer" | "cod";
export type PaymentMethod = {
  id: PaymentId;
  label: string;
  note: string;
  fee: number; // 額外手續費（加進訂單合計）
  shipping: ShippingId[]; // 可搭配的寄送方式
  maxAmount?: number; // 訂單合計超過就不能選
};

export const paymentMethods: PaymentMethod[] = [
  {
    id: "transfer",
    label: "銀行轉帳",
    note: `訂單確認後 ${shop.payDays} 天內轉帳，確認入帳後出貨`,
    fee: 0,
    shipping: ["711", "tcat"],
  },
  {
    id: "cod",
    label: "取貨付款",
    note: "到 7-11 門市取貨時付現，不用先轉帳",
    fee: 0, // 7-11 交貨便取貨付款不收代收手續費
    // 黑貓「貨到付款」要是黑貓契約客戶，且依金額收 30–130 元手續費，所以先不開放
    shipping: ["711"],
    maxAmount: 20000, // 超商代收上限
  },
];

// ─── 寄送方式 ────────────────────────────────────────────────
// 三種保障方式：
//   fixed：運費固定，遺失依商品金額理賠到 cap 為止（賣貨便）
//   tiers：買家選申報價值，運費跟著級距跳，遺失最多賠到申報價值（7-11 交貨便）
//   rate ：可加保，保價費 = 商品金額 × rate（黑貓報值）
export type ShippingId = "myship" | "711" | "tcat";

export type ValueTier = { upTo: number; fee: number };

export type Coverage =
  | { kind: "fixed"; cap: number }
  | { kind: "tiers"; tiers: ValueTier[] }
  | {
      kind: "rate";
      baseCap: number; // 沒加保時的理賠上限
      rate: number;
      requiredAbove: number; // 超過這個金額必須加保
      maxValue: number; // 最高可保金額
    };

export type ShippingMethod = {
  id: ShippingId;
  label: string;
  short: string;
  fee: number; // 基本運費（tiers 類型以級距為準）
  feeNote: string;
  payment: string;
  requiresMyship?: boolean; // 商品有填 myshipUrl 才會出現
  maxValue?: number; // 商品金額超過就不能選；undefined = 不限
  maxValueReason?: string;
  coverage: Coverage;
};

export const shippingMethods: ShippingMethod[] = [
  {
    id: "myship",
    label: "7-11 賣貨便（店到店）",
    short: "7-11 賣貨便",
    fee: 38,
    feeNote: "常溫優惠價（原價 60 元）",
    payment: "取貨付款或賣貨便線上付款",
    requiresMyship: true,
    maxValue: 20000,
    maxValueReason: "賣貨便取貨付款與遺失理賠上限都是 2 萬元",
    coverage: { kind: "fixed", cap: 20000 },
  },
  {
    id: "711",
    label: "7-11 交貨便（常溫店到店）",
    short: "7-11 交貨便",
    fee: 60,
    feeNote: "依申報價值 60–100 元",
    payment: "銀行轉帳或取貨付款",
    // 一般交貨便本島運費（申報價值級距 → 運費）；遺失最多賠到申報價值
    coverage: {
      kind: "tiers",
      tiers: [
        { upTo: 1000, fee: 60 },
        { upTo: 2000, fee: 70 },
        { upTo: 3000, fee: 80 },
        { upTo: 4000, fee: 90 },
        { upTo: 5000, fee: 100 },
      ],
    },
  },
  {
    id: "tcat",
    label: "黑貓宅急便（宅配到府）",
    short: "黑貓宅配",
    fee: 150,
    feeNote: "常溫 60 公分以下（卡牌包裹都在這級距）",
    payment: "銀行轉帳",
    maxValue: 50000,
    maxValueReason: "黑貓報值上限為 5 萬元",
    // ※ 報值費率請以寄件營業所報價為準，若不同改 rate 即可
    coverage: { kind: "rate", baseCap: 20000, rate: 0.01, requiredAbove: 20000, maxValue: 50000 },
  },
];

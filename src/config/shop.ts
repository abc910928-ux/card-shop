// ─────────────────────────────────────────────────────────────
// 商店設定：店名、聯絡方式、運費、加保規則都在這裡改。
// 運費資料查詢日期：2026-10-02（官方調價時更新這裡即可，全站同步）
// ─────────────────────────────────────────────────────────────

export const shop = {
  name: "TCG代購", // 店名
  tagline: "TCG Singles · Sealed · Graded",
  description: "TCG代購：單卡、原盒、鑑定卡與周邊。7-11 賣貨便、交貨便或黑貓宅配，可選保價。",

  // 頂部公告條
  announcements: [
    "7-11 賣貨便 38 元・交貨便 60 元起・黑貓宅配 130 元",
    "交貨便可選申報價值，黑貓宅配可加保，高價卡寄送更安心",
  ],

  // 聯絡方式（宅配訂單透過 LINE 確認）
  // LINE 官方帳號（改 ID 後執行 node scripts/make-line-qr.mjs <加好友網址> 重新產生 QR Code）
  lineId: "@195azlpr",
  lineUrl: "https://line.me/R/ti/p/@195azlpr",
  lineQr: "line-qr.png", // 放在 public/

  // 你的 7-11 賣貨便賣場首頁（選填，填了頁首會出現連結）
  myshipStoreUrl: "",

  // 出貨時間
  leadTime: "付款確認後 1–2 個工作天內出貨",
};

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
  orderVia: "myship" | "line"; // 下單管道
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
    orderVia: "myship",
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
    payment: "LINE 確認訂單後轉帳",
    orderVia: "line",
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
    fee: 130,
    feeNote: "常溫 60 公分以下（卡牌包裹都在這級距）",
    payment: "LINE 確認訂單後轉帳",
    orderVia: "line",
    maxValue: 50000,
    maxValueReason: "黑貓報值上限為 5 萬元",
    // ※ 報值費率請以寄件營業所報價為準，若不同改 rate 即可
    coverage: { kind: "rate", baseCap: 20000, rate: 0.01, requiredAbove: 20000, maxValue: 50000 },
  },
];

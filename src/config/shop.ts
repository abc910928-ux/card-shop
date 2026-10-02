// ─────────────────────────────────────────────────────────────
// 商店設定：店名、聯絡方式、運費、加保規則都在這裡改。
// 運費資料查詢日期：2026-10-02（官方調價時更新這裡即可，全站同步）
// ─────────────────────────────────────────────────────────────

export const shop = {
  name: "卡牌小舖", // 店名（暫定）
  tagline: "TCG Singles · Sealed · Graded",
  description: "個人卡牌小店：單卡、原盒、鑑定卡與周邊。7-11 店到店或黑貓宅配，可加保。",

  // 頂部公告條
  announcements: [
    "7-11 店到店 38 元・黑貓宅配 130 元",
    "高價卡可選黑貓宅配加保，保價費依商品金額計算",
  ],

  // 聯絡方式（宅配訂單透過 LINE 確認）
  lineId: "Joe910928",
  lineUrl: "https://line.me/ti/p/P2YiI6WBGh",
  lineQr: "line-qr.png", // 放在 public/

  // 你的 7-11 賣貨便賣場首頁（選填，填了頁首會出現連結）
  myshipStoreUrl: "",

  // 出貨時間
  leadTime: "付款確認後 1–2 個工作天內出貨",
};

// ─── 寄送方式 ────────────────────────────────────────────────
export type ShippingId = "711" | "tcat";

export type ShippingMethod = {
  id: ShippingId;
  label: string;
  short: string;
  fee: number; // 運費（元）
  feeNote: string;
  payment: string; // 付款方式
  orderVia: "myship" | "line"; // 下單管道
  // 商品金額上限（超過就不能選這個方式）；undefined = 不限
  maxValue?: number;
  maxValueReason?: string;
  // 未加保時的遺失理賠上限
  liabilityCap: number;
  insurable: boolean;
};

export const shippingMethods: ShippingMethod[] = [
  {
    id: "711",
    label: "7-11 店到店（賣貨便）",
    short: "7-11 店到店",
    fee: 38,
    feeNote: "賣貨便常溫優惠價（原價 60 元）",
    payment: "賣貨便取貨付款或線上付款",
    orderVia: "myship",
    maxValue: 20000,
    maxValueReason: "賣貨便取貨付款與遺失理賠上限都是 2 萬元",
    liabilityCap: 20000,
    insurable: false,
  },
  {
    id: "tcat",
    label: "黑貓宅急便（宅配到府）",
    short: "黑貓宅配",
    fee: 130,
    feeNote: "常溫 60 公分以下（卡牌包裹都在這級距）",
    payment: "LINE 確認訂單後銀行轉帳",
    orderVia: "line",
    maxValue: 50000,
    maxValueReason: "黑貓報值上限為 5 萬元",
    liabilityCap: 20000,
    insurable: true,
  },
];

// ─── 加保（黑貓報值宅急便）──────────────────────────────────
// 保價費 = 報值金額 × rate（無條件進位），報值金額 = 商品總額（最高 maxValue）
// 商品超過 requiredAbove 時，黑貓規定必須報值，會自動勾選且不能取消。
// ※ 報值費率請以寄件營業所報價為準，若不同改 rate 即可。
export const insurance = {
  rate: 0.01,
  requiredAbove: 20000,
  maxValue: 50000,
};

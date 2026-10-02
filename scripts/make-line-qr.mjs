// 依 src/config/shop.ts 的 LINE 官方帳號網址產生加好友 QR Code（public/line-qr.png）
// 用法：node scripts/make-line-qr.mjs https://line.me/R/ti/p/@xxxxxxx
import QRCode from "qrcode";

const url = process.argv[2];
if (!url) {
  console.error("請提供加好友網址，例如：node scripts/make-line-qr.mjs https://line.me/R/ti/p/@xxxxxxx");
  process.exit(1);
}
await QRCode.toFile("public/line-qr.png", url, {
  width: 480,
  margin: 2,
  errorCorrectionLevel: "M",
  color: { dark: "#000000", light: "#ffffff" },
});
console.log(`已產生 public/line-qr.png → ${url}`);

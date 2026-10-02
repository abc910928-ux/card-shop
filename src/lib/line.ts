import { shop } from "../config/shop";

/** 打開官方帳號聊天室並預先填好訊息（LINE URL scheme：oaMessage） */
export function oaMessageUrl(text: string): string {
  return `https://line.me/R/oaMessage/${encodeURIComponent(shop.lineId)}/?${encodeURIComponent(text)}`;
}

/**
 * 送出訂單／詢價文字：先複製到剪貼簿（電腦沒裝 LINE 時的備案），
 * 再打開官方帳號聊天室並預填訊息，買家按送出即可。回傳是否複製成功。
 */
export async function copyAndOpenLine(text: string): Promise<boolean> {
  let ok = true;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    ok = false;
  }
  window.open(oaMessageUrl(text), "_blank", "noopener");
  return ok;
}

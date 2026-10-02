import { shop } from "../config/shop";

/** 把訊息複製到剪貼簿並開啟店家 LINE；回傳是否複製成功（失敗時讓使用者手動複製） */
export async function copyAndOpenLine(text: string): Promise<boolean> {
  let ok = true;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    ok = false;
  }
  window.open(shop.lineUrl, "_blank", "noopener");
  return ok;
}

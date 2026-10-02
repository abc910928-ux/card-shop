import { useMemo, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { shop } from "../config/shop";
import { copyAndOpenLine } from "../lib/line";

const KINDS = ["鑑定卡", "未鑑定單卡", "原盒・卡包", "其他"] as const;

// 海外代購詢價單：填好後複製成文字並開啟 LINE
export default function ProxyRequestForm({ termsHref }: { termsHref: string }) {
  const [link, setLink] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("鑑定卡");
  const [spec, setSpec] = useState("");
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");

  // 任何 http(s) 網址都可以，只檢查格式完整
  const linkOk = /^https?:\/\/[^\s/]+\.[^\s/]+(\/\S*)?$/i.test(link.trim());
  const canSend = linkOk && agreed;

  const text = useMemo(() => {
    const lines = [`【${shop.name} 海外代購詢價】`, `商品網址：${link.trim()}`];
    if (name.trim()) lines.push(`商品：${name.trim()}`);
    lines.push(`類型：${kind}${spec.trim() ? `（${spec.trim()}）` : ""}`, `數量：${qty}`);
    if (price.trim()) lines.push(`網站標價：${price.trim()}`);
    if (note.trim()) lines.push(`備註：${note.trim()}`);
    // 留下「事先告知並同意」的紀錄
    lines.push("", "我已閱讀並同意代購服務條款，了解代購商品不適用七日鑑賞期。");
    return lines.join("\n");
  }, [link, name, kind, spec, qty, price, note]);

  async function send() {
    setCopied((await copyAndOpenLine(text)) ? "ok" : "fail");
  }

  const input =
    "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-ink";

  return (
    <div class="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 class="text-lg font-bold">代購詢價單</h2>
      <p class="mt-1 text-xs text-muted">填好後會複製成文字並開啟 LINE，貼上送出即可，我們會回覆報價。</p>

      <div class="mt-5 space-y-4">
        <Field label="商品網址" required>
          <input
            type="url"
            value={link}
            onInput={(e) => setLink((e.target as HTMLInputElement).value)}
            placeholder="貼上海外網站的商品網址 https://..."
            class={input}
          />
          {link && !linkOk && (
            <span class="mt-1 block text-xs text-sale">請貼上完整的商品網址（https:// 開頭）</span>
          )}
        </Field>

        <Field label="商品名稱或卡號">
          <input
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            placeholder="例：ピカチュウ 205/165 SAR"
            class={input}
          />
        </Field>

        <Field label="類型" as="div">
          <div class="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button
                type="button"
                onClick={() => setKind(k)}
                class={
                  "rounded-full px-3 py-1.5 text-sm transition " +
                  (kind === k ? "bg-ink text-white" : "border border-line text-ink-soft hover:border-ink")
                }
              >
                {k}
              </button>
            ))}
          </div>
          <input
            value={spec}
            onInput={(e) => setSpec((e.target as HTMLInputElement).value)}
            placeholder={kind === "鑑定卡" ? "鑑定公司與分數，例：PSA 10" : "卡況或版本要求，例：A 級、日版"}
            class={`${input} mt-2`}
          />
        </Field>

        <div class="grid grid-cols-2 gap-3">
          <Field label="數量">
            <input
              type="number"
              min={1}
              value={qty}
              onInput={(e) => setQty(Math.max(1, Number((e.target as HTMLInputElement).value) || 1))}
              class={input}
            />
          </Field>
          <Field label="網站標價（選填）">
            <input
              value={price}
              onInput={(e) => setPrice((e.target as HTMLInputElement).value)}
              placeholder="例：¥12,800"
              class={input}
            />
          </Field>
        </div>

        <Field label="備註">
          <textarea
            rows={2}
            value={note}
            onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
            placeholder="其他要求，例如可接受的最高價格"
            class={input}
          />
        </Field>

        <label class="flex cursor-pointer gap-2.5 rounded-xl bg-bg p-3 text-sm">
          <input
            type="checkbox"
            checked={agreed}
            onChange={() => setAgreed(!agreed)}
            class="mt-0.5 h-4 w-4 shrink-0 accent-ink"
          />
          <span>
            我已閱讀並同意
            <a href={termsHref} target="_blank" class="mx-0.5 underline">
              代購服務條款
            </a>
            ，了解<b>代購商品不適用七日鑑賞期</b>（瑕疵、與說明不符除外）。
          </span>
        </label>

        <button
          onClick={send}
          disabled={!canSend}
          class="w-full rounded-xl bg-accent py-3.5 font-bold text-accent-ink transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          複製詢價單並用 LINE 詢價
        </button>
        <p class="text-center text-xs text-muted">
          {copied === "ok"
            ? "已複製詢價單，請在 LINE 對話中貼上送出"
            : copied === "fail"
              ? "無法自動複製，請手動複製下方內容"
              : !linkOk
                ? "請先貼上商品網址"
                : !agreed
                  ? "請先勾選同意代購服務條款"
                  : `會開啟 LINE（ID：${shop.lineId}）`}
        </p>
        {copied && (
          <textarea
            readOnly
            rows={9}
            value={text}
            class="w-full rounded-lg border border-line bg-bg p-3 text-xs"
            onFocus={(e) => (e.target as HTMLTextAreaElement).select()}
          />
        )}
      </div>
    </div>
  );
}

// 單一輸入框用 label 包起來；含多個按鈕的欄位用 div，避免點標題時觸發第一個按鈕
function Field({
  label,
  required,
  as: Tag = "label",
  children,
}: {
  label: string;
  required?: boolean;
  as?: "label" | "div";
  children: ComponentChildren;
}) {
  return (
    <Tag class="block">
      <span class="mb-1.5 block text-sm font-medium">
        {label}
        {required && <span class="ml-0.5 text-sale">*</span>}
      </span>
      {children}
    </Tag>
  );
}

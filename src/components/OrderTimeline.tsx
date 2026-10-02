import { CANCELLED, timelineOf, type Order } from "../lib/orders";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

// 訂單進度時間軸：已完成的步驟打勾並附時間，目前步驟高亮，之後的步驟灰色
export default function OrderTimeline({ o, compact = false }: { o: Order; compact?: boolean }) {
  const steps = timelineOf(o);
  const cancelled = CANCELLED.includes(o.status);

  if (compact) {
    // 橫向小進度條（訂單列表用）
    return (
      <ol class="flex items-start">
        {steps.map((s, i) => {
          const bad = cancelled && i === steps.length - 1;
          const dot = bad ? "bg-sale" : s.state === "todo" ? "bg-line" : "bg-ok";
          return (
            <li class="relative flex min-w-0 flex-1 flex-col items-center text-center">
              {i > 0 && (
                <span class={`absolute right-1/2 top-[5px] h-0.5 w-full ${s.state === "todo" ? "bg-line" : bad ? "bg-sale/40" : "bg-ok"}`} />
              )}
              <span class={`relative z-10 h-3 w-3 rounded-full ${dot} ${s.state === "current" && !bad ? "ring-4 ring-ok/20" : ""}`} />
              <span
                class={`mt-1.5 px-0.5 text-[10px] leading-tight ${
                  s.state === "todo" ? "text-muted" : bad ? "font-medium text-sale" : s.state === "current" ? "font-bold" : "text-ink-soft"
                }`}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <ol class="relative space-y-5 pl-7">
      <span class="absolute bottom-2 left-[9px] top-2 w-0.5 bg-line" aria-hidden="true" />
      {steps.map((s, i) => {
        const bad = cancelled && i === steps.length - 1;
        return (
          <li class="relative">
            <span
              class={
                "absolute -left-7 top-0.5 grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold text-white " +
                (bad ? "bg-sale" : s.state === "todo" ? "border-2 border-line bg-surface" : "bg-ok") +
                (s.state === "current" && !bad ? " ring-4 ring-ok/20" : "")
              }
            >
              {bad ? "✕" : s.state === "done" ? "✓" : ""}
            </span>
            <div class={`text-sm ${s.state === "todo" ? "text-muted" : s.state === "current" ? "font-bold" : ""} ${bad ? "text-sale" : ""}`}>
              {s.label}
            </div>
            {s.at && <div class="text-xs text-muted">{fmt(s.at)}</div>}
            {s.note && s.note !== "訪客下單" && <div class="mt-0.5 text-xs text-ink-soft">{s.note}</div>}
          </li>
        );
      })}
    </ol>
  );
}

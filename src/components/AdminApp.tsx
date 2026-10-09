import { useEffect, useMemo, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { login, useAuth } from "../lib/auth";
import { useProfile } from "../lib/profile";
import { api, type OrderPatch } from "../lib/api";
import { ntd } from "../lib/format";
import {
  CANCEL_REASONS,
  CANCELLED,
  HOLD_HOURS,
  STAGES,
  dueOf,
  isOverdue,
  itemLabel,
  paidOf,
  kindLabel,
  nextStep,
  payDeadline,
  statusLabel,
  statusTone,
  type Member,
  type Order,
  type OrderKind,
  type OrderStatus,
  type StockRow,
} from "../lib/orders";

type Tab = "orders" | "inventory" | "members";
const TABS: { id: Tab; label: string }[] = [
  { id: "orders", label: "訂單" },
  { id: "inventory", label: "庫存" },
  { id: "members", label: "會員" },
];

// 店主管理頁：只有管理員（後端 ADMIN_LINE_USER_IDS）看得到資料。
// 訂單照出貨流程分頁（參考蝦皮賣家中心），每筆只顯示「下一步」按鈕；取消要選原因（參考 Shopify）。
export default function AdminApp() {
  const { enabled, ready, user } = useAuth();
  const profile = useProfile();
  const [tab, setTab] = useState<Tab>("orders");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  if (!enabled) return <Msg text="會員功能尚未啟用。" />;
  if (!ready || (user && !profile)) return <div class="h-40 animate-pulse rounded-2xl bg-surface" />;
  if (!user)
    return (
      <div class="text-center">
        <Msg text="請用管理員的 LINE 帳號登入。" />
        <button onClick={() => login()} class="mt-4 rounded-xl bg-[#06c755] px-6 py-3 font-bold text-white">
          LINE 登入
        </button>
      </div>
    );
  if (!profile?.isAdmin) return <Msg text="這個帳號沒有管理權限。" />;

  return (
    <div>
      <div class="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            onClick={() => setTab(t.id)}
            class={
              "-mb-px border-b-2 px-4 py-2.5 text-sm " +
              (tab === t.id ? "border-ink font-bold" : "border-transparent text-muted hover:text-ink")
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <div class="mt-6">
        {tab === "orders" && <Orders onToast={setToast} />}
        {tab === "inventory" && <Inventory onToast={setToast} />}
        {tab === "members" && <Members />}
      </div>
      {toast && (
        <div class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── 訂單 ──────────────────────────────────────────────
function Orders({ onToast }: { onToast: (s: string) => void }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [stage, setStage] = useState("all");
  const [kind, setKind] = useState<OrderKind | "all">("all");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState<Order | null>(null);
  const [shipping, setShipping] = useState<Order | null>(null);
  const [amountFor, setAmountFor] = useState<Order | null>(null);

  const load = () =>
    api.admin
      .orders()
      .then(setOrders)
      .catch((e) => setError(e instanceof Error ? e.message : "讀取失敗"));
  useEffect(() => {
    load();
  }, []);

  const inStage = (o: Order, id: string) => id === "all" || !!STAGES.find((s) => s.id === id)?.match(o);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders?.length ?? 0 };
    for (const s of STAGES) c[s.id] = orders?.filter((o) => inStage(o, s.id)).length ?? 0;
    c.overdue = orders?.filter((o) => isOverdue(o)).length ?? 0;
    return c;
  }, [orders]);

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return (orders ?? []).filter((o) => {
      if (!inStage(o, stage)) return false;
      if (kind !== "all" && o.kind !== kind) return false;
      if (!kw) return true;
      const hay = [
        o.code,
        o.member?.displayName,
        o.member?.realName,
        o.member?.phone,
        o.recipient?.name,
        o.recipient?.phone,
        o.tracking,
        ...o.items.map((i) => i.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(kw);
    });
  }, [orders, stage, kind, q]);

  async function update(o: Order, patch: OrderPatch, message: string) {
    try {
      const saved = await api.admin.updateOrder(o.id, patch);
      setOrders((list) => list?.map((x) => (x.id === o.id ? { ...saved, member: x.member } : x)) ?? null);
      onToast(message);
      return true;
    } catch (e) {
      alert(e instanceof Error ? e.message : "更新失敗");
      return false;
    }
  }

  if (error) return <p class="text-sm text-sale">{error}</p>;
  if (!orders) return <div class="h-40 animate-pulse rounded-2xl bg-surface" />;

  return (
    <div>
      {/* 流程分頁 */}
      <div class="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {[{ id: "all", label: "全部" }, ...STAGES].map((s) => (
          <button
            onClick={() => setStage(s.id)}
            class={
              "shrink-0 rounded-full px-3.5 py-1.5 text-sm " +
              (stage === s.id ? "bg-ink text-white" : "border border-line bg-surface text-ink-soft hover:border-ink")
            }
          >
            {s.label}
            <span class={`ml-1 ${stage === s.id ? "text-white/70" : "text-muted"}`}>{counts[s.id] ?? 0}</span>
          </button>
        ))}
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          placeholder="搜尋訂單編號、會員、電話、商品、物流單號"
          class="min-w-0 flex-1 basis-60 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <select
          value={kind}
          onChange={(e) => setKind((e.target as HTMLSelectElement).value as OrderKind | "all")}
          class="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          aria-label="訂單類型"
        >
          <option value="all">全部類型</option>
          <option value="stock">現貨</option>
          <option value="preorder">預購</option>
          <option value="proxy">海外代購</option>
        </select>
        <button onClick={load} class="text-sm text-muted underline underline-offset-2 hover:text-ink">
          重新整理
        </button>
      </div>

      {counts.overdue > 0 && (
        <p class="mt-3 rounded-xl bg-sale/10 px-4 py-2.5 text-sm text-sale">
          有 {counts.overdue} 筆預購到貨超過 3 天未付款，可在「待付款」分頁處理（取消時選「棄單」）。
        </p>
      )}

      {shown.length === 0 ? (
        <p class="mt-10 text-center text-sm text-muted">這個分頁沒有訂單</p>
      ) : (
        <ul class="mt-4 space-y-3">
          {shown.map((o) => (
            <OrderCard
              key={o.id}
              o={o}
              onNext={(to, label) =>
                to === "shipped" ? setShipping(o) : update(o, { status: to }, `${o.code} 已${label}`)
              }
              onCancel={() => setCancelling(o)}
              onRestore={(to) => update(o, { status: to, reason: "復原訂單" }, `${o.code} 已復原`)}
              onRevert={(to) => update(o, { status: to, reason: "退回上一步" }, `${o.code} 已退回「${statusLabel[to]}」`)}
              onNote={(note) => update(o, { note }, "備註已儲存")}
              onAmount={() => setAmountFor(o)}
              onRemoveEntry={(kind, i) =>
                confirm(kind === "adj" ? "刪除這筆金額調整？" : "刪除這筆收款紀錄？") &&
                update(o, kind === "adj" ? { removeAdjustment: i } : { removeReceipt: i }, "已刪除")
              }
            />
          ))}
        </ul>
      )}

      {cancelling && (
        <CancelDialog
          o={cancelling}
          onClose={() => setCancelling(null)}
          onConfirm={async (status, reason, note) => {
            const ok = await update(
              cancelling,
              { status, reason: reason + (note ? `：${note}` : ""), ...(note ? { note } : {}) },
              `${cancelling.code} 已改為「${statusLabel[status]}」，庫存已放回`,
            );
            if (ok) setCancelling(null);
          }}
        />
      )}
      {amountFor && (
        <AmountDialog
          o={amountFor}
          onClose={() => setAmountFor(null)}
          onConfirm={async (patch, message) => {
            const ok = await update(amountFor, patch, `${amountFor.code} ${message}`);
            if (ok) setAmountFor(null);
          }}
        />
      )}
      {shipping && (
        <ShipDialog
          o={shipping}
          onClose={() => setShipping(null)}
          onConfirm={async (tracking) => {
            const ok = await update(shipping, { status: "shipped", tracking }, `${shipping.code} 已出貨`);
            if (ok) setShipping(null);
          }}
        />
      )}
    </div>
  );
}

function OrderCard({
  o,
  onNext,
  onCancel,
  onRestore,
  onRevert,
  onNote,
  onAmount,
  onRemoveEntry,
}: {
  o: Order;
  onNext: (to: OrderStatus, label: string) => void;
  onCancel: () => void;
  onRestore: (to: OrderStatus) => void;
  onRevert: (to: OrderStatus) => void;
  onNote: (note: string) => void;
  onAmount: () => void;
  onRemoveEntry: (kind: "adj" | "rec", index: number) => void;
}) {
  const [note, setNote] = useState(o.note ?? "");
  const [open, setOpen] = useState(false);
  const overdue = isOverdue(o);
  const cancelled = CANCELLED.includes(o.status);
  const next = nextStep(o);
  const r = o.recipient;
  // 復原／退回時回到上一個「有效」狀態（從時間軸找）
  const active = [...o.history].reverse().filter((h) => !CANCELLED.includes(h.status));
  const restoreTo = (active[0]?.status ?? "pending") as OrderStatus;
  const prevStatus = (cancelled ? null : active.find((h) => h.status !== o.status)?.status) as OrderStatus | undefined;
  const holdExpired = o.kind === "stock" && o.status === "pending" && !o.holdsStock;

  return (
    <li class={`rounded-2xl border bg-surface ${overdue ? "border-sale" : "border-line"} ${cancelled ? "opacity-75" : ""}`}>
      <div class="p-4">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-display font-bold">{o.code}</span>
          <span class="rounded border border-line px-1.5 py-px text-[11px] text-ink-soft">{kindLabel[o.kind]}</span>
          <span class={`rounded px-2 py-0.5 text-xs font-medium ${statusTone[o.status]}`}>{statusLabel[o.status]}</span>
          {overdue && <span class="rounded bg-sale px-2 py-0.5 text-xs font-bold text-white">逾期未付款</span>}
          {o.payment?.report && o.status === "confirmed" && (
            <span class="rounded bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">買家已回報匯款</span>
          )}
          {holdExpired && (
            <span class="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">超過 {HOLD_HOURS} 小時未確認，庫存已釋出</span>
          )}
          <span class="ml-auto text-xs text-muted">{new Date(o.createdAt).toLocaleString("zh-TW")}</span>
        </div>

        <div class="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <Field label="買家">
            {o.guest ? (
              <span class="text-muted">訪客（未登入，靠收件電話聯絡）</span>
            ) : (
              <>
                {o.member?.displayName}
                {o.member?.realName && <span class="text-muted">（{o.member.realName}）</span>}
                {o.member?.phone && <div class="text-ink-soft">{o.member.phone}</div>}
              </>
            )}
          </Field>
          <Field label="收件">
            {r && (r.name || r.phone || r.store || r.address) ? (
              <span class="text-ink-soft">{[r.name, r.phone, r.store, r.address].filter(Boolean).join("・")}</span>
            ) : (
              <span class="text-muted">未填（在 LINE 確認）</span>
            )}
          </Field>
        </div>

        <ul class="mt-3 space-y-0.5 border-t border-line pt-2 text-sm">
          {o.items.map((i) => (
            <li class="flex justify-between gap-3">
              <span class="min-w-0">
                {i.url ? (
                  <a href={i.url} target="_blank" rel="noopener" class="underline">
                    {i.name}
                  </a>
                ) : (
                  itemLabel(i)
                )}{" "}
                × {i.qty}
                {i.spec && <span class="text-muted">（{i.spec}）</span>}
              </span>
              {i.price > 0 && <span class="shrink-0">{ntd(i.price * i.qty)}</span>}
            </li>
          ))}
          {o.shipping && (
            <li class="flex justify-between text-ink-soft">
              <span>
                {o.shipping.label}
                {o.shipping.declaredValue ? `（申報 ${ntd(o.shipping.declaredValue)}）` : ""}
                {o.shipping.insured ? "（加保）" : ""}
              </span>
              <span>{ntd(o.shipping.fee + (o.shipping.insuranceFee ?? 0))}</span>
            </li>
          )}
          {o.payment && (
            <li class="flex justify-between text-ink-soft">
              <span>
                付款：{o.payment.label}
                {o.payment.report && (
                  <span class="ml-1 text-emerald-700">
                    （回報末五碼 {o.payment.report.last5}・{new Date(o.payment.report.at).toLocaleString("zh-TW")}）
                  </span>
                )}
              </span>
              {o.payment.fee > 0 && <span>{ntd(o.payment.fee)}</span>}
            </li>
          )}
          {(o.adjustments ?? []).map((a, i) => (
            <li class="flex justify-between text-ink-soft">
              <span>
                {a.note || (a.amount < 0 ? "折扣" : "加價")}
                <RemoveBtn onClick={() => onRemoveEntry("adj", i)} />
              </span>
              <span>{a.amount < 0 ? `−${ntd(-a.amount)}` : `+${ntd(a.amount)}`}</span>
            </li>
          ))}
          {o.total > 0 && (
            <li class="flex justify-between font-bold">
              <span>合計</span>
              <span class="font-display">{ntd(o.total)}</span>
            </li>
          )}
          {(o.receipts ?? []).map((r, i) => (
            <li class="flex justify-between text-emerald-700">
              <span>
                已收{r.note ? `：${r.note}` : ""}
                <span class="ml-1 text-xs text-muted">{new Date(r.at).toLocaleDateString("zh-TW")}</span>
                <RemoveBtn onClick={() => onRemoveEntry("rec", i)} />
              </span>
              <span>−{ntd(r.amount)}</span>
            </li>
          ))}
          {paidOf(o) > 0 && (
            <li class="flex justify-between font-bold">
              <span>尚需付款</span>
              <span class={`font-display ${dueOf(o) === 0 ? "text-ok" : "text-sale"}`}>
                {dueOf(o) === 0 ? "已付清" : ntd(dueOf(o))}
              </span>
            </li>
          )}
        </ul>

        {o.tracking && <p class="mt-2 text-sm">物流單號：<span class="font-medium">{o.tracking}</span></p>}
        {o.status === "arrived" && o.arrivedAt && (
          <p class={`mt-2 text-xs ${overdue ? "text-sale" : "text-muted"}`}>
            到貨通知 {new Date(o.arrivedAt).toLocaleDateString("zh-TW")}，付款期限 {payDeadline(o.arrivedAt).toLocaleDateString("zh-TW")}
          </p>
        )}
      </div>

      {/* 動作列：主要按鈕＝下一步；次要＝取消／復原 */}
      <div class="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        {next && (
          <button
            onClick={() => onNext(next.to, next.label)}
            class="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:brightness-125"
          >
            {next.label}
          </button>
        )}
        {!cancelled && o.status !== "completed" && (
          <button onClick={onCancel} class="rounded-lg border border-line px-3 py-2 text-sm text-sale hover:border-sale">
            取消訂單
          </button>
        )}
        {cancelled && (
          <button
            onClick={() => confirm(`把 ${o.code} 復原成「${statusLabel[restoreTo]}」？會重新占用庫存。`) && onRestore(restoreTo)}
            class="rounded-lg border border-line px-3 py-2 text-sm hover:border-ink"
          >
            復原訂單
          </button>
        )}
        {prevStatus && (
          <button
            onClick={() => confirm(`把 ${o.code} 退回「${statusLabel[prevStatus]}」？`) && onRevert(prevStatus)}
            class="text-xs text-muted underline underline-offset-2 hover:text-ink"
          >
            按錯了？退回上一步
          </button>
        )}
        {o.kind !== "proxy" && !cancelled && (
          <button onClick={onAmount} class="rounded-lg border border-line px-3 py-2 text-sm hover:border-ink">
            金額／收款
          </button>
        )}
        <button onClick={() => setOpen(!open)} class="ml-auto text-xs text-muted underline underline-offset-2 hover:text-ink">
          {open ? "收起" : "備註與紀錄"}
        </button>
      </div>

      {open && (
        <div class="space-y-3 border-t border-line bg-bg/60 px-4 py-3">
          <div class="flex gap-2">
            <input
              value={note}
              onInput={(e) => setNote((e.target as HTMLInputElement).value)}
              placeholder="備註（買家在「我的訂單」看得到）"
              class="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            />
            <button
              onClick={() => onNote(note)}
              disabled={note === (o.note ?? "")}
              class="rounded-lg bg-ink px-3 py-2 text-sm text-white disabled:opacity-30"
            >
              儲存
            </button>
          </div>
          <ol class="space-y-1.5 border-l-2 border-line pl-4 text-xs">
            {o.history.length === 0 && <li class="text-muted">沒有紀錄</li>}
            {o.history.map((h) => (
              <li>
                <span class="text-muted">{new Date(h.at).toLocaleString("zh-TW")}</span>
                <span class="mx-1.5 font-medium">{statusLabel[h.status]}</span>
                <span class="text-muted">{h.by === "admin" ? "店家" : h.by === "buyer" ? "買家" : "系統"}</span>
                {h.note && <span class="text-ink-soft">・{h.note}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </li>
  );
}

function CancelDialog({
  o,
  onClose,
  onConfirm,
}: {
  o: Order;
  onClose: () => void;
  onConfirm: (status: OrderStatus, reason: string, note: string) => void;
}) {
  const [pick, setPick] = useState(o.status === "arrived" ? 1 : 0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const reason = CANCEL_REASONS[pick];
  return (
    <Dialog title={`取消訂單 ${o.code}`} onClose={onClose}>
      <p class="text-sm text-muted">取消後這筆訂單占用的庫存會自動放回。</p>
      <fieldset class="mt-4 space-y-2">
        <legend class="mb-1 text-sm font-medium">原因</legend>
        {CANCEL_REASONS.map((c, i) => (
          <label
            class={
              "flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-sm " +
              (pick === i ? "border-ink" : "border-line")
            }
          >
            <input type="radio" name="reason" checked={pick === i} onChange={() => setPick(i)} class="mt-0.5 accent-ink" />
            <span>
              {c.label}
              <span class="ml-1 text-xs text-muted">（{c.hint}）</span>
            </span>
          </label>
        ))}
      </fieldset>
      <input
        value={note}
        onInput={(e) => setNote((e.target as HTMLInputElement).value)}
        placeholder="補充說明（選填，買家看得到）"
        class="mt-3 w-full rounded-lg border border-line px-3 py-2 text-sm"
      />
      <div class="mt-5 flex justify-end gap-2">
        <button onClick={onClose} class="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink">
          先不要
        </button>
        <button
          disabled={busy || (reason.label === "其他" && !note.trim())}
          onClick={async () => {
            setBusy(true);
            await onConfirm(reason.status, reason.label, note.trim());
            setBusy(false);
          }}
          class="rounded-lg bg-sale px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          確定取消
        </button>
      </div>
    </Dialog>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} class="ml-1.5 text-xs text-muted hover:text-sale" aria-label="刪除">
      ✕
    </button>
  );
}

// 記錄收款（訂金、預付）或調整訂單金額（折扣、補差價）
function AmountDialog({
  o,
  onClose,
  onConfirm,
}: {
  o: Order;
  onClose: () => void;
  onConfirm: (patch: OrderPatch, message: string) => void;
}) {
  const [mode, setMode] = useState<"rec" | "adj">("rec");
  const [sign, setSign] = useState<1 | -1>(-1);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const n = Math.floor(Number(amount)) || 0;
  const presets = mode === "rec" ? ["訂金", "預付全額", "補款"] : sign === -1 ? ["折扣", "老客優惠"] : ["補差價", "運費調整"];
  const total = mode === "adj" ? o.total + sign * n : o.total;
  const paid = paidOf(o) + (mode === "rec" ? n : 0);
  const valid = n > 0 && !!note.trim() && total >= 0;
  return (
    <Dialog title={`金額／收款 ${o.code}`} onClose={onClose}>
      <div class="flex gap-2">
        {([
          ["rec", "記錄收款"],
          ["adj", "調整金額"],
        ] as const).map(([m, label]) => (
          <button
            onClick={() => {
              setMode(m);
              setNote("");
            }}
            class={"flex-1 rounded-lg border py-2 text-sm " + (mode === m ? "border-ink bg-ink text-white" : "border-line")}
          >
            {label}
          </button>
        ))}
      </div>
      <p class="mt-2 text-xs text-muted">
        {mode === "rec"
          ? "買家先付的訂金或預付款記在這裡，訂單頁與到貨通知會改顯示「尚需付款」。"
          : "折扣、補差價、改運費等。合計會跟著變，買家在訂單頁看得到原因。"}
      </p>
      {mode === "adj" && (
        <div class="mt-3 flex gap-2">
          {([
            [-1, "減少（折扣）"],
            [1, "增加（加價）"],
          ] as const).map(([d, label]) => (
            <button
              onClick={() => {
                setSign(d);
                setNote("");
              }}
              class={"flex-1 rounded-lg border py-1.5 text-sm " + (sign === d ? "border-ink" : "border-line text-muted")}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <label class="mt-3 block text-sm">
        <span class="mb-1.5 block font-medium">金額（NT$）</span>
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={amount}
          onInput={(e) => setAmount((e.target as HTMLInputElement).value)}
          class="w-full rounded-lg border border-line px-3 py-2 text-sm"
        />
      </label>
      <div class="mt-3 flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            onClick={() => setNote(p)}
            class={"rounded-full border px-3 py-1 text-xs " + (note === p ? "border-ink" : "border-line text-muted")}
          >
            {p}
          </button>
        ))}
      </div>
      <input
        value={note}
        onInput={(e) => setNote((e.target as HTMLInputElement).value)}
        placeholder="說明（買家看得到）"
        class="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm"
      />
      <dl class="mt-3 space-y-1 rounded-lg bg-bg p-3 text-sm">
        <div class="flex justify-between">
          <dt class="text-muted">合計</dt>
          <dd>{ntd(Math.max(0, total))}</dd>
        </div>
        <div class="flex justify-between">
          <dt class="text-muted">已收</dt>
          <dd>{ntd(paid)}</dd>
        </div>
        <div class="flex justify-between font-bold">
          <dt>尚需付款</dt>
          <dd>{ntd(Math.max(0, total - paid))}</dd>
        </div>
      </dl>
      <div class="mt-5 flex justify-end gap-2">
        <button onClick={onClose} class="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink">
          取消
        </button>
        <button
          disabled={!valid || busy}
          onClick={async () => {
            setBusy(true);
            const e = { amount: mode === "adj" ? sign * n : n, note: note.trim() };
            await onConfirm(
              mode === "rec" ? { addReceipt: e } : { addAdjustment: e },
              mode === "rec" ? `已記錄收款 ${ntd(n)}` : `金額已調整為 ${ntd(total)}`,
            );
            setBusy(false);
          }}
          class="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          確認
        </button>
      </div>
    </Dialog>
  );
}

function ShipDialog({ o, onClose, onConfirm }: { o: Order; onClose: () => void; onConfirm: (tracking: string) => void }) {
  const [tracking, setTracking] = useState(o.tracking ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title={`出貨 ${o.code}`} onClose={onClose}>
      <label class="block text-sm">
        <span class="mb-1.5 block font-medium">物流單號（選填）</span>
        <input
          value={tracking}
          onInput={(e) => setTracking((e.target as HTMLInputElement).value)}
          placeholder={o.shipping?.label ? `${o.shipping.label} 的寄件編號` : "寄件編號"}
          class="w-full rounded-lg border border-line px-3 py-2 text-sm"
        />
      </label>
      <p class="mt-2 text-xs text-muted">買家會在「我的訂單」看到物流單號。</p>
      <div class="mt-5 flex justify-end gap-2">
        <button onClick={onClose} class="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink">
          取消
        </button>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onConfirm(tracking.trim());
            setBusy(false);
          }}
          class="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          確認出貨
        </button>
      </div>
    </Dialog>
  );
}

// ─── 庫存 ──────────────────────────────────────────────
function Inventory({ onToast }: { onToast: (s: string) => void }) {
  const [rows, setRows] = useState<StockRow[] | null>(null);
  const [error, setError] = useState("");
  const [adjusting, setAdjusting] = useState<StockRow | null>(null);

  const load = () =>
    api.admin
      .inventory()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "讀取失敗"));
  useEffect(() => {
    load();
  }, []);

  if (error) return <p class="text-sm text-sale">{error}</p>;
  if (!rows) return <div class="h-40 animate-pulse rounded-2xl bg-surface" />;
  if (rows.length === 0) return <Msg text="還沒有上架商品。" />;

  return (
    <div>
      <p class="mb-3 text-sm text-muted">
        剩餘 = 商品檔的數量 ＋ 手動調整 − 訂單占用。網站下單會自動扣、取消會自動放回；賣貨便在網站外賣掉、或補貨時，用「調整」記一筆。
      </p>
      <div class="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table class="w-full min-w-[560px] text-sm">
          <thead class="bg-bg text-left text-xs text-muted">
            <tr>
              <th class="px-4 py-2.5 font-medium">商品</th>
              <th class="px-4 py-2.5 text-right font-medium">商品檔</th>
              <th class="px-4 py-2.5 text-right font-medium">調整</th>
              <th class="px-4 py-2.5 text-right font-medium">訂單占用</th>
              <th class="px-4 py-2.5 text-right font-medium">剩餘</th>
              <th class="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr class="border-t border-line">
                <td class="px-4 py-3">
                  {s.name}
                  {s.preorder && <span class="ml-1.5 rounded bg-accent px-1.5 py-px text-[11px] font-bold">預購</span>}
                </td>
                <td class="px-4 py-3 text-right text-ink-soft">{s.base}</td>
                <td class={`px-4 py-3 text-right ${s.adjust ? "" : "text-muted"}`}>
                  {s.adjust > 0 ? `+${s.adjust}` : s.adjust}
                </td>
                <td class="px-4 py-3 text-right text-ink-soft">{s.sold}</td>
                <td class={`px-4 py-3 text-right font-bold ${s.available === 0 ? "text-sale" : ""}`}>{s.available}</td>
                <td class="px-4 py-3 text-right">
                  <button onClick={() => setAdjusting(s)} class="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-ink">
                    調整
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adjusting && (
        <AdjustDialog
          s={adjusting}
          onClose={() => setAdjusting(null)}
          onConfirm={async (delta, note) => {
            try {
              const saved = await api.admin.adjustStock(adjusting.id, delta, note);
              setRows((list) => list?.map((x) => (x.id === saved.id ? saved : x)) ?? null);
              setAdjusting(null);
              onToast(`「${saved.name}」剩餘 ${saved.available} 個`);
            } catch (e) {
              alert(e instanceof Error ? e.message : "調整失敗");
            }
          }}
        />
      )}
    </div>
  );
}

function AdjustDialog({
  s,
  onClose,
  onConfirm,
}: {
  s: StockRow;
  onClose: () => void;
  onConfirm: (delta: number, note: string) => void;
}) {
  const [dir, setDir] = useState<1 | -1>(-1);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const presets = dir === -1 ? ["賣貨便售出", "LINE 私下售出", "損壞・遺失"] : ["補貨", "退貨回庫"];
  return (
    <Dialog title={`調整庫存：${s.name}`} onClose={onClose}>
      <div class="flex gap-2">
        {([
          [-1, "減少（網站外賣掉）"],
          [1, "增加（補貨）"],
        ] as const).map(([d, label]) => (
          <button
            onClick={() => setDir(d)}
            class={"flex-1 rounded-lg border py-2 text-sm " + (dir === d ? "border-ink bg-ink text-white" : "border-line")}
          >
            {label}
          </button>
        ))}
      </div>
      <label class="mt-4 block text-sm">
        <span class="mb-1.5 block font-medium">數量</span>
        <input
          type="number"
          min={1}
          value={qty}
          onInput={(e) => setQty(Math.max(1, Number((e.target as HTMLInputElement).value) || 1))}
          class="w-full rounded-lg border border-line px-3 py-2 text-sm"
        />
      </label>
      <div class="mt-3 flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            onClick={() => setNote(p)}
            class={"rounded-full border px-3 py-1 text-xs " + (note === p ? "border-ink" : "border-line text-muted")}
          >
            {p}
          </button>
        ))}
      </div>
      <input
        value={note}
        onInput={(e) => setNote((e.target as HTMLInputElement).value)}
        placeholder="說明（例：賣貨便訂單 12345）"
        class="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm"
      />
      <p class="mt-3 text-sm">
        調整後剩餘：<b>{Math.max(0, s.available + dir * qty)}</b> 個
      </p>
      <div class="mt-5 flex justify-end gap-2">
        <button onClick={onClose} class="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink">
          取消
        </button>
        <button
          disabled={!note.trim()}
          onClick={() => onConfirm(dir * qty, note.trim())}
          class="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          確認調整
        </button>
      </div>
    </Dialog>
  );
}

// ─── 會員 ──────────────────────────────────────────────
function Members() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.admin
      .members()
      .then((m) => setMembers(m.sort((a, b) => b.abandonedCount - a.abandonedCount || b.orderCount - a.orderCount)))
      .catch((e) => setError(e instanceof Error ? e.message : "讀取失敗"));
  }, []);

  async function toggle(m: Member) {
    try {
      await api.admin.updateMember(m.lineUserId, { preorderBlocked: !m.preorderBlocked });
      setMembers((list) =>
        list?.map((x) => (x.lineUserId === m.lineUserId ? { ...x, preorderBlocked: !m.preorderBlocked } : x)) ?? null,
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "更新失敗");
    }
  }

  if (error) return <p class="text-sm text-sale">{error}</p>;
  if (!members) return <div class="h-40 animate-pulse rounded-2xl bg-surface" />;
  if (members.length === 0) return <p class="text-sm text-muted">還沒有會員</p>;

  return (
    <div class="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table class="w-full min-w-[560px] text-sm">
        <thead class="bg-bg text-left text-xs text-muted">
          <tr>
            <th class="px-4 py-2.5 font-medium">會員</th>
            <th class="px-4 py-2.5 font-medium">電話</th>
            <th class="px-4 py-2.5 font-medium">訂單</th>
            <th class="px-4 py-2.5 font-medium">棄單</th>
            <th class="px-4 py-2.5 font-medium">停止受理預購</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr class="border-t border-line">
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  {m.pictureUrl ? (
                    <img src={m.pictureUrl} alt="" class="h-7 w-7 rounded-full" />
                  ) : (
                    <span class="grid h-7 w-7 place-items-center rounded-full bg-bg text-xs">{m.displayName.slice(0, 1)}</span>
                  )}
                  <span>
                    {m.displayName}
                    {m.realName && <span class="text-muted">（{m.realName}）</span>}
                  </span>
                </div>
              </td>
              <td class="px-4 py-3 text-ink-soft">{m.phone ?? "—"}</td>
              <td class="px-4 py-3">{m.orderCount}</td>
              <td class={`px-4 py-3 font-bold ${m.abandonedCount ? "text-sale" : "text-muted"}`}>{m.abandonedCount}</td>
              <td class="px-4 py-3">
                <label class="inline-flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={m.preorderBlocked} onChange={() => toggle(m)} class="h-4 w-4 accent-sale" />
                  <span class={m.preorderBlocked ? "text-sale" : "text-muted"}>{m.preorderBlocked ? "已停止" : "正常"}</span>
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class="border-t border-line px-4 py-3 text-xs text-muted">
        依預購服務條款第七條：累計棄單 2 次可停止受理預購。取消訂單時選「棄單」才會計入次數。
      </p>
    </div>
  );
}

// ─── 共用小元件 ────────────────────────────────────────
function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, []);
  return (
    <div class="fixed inset-0 z-50 grid place-items-center p-4">
      <div class="absolute inset-0 bg-black/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" class="relative w-full max-w-md rounded-2xl bg-surface p-5 shadow-xl">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="font-bold">{title}</h2>
          <button onClick={onClose} aria-label="關閉" class="text-muted hover:text-ink">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div>
      <div class="text-xs text-muted">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function Msg({ text }: { text: string }) {
  return <p class="rounded-2xl border border-dashed border-line bg-surface px-6 py-10 text-center text-sm text-muted">{text}</p>;
}

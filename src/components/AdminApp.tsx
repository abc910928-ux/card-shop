import { useEffect, useMemo, useState } from "preact/hooks";
import { login, useAuth } from "../lib/auth";
import { useProfile } from "../lib/profile";
import { api } from "../lib/api";
import { ntd } from "../lib/format";
import {
  ALL_STATUSES,
  isOverdue,
  kindLabel,
  payDeadline,
  statusLabel,
  statusTone,
  type Member,
  type Order,
  type OrderStatus,
} from "../lib/orders";

type Tab = "orders" | "members";

// 店主管理頁：只有管理員（後端 ADMIN_LINE_USER_IDS）看得到資料
export default function AdminApp() {
  const { enabled, ready, user } = useAuth();
  const profile = useProfile();
  const [tab, setTab] = useState<Tab>("orders");

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
        {(
          [
            ["orders", "訂單"],
            ["members", "會員"],
          ] as const
        ).map(([id, label]) => (
          <button
            onClick={() => setTab(id)}
            class={
              "-mb-px border-b-2 px-4 py-2.5 text-sm " +
              (tab === id ? "border-ink font-bold" : "border-transparent text-muted hover:text-ink")
            }
          >
            {label}
          </button>
        ))}
      </div>
      <div class="mt-6">{tab === "orders" ? <Orders /> : <Members />}</div>
    </div>
  );
}

function Orders() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [filter, setFilter] = useState<OrderStatus | "all" | "overdue">("all");
  const [error, setError] = useState("");

  const load = () =>
    api.admin
      .orders()
      .then(setOrders)
      .catch((e) => setError(e instanceof Error ? e.message : "讀取失敗"));
  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders?.length ?? 0, overdue: 0 };
    orders?.forEach((o) => {
      c[o.status] = (c[o.status] ?? 0) + 1;
      if (isOverdue(o)) c.overdue++;
    });
    return c;
  }, [orders]);

  const shown = useMemo(
    () =>
      (orders ?? []).filter((o) =>
        filter === "all" ? true : filter === "overdue" ? isOverdue(o) : o.status === filter,
      ),
    [orders, filter],
  );

  async function update(id: number, patch: { status?: OrderStatus; note?: string }) {
    try {
      const saved = await api.admin.updateOrder(id, patch);
      setOrders((list) => list?.map((o) => (o.id === id ? { ...o, ...saved, member: o.member } : o)) ?? null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "更新失敗");
    }
  }

  if (error) return <p class="text-sm text-sale">{error}</p>;
  if (!orders) return <div class="h-40 animate-pulse rounded-2xl bg-surface" />;

  const chips: { id: typeof filter; label: string }[] = [
    { id: "all", label: "全部" },
    { id: "overdue", label: "逾期未付" },
    ...ALL_STATUSES.map((s) => ({ id: s, label: statusLabel[s] })),
  ];

  return (
    <div>
      <div class="flex flex-wrap gap-1.5">
        {chips
          .filter((c) => c.id === "all" || counts[c.id])
          .map((c) => (
            <button
              onClick={() => setFilter(c.id)}
              class={
                "rounded-full px-3 py-1.5 text-sm " +
                (filter === c.id
                  ? c.id === "overdue"
                    ? "bg-sale text-white"
                    : "bg-ink text-white"
                  : "border border-line bg-surface text-ink-soft hover:border-ink")
              }
            >
              {c.label} {counts[c.id] ?? 0}
            </button>
          ))}
        <button onClick={load} class="ml-auto text-sm text-muted underline underline-offset-2">
          重新整理
        </button>
      </div>

      {shown.length === 0 ? (
        <p class="mt-8 text-center text-sm text-muted">沒有符合的訂單</p>
      ) : (
        <ul class="mt-4 space-y-3">
          {shown.map((o) => (
            <OrderRow key={o.id} o={o} onUpdate={(patch) => update(o.id, patch)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderRow({ o, onUpdate }: { o: Order; onUpdate: (patch: { status?: OrderStatus; note?: string }) => void }) {
  const [note, setNote] = useState(o.note ?? "");
  const overdue = isOverdue(o);
  const r = o.recipient;

  return (
    <li class={`rounded-2xl border bg-surface p-4 ${overdue ? "border-sale" : "border-line"}`}>
      <div class="flex flex-wrap items-center gap-2">
        <span class="font-display font-bold">{o.code}</span>
        <span class="rounded border border-line px-1.5 py-px text-[11px] text-ink-soft">{kindLabel[o.kind]}</span>
        <span class={`rounded px-2 py-0.5 text-xs font-medium ${statusTone[o.status]}`}>{statusLabel[o.status]}</span>
        {overdue && <span class="rounded bg-sale px-2 py-0.5 text-xs font-bold text-white">逾期未付款</span>}
        <span class="ml-auto text-xs text-muted">{new Date(o.createdAt).toLocaleString("zh-TW")}</span>
      </div>

      <div class="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <div class="text-xs text-muted">會員</div>
          <div>
            {o.member?.displayName}
            {o.member?.realName && <span class="text-muted">（{o.member.realName}）</span>}
          </div>
          {o.member?.phone && <div class="text-ink-soft">{o.member.phone}</div>}
        </div>
        <div>
          <div class="text-xs text-muted">收件</div>
          {r && (r.name || r.phone || r.store || r.address) ? (
            <div class="text-ink-soft">{[r.name, r.phone, r.store, r.address].filter(Boolean).join("・")}</div>
          ) : (
            <div class="text-muted">未填</div>
          )}
        </div>
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
                i.name
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
        {o.total > 0 && (
          <li class="flex justify-between font-bold">
            <span>合計</span>
            <span class="font-display">{ntd(o.total)}</span>
          </li>
        )}
      </ul>

      {o.status === "arrived" && o.arrivedAt && (
        <p class="mt-2 text-xs text-muted">
          到貨通知：{new Date(o.arrivedAt).toLocaleDateString("zh-TW")}，付款期限 {payDeadline(o.arrivedAt).toLocaleDateString("zh-TW")}
        </p>
      )}

      <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <label class="text-xs text-muted" for={`st-${o.id}`}>
          狀態
        </label>
        <select
          id={`st-${o.id}`}
          value={o.status}
          onChange={(e) => onUpdate({ status: (e.target as HTMLSelectElement).value as OrderStatus })}
          class="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
        >
          {ALL_STATUSES.map((s) => (
            <option value={s}>{statusLabel[s]}</option>
          ))}
        </select>
        <input
          value={note}
          onInput={(e) => setNote((e.target as HTMLInputElement).value)}
          placeholder="備註（買家看得到）"
          class="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
        />
        <button
          onClick={() => onUpdate({ note })}
          disabled={note === (o.note ?? "")}
          class="rounded-lg bg-ink px-3 py-1.5 text-sm text-white disabled:opacity-30"
        >
          存備註
        </button>
      </div>
    </li>
  );
}

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
        依預購服務條款第七條：累計棄單 2 次可停止受理預購。訂單改成「棄單」時次數會自動累計。
      </p>
    </div>
  );
}

function Msg({ text }: { text: string }) {
  return <p class="rounded-2xl border border-dashed border-line bg-surface px-6 py-10 text-center text-sm text-muted">{text}</p>;
}

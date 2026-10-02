import { useEffect, useMemo, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { categories, type ProductView } from "../lib/types";
import { ProductCard } from "./ProductCard";
import { useStockMap } from "../lib/stock";

type Sort = "new" | "price-asc" | "price-desc";
const SORTS: { id: Sort; label: string }[] = [
  { id: "new", label: "新上架" },
  { id: "price-asc", label: "價格低 → 高" },
  { id: "price-desc", label: "價格高 → 低" },
];

const ALL = "全部";

type Supply = "all" | "stock" | "preorder";
const SUPPLY: { id: Supply; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "stock", label: "現貨" },
  { id: "preorder", label: "預購" },
];

type Filters = {
  q: string;
  category: string;
  game: string;
  set: string;
  rarity: string[];
  language: string[];
  inStock: boolean;
  supply: Supply;
  sort: Sort;
};

const EMPTY: Filters = {
  q: "",
  category: ALL,
  game: ALL,
  set: ALL,
  rarity: [],
  language: [],
  inStock: false,
  supply: "all",
  sort: "new",
};

// ─── 網址 query ⇄ 篩選狀態（可分享、首頁捷徑可直接帶條件進來）───
function fromQuery(search: string): Filters {
  const sp = new URLSearchParams(search);
  const list = (k: string) => sp.get(k)?.split(",").filter(Boolean) ?? [];
  const sort = sp.get("sort") as Sort | null;
  return {
    q: sp.get("q") ?? "",
    category: sp.get("category") ?? ALL,
    game: sp.get("game") ?? ALL,
    set: sp.get("set") ?? ALL,
    rarity: list("rarity"),
    language: list("language"),
    inStock: sp.get("instock") === "1",
    supply: (SUPPLY.find((x) => x.id === sp.get("supply"))?.id ?? "all") as Supply,
    sort: sort && SORTS.some((s) => s.id === sort) ? sort : "new",
  };
}

// 篩選用到的參數；其他參數（例如 LINE 登入導回時帶的 code、liff.state）原封保留
const MANAGED = ["q", "category", "game", "set", "rarity", "language", "instock", "supply", "sort"];

function toQuery(f: Filters, current: string): string {
  const sp = new URLSearchParams(current);
  MANAGED.forEach((k) => sp.delete(k));
  if (f.q) sp.set("q", f.q);
  if (f.category !== ALL) sp.set("category", f.category);
  if (f.game !== ALL) sp.set("game", f.game);
  if (f.set !== ALL) sp.set("set", f.set);
  if (f.rarity.length) sp.set("rarity", f.rarity.join(","));
  if (f.language.length) sp.set("language", f.language.join(","));
  if (f.inStock) sp.set("instock", "1");
  if (f.supply !== "all") sp.set("supply", f.supply);
  if (f.sort !== "new") sp.set("sort", f.sort);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function uniq(values: (string | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v)));
}

export default function ShopBrowser({ products: base }: { products: ProductView[] }) {
  // 庫存換成扣掉訂單後的即時數字
  const live = useStockMap();
  const products = useMemo(
    () => (live ? base.map((p) => (live[p.id] === undefined ? p : { ...p, stock: live[p.id] })) : base),
    [base, live],
  );
  const [f, setF] = useState<Filters>(EMPTY);
  const [drawer, setDrawer] = useState(false);
  const [ready, setReady] = useState(false);

  // 進頁面時讀網址條件；之後每次變更寫回網址
  useEffect(() => {
    setF(fromQuery(location.search));
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) history.replaceState(null, "", location.pathname + toQuery(f, location.search) + location.hash);
  }, [f, ready]);

  const set = (patch: Partial<Filters>) => setF((prev) => ({ ...prev, ...patch }));
  const toggle = (key: "rarity" | "language", v: string) =>
    setF((prev) => ({
      ...prev,
      [key]: prev[key].includes(v) ? prev[key].filter((x) => x !== v) : [...prev[key], v],
    }));

  // 篩選選項依上一層條件自動產生（類別 → 遊戲 → 系列 / 稀有度）
  const inCategory = useMemo(
    () => products.filter((p) => f.category === ALL || p.category === f.category),
    [products, f.category],
  );
  const inGame = useMemo(
    () => inCategory.filter((p) => f.game === ALL || p.game === f.game),
    [inCategory, f.game],
  );
  const games = useMemo(() => uniq(inCategory.map((p) => p.game)), [inCategory]);
  const sets = useMemo(() => uniq(inGame.map((p) => p.set)), [inGame]);
  const rarities = useMemo(() => uniq(inGame.map((p) => p.rarity)), [inGame]);
  const languages = useMemo(() => uniq(inGame.map((p) => p.language)), [inGame]);

  const results = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    const list = inGame.filter((p) => {
      if (f.set !== ALL && p.set !== f.set) return false;
      if (f.rarity.length && !f.rarity.includes(p.rarity ?? "")) return false;
      if (f.language.length && !f.language.includes(p.language ?? "")) return false;
      if (f.inStock && p.stock === 0) return false;
      if (f.supply === "stock" && p.preorder) return false;
      if (f.supply === "preorder" && !p.preorder) return false;
      if (q) {
        const hay = [p.name, p.set, p.number, p.rarity, p.game].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const sorters: Record<Sort, (a: ProductView, b: ProductView) => number> = {
      new: (a, b) => b.addedAt.localeCompare(a.addedAt),
      "price-asc": (a, b) => a.price - b.price,
      "price-desc": (a, b) => b.price - a.price,
    };
    // 售完的一律排在最後
    return list.sort((a, b) => Number(a.stock === 0) - Number(b.stock === 0) || sorters[f.sort](a, b));
  }, [inGame, f]);

  const activeCount =
    (f.category !== ALL ? 1 : 0) +
    (f.game !== ALL ? 1 : 0) +
    (f.set !== ALL ? 1 : 0) +
    f.rarity.length +
    f.language.length +
    (f.inStock ? 1 : 0) +
    (f.supply !== "all" ? 1 : 0);

  const hasPreorder = products.some((p) => p.preorder);

  const panel = (
    <div class="space-y-6">
      {hasPreorder && (
        <Group title="供貨">
          <Pills
            options={SUPPLY.map((x) => x.label)}
            value={SUPPLY.find((x) => x.id === f.supply)!.label}
            onSelect={(label) => set({ supply: SUPPLY.find((x) => x.label === label)!.id })}
          />
        </Group>
      )}

      <Group title="類別">
        <Pills
          options={[ALL, ...categories]}
          value={f.category}
          onSelect={(v) => set({ category: v, game: ALL, set: ALL, rarity: [] })}
        />
      </Group>

      {games.length > 1 && (
        <Group title="遊戲">
          <Pills
            options={[ALL, ...games]}
            value={f.game}
            onSelect={(v) => set({ game: v, set: ALL, rarity: [] })}
          />
        </Group>
      )}

      {sets.length > 0 && (
        <Group title="系列">
          <select
            value={f.set}
            onChange={(e) => set({ set: (e.target as HTMLSelectElement).value })}
            class="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          >
            <option value={ALL}>全部系列</option>
            {sets.map((s) => (
              <option value={s}>{s}</option>
            ))}
          </select>
        </Group>
      )}

      {rarities.length > 0 && (
        <Group title="稀有度">
          <Checks options={rarities} values={f.rarity} onToggle={(v) => toggle("rarity", v)} />
        </Group>
      )}


      {languages.length > 1 && (
        <Group title="語言">
          <Checks
            options={languages}
            values={f.language}
            onToggle={(v) => toggle("language", v)}
          />
        </Group>
      )}

      <label class="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={f.inStock}
          onChange={() => set({ inStock: !f.inStock })}
          class="h-4 w-4 accent-ink"
        />
        只看有貨
      </label>

      {activeCount > 0 && (
        <button
          onClick={() => setF({ ...EMPTY, q: f.q, sort: f.sort })}
          class="text-sm text-muted underline underline-offset-2 hover:text-ink"
        >
          清除全部篩選
        </button>
      )}
    </div>
  );

  return (
    <div class="lg:grid lg:grid-cols-[240px_1fr] lg:gap-8">
      {/* 桌機：側欄 */}
      <aside class="hidden lg:block">
        <div class="sticky top-24">{panel}</div>
      </aside>

      <div class="min-w-0">
        {/* 搜尋與排序 */}
        <div class="flex flex-wrap items-center gap-2">
          <div class="relative min-w-0 flex-1 basis-56">
            <input
              type="search"
              value={f.q}
              onInput={(e) => set({ q: (e.target as HTMLInputElement).value })}
              placeholder="搜尋商品…"
              class="w-full rounded-lg border border-line bg-surface py-2.5 pl-9 pr-3 text-sm outline-none focus:border-ink"
            />
            <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              ⌕
            </span>
          </div>
          <button
            onClick={() => setDrawer(true)}
            class="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm lg:hidden"
          >
            篩選{activeCount > 0 && <span class="ml-1 rounded-full bg-ink px-1.5 text-xs text-white">{activeCount}</span>}
          </button>
          <select
            value={f.sort}
            onChange={(e) => set({ sort: (e.target as HTMLSelectElement).value as Sort })}
            class="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm"
            aria-label="排序"
          >
            {SORTS.map((s) => (
              <option value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>

        <div class="mt-4 text-sm text-muted">共 {results.length} 件商品</div>

        {results.length > 0 ? (
          <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
            {results.map((p) => (
              <ProductCard key={p.id} p={p} wish />
            ))}
          </div>
        ) : (
          <div class="mt-10 rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">
            沒有符合條件的商品，試試減少篩選條件。
          </div>
        )}
      </div>

      {/* 手機：篩選抽屜 */}
      {drawer && (
        <div class="fixed inset-0 z-50 lg:hidden">
          <div class="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <div class="absolute inset-y-0 right-0 flex w-[85%] max-w-sm flex-col bg-bg shadow-xl">
            <div class="flex items-center justify-between border-b border-line px-5 py-4">
              <span class="font-medium">篩選</span>
              <button onClick={() => setDrawer(false)} class="text-muted" aria-label="關閉">
                ✕
              </button>
            </div>
            <div class="flex-1 overflow-y-auto px-5 py-5">{panel}</div>
            <div class="border-t border-line p-4">
              <button
                onClick={() => setDrawer(false)}
                class="w-full rounded-lg bg-ink py-3 text-sm font-medium text-white"
              >
                查看 {results.length} 件商品
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <div>
      <div class="mb-2 text-xs font-medium uppercase tracking-wider text-muted">{title}</div>
      {children}
    </div>
  );
}

function Pills({
  options,
  value,
  onSelect,
}: {
  options: string[];
  value: string;
  onSelect: (v: string) => void;
}) {
  return (
    <div class="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          onClick={() => onSelect(o)}
          class={
            "rounded-full px-3 py-1.5 text-sm transition " +
            (value === o
              ? "bg-ink text-white"
              : "border border-line bg-surface text-ink-soft hover:border-ink")
          }
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function Checks({
  options,
  values,
  onToggle,
}: {
  options: string[];
  values: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div class="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = values.includes(o);
        return (
          <button
            onClick={() => onToggle(o)}
            aria-pressed={on}
            class={
              "rounded-md px-2.5 py-1 text-sm transition " +
              (on
                ? "bg-accent font-medium text-accent-ink"
                : "border border-line bg-surface text-ink-soft hover:border-ink")
            }
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

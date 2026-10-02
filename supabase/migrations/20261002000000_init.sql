-- TCG代購 會員資料庫
-- 所有資料表都開 RLS 且不建立任何 policy：前端（anon key）完全無法存取，
-- 只有 Edge Function「api」用 service role 在驗證 LINE 登入後讀寫。

create table public.profiles (
  line_user_id text primary key,
  display_name text not null default '',
  picture_url text,
  real_name text,
  phone text,
  store_name text,
  address text,
  preorder_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id bigint generated always as identity primary key,
  code text not null unique,
  line_user_id text not null references public.profiles (line_user_id) on delete cascade,
  kind text not null check (kind in ('stock', 'preorder', 'proxy')),
  items jsonb not null,
  shipping jsonb,
  recipient jsonb,
  total integer not null default 0,
  status text not null default 'pending' check (
    status in ('pending', 'confirmed', 'arrived', 'paid', 'shipped', 'completed', 'cancelled', 'abandoned', 'unallocated')
  ),
  note text,
  arrived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_user_idx on public.orders (line_user_id, created_at desc);
create index orders_status_idx on public.orders (status);

create table public.wishlist (
  line_user_id text not null references public.profiles (line_user_id) on delete cascade,
  product_id text not null,
  price_at_add integer not null,
  stock_at_add integer not null,
  created_at timestamptz not null default now(),
  primary key (line_user_id, product_id)
);

alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.wishlist enable row level security;
revoke all on public.profiles, public.orders, public.wishlist from anon, authenticated;

-- updated_at 自動更新
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end
$$;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- 管理頁的會員列表：附訂單數與棄單數
create view public.member_stats with (security_invoker = true) as
select
  p.*,
  count(o.id)::int as order_count,
  (count(o.id) filter (where o.status = 'abandoned'))::int as abandoned_count
from public.profiles p
left join public.orders o on o.line_user_id = p.line_user_id
group by p.line_user_id;
revoke all on public.member_stats from anon, authenticated;

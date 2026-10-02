-- 訂單紀錄時間軸、物流單號、訪客訂單、庫存手動調整

alter table public.orders add column status_history jsonb not null default '[]'::jsonb;
alter table public.orders add column tracking text;
alter table public.orders add column guest boolean not null default false;
-- 訪客訂單沒有會員 ID
alter table public.orders alter column line_user_id drop not null;

-- 手動調整庫存（補貨＋、賣貨便等網站外售出－）
create table public.inventory_adjustments (
  id bigint generated always as identity primary key,
  product_id text not null,
  delta integer not null,
  note text,
  created_at timestamptz not null default now()
);
create index inventory_adjustments_product_idx on public.inventory_adjustments (product_id);

alter table public.inventory_adjustments enable row level security;
revoke all on public.inventory_adjustments from anon, authenticated;
grant select, insert, update, delete on public.inventory_adjustments to service_role;
grant usage, select on all sequences in schema public to service_role;

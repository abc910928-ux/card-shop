-- 訂單封存：從後台列表收起（例如測試單），資料保留、可取消封存
alter table public.orders add column if not exists archived boolean not null default false;

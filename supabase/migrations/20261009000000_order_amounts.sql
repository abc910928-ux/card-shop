-- 訂單金額調整（折扣、補差價）與收款紀錄（訂金、預付款）
-- 每筆：{ "amount": 整數, "note": "說明", "at": "時間" }
alter table public.orders add column if not exists adjustments jsonb not null default '[]'::jsonb;
alter table public.orders add column if not exists receipts jsonb not null default '[]'::jsonb;

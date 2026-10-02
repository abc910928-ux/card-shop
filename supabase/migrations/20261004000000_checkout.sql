-- 網站內結帳：付款方式（銀行轉帳／取貨付款）與買家回報匯款末五碼
-- （訪客查單用的訂單編號在 init 已經是 unique，不用另建索引）
alter table public.orders add column if not exists payment jsonb;

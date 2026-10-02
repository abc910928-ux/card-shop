// 站內連結一律經過這裡，自動補上 base（/card-shop）與結尾斜線
const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export function url(path = "/"): string {
  const [pathname, query] = path.split("?");
  let p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (!p.endsWith("/") && !/\.[a-z0-9]+$/i.test(p)) p += "/";
  return `${base}${p}${query ? `?${query}` : ""}`;
}

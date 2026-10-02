// @ts-check
import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";
import tailwindcss from "@tailwindcss/vite";

// 部署到 GitHub Pages 子路徑：https://abc910928-ux.github.io/card-shop/
// 換網域或 repo 名稱時，改 site 與 base 即可。
export default defineConfig({
  site: "https://abc910928-ux.github.io",
  base: "/card-shop",
  trailingSlash: "always",
  integrations: [preact()],
  vite: {
    plugins: [tailwindcss()],
  },
});

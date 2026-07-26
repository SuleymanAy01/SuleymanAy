import { resolve } from "node:path";
import { defineConfig } from "vite";

/**
 * Çok girişli statik build:
 * - /index.html: herkese açık kişisel site
 * - /admin/index.html: statik yönetim paneli
 * - /403.html: yetkisiz hesaplar için hata sayfası
 *
 * Göreli base, hem kullanıcı/organizasyon Pages alan adında hem de
 * /repository-name/ alt yolunda ek yapılandırma olmadan çalışır.
 */
export default defineConfig({
  base: "./",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        admin: resolve(import.meta.dirname, "admin/index.html"),
        forbidden: resolve(import.meta.dirname, "403.html"),
      },
    },
  },
});

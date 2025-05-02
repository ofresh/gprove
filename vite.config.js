import { defineConfig } from "vite";

export default defineConfig({
  root: "src", // Вказуємо, що index.html у папці src/
  base: "/",
  publicDir: "../public", // Папка public на рівень вище від src/
  build: {
    outDir: "../dist", // Вихідна папка на рівень вище
    assetsDir: "assets",
  },
});
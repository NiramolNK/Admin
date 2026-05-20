import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Treat .jsx and .js as the same so the existing file Just Works
  esbuild: { loader: "jsx", include: /\.(jsx?|tsx?)$/ },
  optimizeDeps: { esbuildOptions: { loader: { ".js": "jsx" } } },
});

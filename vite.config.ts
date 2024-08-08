import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

console.log("Vite Config Path:", path.resolve(__dirname));

export default defineConfig(async () => ({
  plugins: [react()],
  root: path.resolve(__dirname),  // Explicitly set the root directory
  publicDir: path.resolve(__dirname, 'public'),  // If you have a public directory, point to it explicitly
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));

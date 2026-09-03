import { defineConfig } from "vite";import react from "@vitejs/plugin-react";import path from "node:path";
export default defineConfig({root:path.resolve("web"),plugins:[react()],server:{port:5173,proxy:{"/api":"http://localhost:3001"}},build:{outDir:"dist"}});

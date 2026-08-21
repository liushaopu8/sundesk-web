import { defineConfig } from 'vite';

export default defineConfig({
    base: './', // 部署在子路径（GitHub Pages /sundesk-web/）必须用相对路径
    build: {
        manifest: false,
        rollupOptions: {
            output: {
                entryFileNames: `[name].js`,
                chunkFileNames: `[name].js`,
                assetFileNames: `[name].[ext]`,
            }
        }
    },
})
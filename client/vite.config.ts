import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

// https://vite.dev/config/
export default defineConfig({
    plugins: [angular({ tsconfig: './tsconfig.json' })],
    server: {
        port: 5173,
        host: true,
    },
});

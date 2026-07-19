import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'e2e',
    fullyParallel: true,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:5173',
    },
    webServer: [
        { command: 'npm run dev:server', cwd: '..', port: 1234, reuseExistingServer: !process.env.CI },
        { command: 'npm run dev:client', cwd: '..', port: 5173, reuseExistingServer: !process.env.CI },
    ],
});

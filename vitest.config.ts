import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        // jsdom is needed by component render tests; non-DOM tests don't care.
        environment: 'jsdom',
        globals: false,
        // Server tests live under server/, run their own vitest config.
        include: ['src/**/*.test.{ts,tsx}'],
    },
});

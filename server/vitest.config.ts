import { defineConfig } from 'vitest/config';

// Without this the server inherits the repo-root config, which is jsdom-based
// and loads a browser test setup that does not exist here.
export default defineConfig({
    test: {
        environment: 'node',
        globals: false,
        include: ['src/**/*.test.ts'],
    },
});

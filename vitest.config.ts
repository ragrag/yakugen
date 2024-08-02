import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/**/*.{test,spec}.ts'],
        coverage: {
            provider: 'istanbul',
            reporter: ['lcov'],
            include: ['src/**/*.ts'],
        },
    },
});

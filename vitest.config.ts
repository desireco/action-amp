/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts', 'tests/**/*.spec.ts'],
        exclude: ['node_modules/**/*'],
    },
});
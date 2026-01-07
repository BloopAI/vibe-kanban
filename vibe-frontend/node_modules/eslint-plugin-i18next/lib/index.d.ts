import type { ESLint } from 'eslint';

declare const plugin: ESLint.Plugin & {
    configs: {
        'flat/recommended': ESLint.ConfigData;
        'recommended': ESLint.ConfigData;
    }
};

export = plugin;

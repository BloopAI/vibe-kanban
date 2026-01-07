/**
 * Create a `lowlight` instance.
 *
 * @param {Readonly<Record<string, LanguageFn>> | null | undefined} [grammars]
 *   Grammars to add (optional).
 * @returns
 *   Lowlight.
 */
export function createLowlight(grammars?: Readonly<Record<string, LanguageFn>> | null | undefined): {
    highlight: (language: string, value: string, options?: Readonly<Options> | null | undefined) => Root;
    highlightAuto: (value: string, options?: Readonly<AutoOptions> | null | undefined) => Root;
    listLanguages: () => Array<string>;
    register: {
        /**
         * Register languages.
         *
         * @example
         *   ```js
         *   import {createLowlight} from 'lowlight'
         *   import xml from 'highlight.js/lib/languages/xml'
         *
         *   const lowlight = createLowlight()
         *
         *   lowlight.register({xml})
         *
         *   // Note: `html` is an alias for `xml`.
         *   console.log(lowlight.highlight('html', '<em>Emphasis</em>'))
         *   ```
         *
         *   Yields:
         *
         *   ```js
         *   {type: 'root', children: [Array], data: {language: 'html', relevance: 2}}
         *   ```
         *
         * @overload
         * @param {Readonly<Record<string, LanguageFn>>} grammars
         * @returns {undefined}
         *
         * @overload
         * @param {string} name
         * @param {LanguageFn} grammar
         * @returns {undefined}
         *
         * @param {Readonly<Record<string, LanguageFn>> | string} grammarsOrName
         *   Grammars or programming language name.
         * @param {LanguageFn | undefined} [grammar]
         *   Grammar, if with name.
         * @returns {undefined}
         *   Nothing.
         */
        (grammars: Readonly<Record<string, LanguageFn>>): undefined;
        /**
         * Register languages.
         *
         * @example
         *   ```js
         *   import {createLowlight} from 'lowlight'
         *   import xml from 'highlight.js/lib/languages/xml'
         *
         *   const lowlight = createLowlight()
         *
         *   lowlight.register({xml})
         *
         *   // Note: `html` is an alias for `xml`.
         *   console.log(lowlight.highlight('html', '<em>Emphasis</em>'))
         *   ```
         *
         *   Yields:
         *
         *   ```js
         *   {type: 'root', children: [Array], data: {language: 'html', relevance: 2}}
         *   ```
         *
         * @overload
         * @param {Readonly<Record<string, LanguageFn>>} grammars
         * @returns {undefined}
         *
         * @overload
         * @param {string} name
         * @param {LanguageFn} grammar
         * @returns {undefined}
         *
         * @param {Readonly<Record<string, LanguageFn>> | string} grammarsOrName
         *   Grammars or programming language name.
         * @param {LanguageFn | undefined} [grammar]
         *   Grammar, if with name.
         * @returns {undefined}
         *   Nothing.
         */
        (name: string, grammar: LanguageFn): undefined;
    };
    registerAlias: {
        /**
         * Register aliases.
         *
         * @example
         *   ```js
         *   import {createLowlight} from 'lowlight'
         *   import markdown from 'highlight.js/lib/languages/markdown'
         *
         *   const lowlight = createLowlight()
         *
         *   lowlight.register({markdown})
         *
         *   // lowlight.highlight('mdown', '<em>Emphasis</em>')
         *   // ^ would throw: Error: Unknown language: `mdown` is not registered
         *
         *   lowlight.registerAlias({markdown: ['mdown', 'mkdn', 'mdwn', 'ron']})
         *   lowlight.highlight('mdown', '<em>Emphasis</em>')
         *   // ^ Works!
         *   ```
         *
         * @overload
         * @param {Readonly<Record<string, ReadonlyArray<string> | string>>} aliases
         * @returns {undefined}
         *
         * @overload
         * @param {string} language
         * @param {ReadonlyArray<string> | string} alias
         * @returns {undefined}
         *
         * @param {Readonly<Record<string, ReadonlyArray<string> | string>> | string} aliasesOrName
         *   Map of programming language names to one or more aliases, or programming
         *   language name.
         * @param {ReadonlyArray<string> | string | undefined} [alias]
         *   One or more aliases for the programming language, if with `name`.
         * @returns {undefined}
         *   Nothing.
         */
        (aliases: Readonly<Record<string, ReadonlyArray<string> | string>>): undefined;
        /**
         * Register aliases.
         *
         * @example
         *   ```js
         *   import {createLowlight} from 'lowlight'
         *   import markdown from 'highlight.js/lib/languages/markdown'
         *
         *   const lowlight = createLowlight()
         *
         *   lowlight.register({markdown})
         *
         *   // lowlight.highlight('mdown', '<em>Emphasis</em>')
         *   // ^ would throw: Error: Unknown language: `mdown` is not registered
         *
         *   lowlight.registerAlias({markdown: ['mdown', 'mkdn', 'mdwn', 'ron']})
         *   lowlight.highlight('mdown', '<em>Emphasis</em>')
         *   // ^ Works!
         *   ```
         *
         * @overload
         * @param {Readonly<Record<string, ReadonlyArray<string> | string>>} aliases
         * @returns {undefined}
         *
         * @overload
         * @param {string} language
         * @param {ReadonlyArray<string> | string} alias
         * @returns {undefined}
         *
         * @param {Readonly<Record<string, ReadonlyArray<string> | string>> | string} aliasesOrName
         *   Map of programming language names to one or more aliases, or programming
         *   language name.
         * @param {ReadonlyArray<string> | string | undefined} [alias]
         *   One or more aliases for the programming language, if with `name`.
         * @returns {undefined}
         *   Nothing.
         */
        (language: string, alias: ReadonlyArray<string> | string): undefined;
    };
    registered: (aliasOrName: string) => boolean;
};
/**
 * Extra fields.
 */
export type ExtraOptions = {
    /**
     * List of allowed languages (default: all registered languages).
     */
    subset?: ReadonlyArray<string> | null | undefined;
};
/**
 * Configuration for `highlight`.
 */
export type Options = {
    /**
     * Class prefix (default: `'hljs-'`).
     */
    prefix?: string | null | undefined;
};
/**
 * Configuration for `highlightAuto`.
 */
export type AutoOptions = Options & ExtraOptions;
import type { LanguageFn } from 'highlight.js';
import type { Root } from 'hast';
//# sourceMappingURL=index.d.ts.map
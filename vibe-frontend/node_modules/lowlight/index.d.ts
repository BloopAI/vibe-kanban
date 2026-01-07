export type {LanguageFn} from 'highlight.js'
export type {AutoOptions, Options} from './lib/index.js'
export {grammars as all} from './lib/all.js'
export {grammars as common} from './lib/common.js'
export {createLowlight} from './lib/index.js'

// Register data on hast.
declare module 'hast' {
  interface RootData {
    /**
     * Field exposed by `lowlight` to contain the detected programming language
     * name.
     */
    language?: string | undefined

    /**
     * Field exposed by `lowlight` to contain a relevance: how sure `lowlight`
     * is that the given code is in the language.
     */
    relevance?: number | undefined
  }
}

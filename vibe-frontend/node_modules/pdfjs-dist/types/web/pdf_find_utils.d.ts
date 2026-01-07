export namespace CharacterType {
    const SPACE: number;
    const ALPHA_LETTER: number;
    const PUNCT: number;
    const HAN_LETTER: number;
    const KATAKANA_LETTER: number;
    const HIRAGANA_LETTER: number;
    const HALFWIDTH_KATAKANA_LETTER: number;
    const THAI_LETTER: number;
}
/**
 * This function is based on the word-break detection implemented in:
 * https://hg.mozilla.org/mozilla-central/file/tip/intl/lwbrk/WordBreaker.cpp
 */
export function getCharacterType(charCode: any): number;

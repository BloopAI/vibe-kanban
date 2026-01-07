import { AnyConfig, ParsedClassName } from './types'

export const IMPORTANT_MODIFIER = '!'

const MODIFIER_SEPARATOR = ':'
const EMPTY_MODIFIERS: string[] = []

// Pre-allocated result object shape for consistency
const createResultObject = (
    modifiers: string[],
    hasImportantModifier: boolean,
    baseClassName: string,
    maybePostfixModifierPosition?: number,
    isExternal?: boolean,
): ParsedClassName => ({
    modifiers,
    hasImportantModifier,
    baseClassName,
    maybePostfixModifierPosition,
    isExternal,
})

export const createParseClassName = (config: AnyConfig) => {
    const { prefix, experimentalParseClassName } = config

    /**
     * Parse class name into parts.
     *
     * Inspired by `splitAtTopLevelOnly` used in Tailwind CSS
     * @see https://github.com/tailwindlabs/tailwindcss/blob/v3.2.2/src/util/splitAtTopLevelOnly.js
     */
    let parseClassName = (className: string): ParsedClassName => {
        // Use simple array with push for better performance
        const modifiers: string[] = []

        let bracketDepth = 0
        let parenDepth = 0
        let modifierStart = 0
        let postfixModifierPosition: number | undefined

        const len = className.length
        for (let index = 0; index < len; index++) {
            const currentCharacter = className[index]!

            if (bracketDepth === 0 && parenDepth === 0) {
                if (currentCharacter === MODIFIER_SEPARATOR) {
                    modifiers.push(className.slice(modifierStart, index))
                    modifierStart = index + 1
                    continue
                }

                if (currentCharacter === '/') {
                    postfixModifierPosition = index
                    continue
                }
            }

            if (currentCharacter === '[') bracketDepth++
            else if (currentCharacter === ']') bracketDepth--
            else if (currentCharacter === '(') parenDepth++
            else if (currentCharacter === ')') parenDepth--
        }

        const baseClassNameWithImportantModifier =
            modifiers.length === 0 ? className : className.slice(modifierStart)

        // Inline important modifier check
        let baseClassName = baseClassNameWithImportantModifier
        let hasImportantModifier = false

        if (baseClassNameWithImportantModifier.endsWith(IMPORTANT_MODIFIER)) {
            baseClassName = baseClassNameWithImportantModifier.slice(0, -1)
            hasImportantModifier = true
        } else if (
            /**
             * In Tailwind CSS v3 the important modifier was at the start of the base class name. This is still supported for legacy reasons.
             * @see https://github.com/dcastil/tailwind-merge/issues/513#issuecomment-2614029864
             */
            baseClassNameWithImportantModifier.startsWith(IMPORTANT_MODIFIER)
        ) {
            baseClassName = baseClassNameWithImportantModifier.slice(1)
            hasImportantModifier = true
        }

        const maybePostfixModifierPosition =
            postfixModifierPosition && postfixModifierPosition > modifierStart
                ? postfixModifierPosition - modifierStart
                : undefined

        return createResultObject(
            modifiers,
            hasImportantModifier,
            baseClassName,
            maybePostfixModifierPosition,
        )
    }

    if (prefix) {
        const fullPrefix = prefix + MODIFIER_SEPARATOR
        const parseClassNameOriginal = parseClassName
        parseClassName = (className: string) =>
            className.startsWith(fullPrefix)
                ? parseClassNameOriginal(className.slice(fullPrefix.length))
                : createResultObject(EMPTY_MODIFIERS, false, className, undefined, true)
    }

    if (experimentalParseClassName) {
        const parseClassNameOriginal = parseClassName
        parseClassName = (className: string) =>
            experimentalParseClassName({ className, parseClassName: parseClassNameOriginal })
    }

    return parseClassName
}

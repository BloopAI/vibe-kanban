/**
 * @import {ElementContent, Element, Root} from 'hast'
 * @import {LanguageFn} from 'lowlight'
 * @import {VFile} from 'vfile'
 */

/**
 * @typedef Options
 *   Configuration (optional).
 * @property {Readonly<Record<string, ReadonlyArray<string> | string>> | null | undefined} [aliases={}]
 *   Register more aliases (optional);
 *   passed to `lowlight.registerAlias`.
 * @property {boolean | null | undefined} [detect=false]
 *   Highlight code without language classes by guessing its programming
 *   language (default: `false`).
 * @property {Readonly<Record<string, LanguageFn>> | null | undefined} [languages]
 *   Register languages (default: `common`);
 *   passed to `lowlight.register`.
 * @property {ReadonlyArray<string> | null | undefined} [plainText=[]]
 *   List of language names to not highlight (optional);
 *   note you can also add `no-highlight` classes.
 * @property {string | null | undefined} [prefix='hljs-']
 *   Class prefix (default: `'hljs-'`).
 * @property {ReadonlyArray<string> | null | undefined} [subset]
 *   Names of languages to check when detecting (default: all registered
 *   languages).
 */

import {toText} from 'hast-util-to-text'
import {common, createLowlight} from 'lowlight'
import {visit} from 'unist-util-visit'

/** @type {Options} */
const emptyOptions = {}

/**
 * Apply syntax highlighting.
 *
 * @param {Readonly<Options> | null | undefined} [options]
 *   Configuration (optional).
 * @returns
 *   Transform.
 */
export default function rehypeHighlight(options) {
  const settings = options || emptyOptions
  const aliases = settings.aliases
  const detect = settings.detect || false
  const languages = settings.languages || common
  const plainText = settings.plainText
  const prefix = settings.prefix
  const subset = settings.subset
  let name = 'hljs'

  const lowlight = createLowlight(languages)

  if (aliases) {
    lowlight.registerAlias(aliases)
  }

  if (prefix) {
    const pos = prefix.indexOf('-')
    name = pos === -1 ? prefix : prefix.slice(0, pos)
  }

  /**
   * Transform.
   *
   * @param {Root} tree
   *   Tree.
   * @param {VFile} file
   *   File.
   * @returns {undefined}
   *   Nothing.
   */
  return function (tree, file) {
    visit(tree, 'element', function (node, _, parent) {
      if (
        node.tagName !== 'code' ||
        !parent ||
        parent.type !== 'element' ||
        parent.tagName !== 'pre'
      ) {
        return
      }

      const lang = language(node)

      if (
        lang === false ||
        (!lang && !detect) ||
        (lang && plainText && plainText.includes(lang))
      ) {
        return
      }

      if (!Array.isArray(node.properties.className)) {
        node.properties.className = []
      }

      if (!node.properties.className.includes(name)) {
        node.properties.className.unshift(name)
      }

      const text = toText(node, {whitespace: 'pre'})
      /** @type {Root} */
      let result

      try {
        result = lang
          ? lowlight.highlight(lang, text, {prefix})
          : lowlight.highlightAuto(text, {prefix, subset})
      } catch (error) {
        const cause = /** @type {Error} */ (error)

        if (lang && /Unknown language/.test(cause.message)) {
          file.message(
            'Cannot highlight as `' + lang + '`, it’s not registered',
            {
              ancestors: [parent, node],
              cause,
              place: node.position,
              ruleId: 'missing-language',
              source: 'rehype-highlight'
            }
          )

          /* c8 ignore next 5 -- throw arbitrary hljs errors */
          return
        }

        throw cause
      }

      if (!lang && result.data && result.data.language) {
        node.properties.className.push('language-' + result.data.language)
      }

      if (result.children.length > 0) {
        node.children = /** @type {Array<ElementContent>} */ (result.children)
      }
    })
  }
}

/**
 * Get the programming language of `node`.
 *
 * @param {Element} node
 *   Node.
 * @returns {false | string | undefined}
 *   Language or `undefined`, or `false` when an explikcit `no-highlight` class
 *   is used.
 */
function language(node) {
  const list = node.properties.className
  let index = -1

  if (!Array.isArray(list)) {
    return
  }

  /** @type {string | undefined} */
  let name

  while (++index < list.length) {
    const value = String(list[index])

    if (value === 'no-highlight' || value === 'nohighlight') {
      return false
    }

    if (!name && value.slice(0, 5) === 'lang-') {
      name = value.slice(5)
    }

    if (!name && value.slice(0, 9) === 'language-') {
      name = value.slice(9)
    }
  }

  return name
}

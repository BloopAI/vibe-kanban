/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 * See LICENSE file in root directory for full license.
 */
"use strict"

const path = require("path")
const needle = `${path.sep}node_modules${path.sep}eslint${path.sep}`

module.exports = () => {
    const eslintPaths = new Set(
        Object.keys(require.cache)
            .filter(id => id.includes(needle))
            .map(id => id.slice(0, id.indexOf(needle) + needle.length))
    )
    const linters = []

    for (const eslintPath of eslintPaths) {
        try {
            const linter = require(eslintPath).Linter

            if (linter) {
                linters.push(linter)
            }
        } catch (error) {
            if (error.code !== "MODULE_NOT_FOUND") {
                throw error
            }
        }
    }

    return linters
}

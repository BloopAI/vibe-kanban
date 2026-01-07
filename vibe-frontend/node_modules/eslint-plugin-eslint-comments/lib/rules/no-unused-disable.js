/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 * See LICENSE file in root directory for full license.
 */
"use strict"

// Patch `Linter#verify` to work.
require("../utils/patch")()

module.exports = {
    meta: {
        docs: {
            description: "disallow unused `eslint-disable` comments",
            category: "Best Practices",
            recommended: false,
            url:
                "https://mysticatea.github.io/eslint-plugin-eslint-comments/rules/no-unused-disable.html",
        },
        fixable: null,
        schema: [],
        type: "problem",
    },

    create() {
        // This rule patches `Linter#verify` method and:
        //
        // 1. enables `reportUnusedDisableDirectives` option.
        // 2. verifies the code.
        // 3. converts `reportUnusedDisableDirectives` errors to `no-unused-disable` errors.
        //
        // So this rule itself does nothing.
        return {}
    },
}

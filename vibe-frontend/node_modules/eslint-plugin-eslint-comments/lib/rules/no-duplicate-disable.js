/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 * See LICENSE file in root directory for full license.
 */
"use strict"

const DisabledArea = require("../internal/disabled-area")
const utils = require("../internal/utils")

module.exports = {
    meta: {
        docs: {
            description: "disallow duplicate `eslint-disable` comments",
            category: "Best Practices",
            recommended: true,
            url:
                "https://mysticatea.github.io/eslint-plugin-eslint-comments/rules/no-duplicate-disable.html",
        },
        fixable: null,
        schema: [],
        type: "problem",
    },

    create(context) {
        const sourceCode = context.getSourceCode()
        const disabledArea = DisabledArea.get(sourceCode)

        return {
            Program() {
                for (const item of disabledArea.duplicateDisableDirectives) {
                    context.report({
                        loc: utils.toRuleIdLocation(item.comment, item.ruleId),
                        message: item.ruleId
                            ? "'{{ruleId}}' rule has been disabled already."
                            : "ESLint rules have been disabled already.",
                        data: item,
                    })
                }
            },
        }
    },
}

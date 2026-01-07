/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 * See LICENSE file in root directory for full license.
 */
"use strict"

const ignore = require("ignore")
const DisabledArea = require("../internal/disabled-area")
const utils = require("../internal/utils")

module.exports = {
    meta: {
        docs: {
            description:
                "disallow `eslint-disable` comments about specific rules",
            category: "Stylistic Issues",
            recommended: false,
            url:
                "https://mysticatea.github.io/eslint-plugin-eslint-comments/rules/no-restricted-disable.html",
        },
        fixable: null,
        schema: {
            type: "array",
            items: { type: "string" },
            uniqueItems: true,
        },
        type: "suggestion",
    },

    create(context) {
        const sourceCode = context.getSourceCode()
        const disabledArea = DisabledArea.get(sourceCode)

        if (context.options.length === 0) {
            return {}
        }

        const ig = ignore()
        for (const pattern of context.options) {
            ig.add(pattern)
        }

        return {
            Program() {
                for (const area of disabledArea.areas) {
                    if (area.ruleId == null || ig.ignores(area.ruleId)) {
                        context.report({
                            loc: utils.toRuleIdLocation(
                                area.comment,
                                area.ruleId
                            ),
                            message: "Disabling '{{ruleId}}' is not allowed.",
                            data: {
                                ruleId: area.ruleId || String(context.options),
                            },
                        })
                    }
                }
            },
        }
    },
}

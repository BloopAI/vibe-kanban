/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 * See LICENSE file in root directory for full license.
 */
"use strict"

const utils = require("../internal/utils")

module.exports = {
    meta: {
        docs: {
            description: "disallow ESLint directive-comments",
            category: "Stylistic Issues",
            recommended: false,
            url:
                "https://mysticatea.github.io/eslint-plugin-eslint-comments/rules/no-use.html",
        },
        fixable: null,
        schema: [
            {
                type: "object",
                properties: {
                    allow: {
                        type: "array",
                        items: {
                            enum: [
                                "eslint",
                                "eslint-disable",
                                "eslint-disable-line",
                                "eslint-disable-next-line",
                                "eslint-enable",
                                "eslint-env",
                                "exported",
                                "global",
                                "globals",
                            ],
                        },
                        additionalItems: false,
                        uniqueItems: true,
                    },
                },
                additionalProperties: false,
            },
        ],
        type: "suggestion",
    },

    create(context) {
        const sourceCode = context.getSourceCode()
        const allowed = new Set(
            (context.options[0] && context.options[0].allow) || []
        )

        return {
            Program() {
                for (const comment of sourceCode.getAllComments()) {
                    const directiveComment = utils.parseDirectiveComment(
                        comment
                    )
                    if (directiveComment == null) {
                        continue
                    }

                    if (!allowed.has(directiveComment.kind)) {
                        context.report({
                            loc: utils.toForceLocation(comment.loc),
                            message: "Unexpected ESLint directive comment.",
                        })
                    }
                }
            },
        }
    },
}

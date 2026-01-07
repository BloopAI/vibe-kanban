/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 * See LICENSE file in root directory for full license.
 */
"use strict"

const utils = require("./utils")
const DELIMITER = /[\s,]+/gu
const pool = new WeakMap()

module.exports = class DisabledArea {
    /**
     * Get singleton instance for the given source code.
     *
     * @param {eslint.SourceCode} sourceCode - The source code to get.
     * @returns {DisabledArea} The singleton object for the source code.
     */
    static get(sourceCode) {
        let retv = pool.get(sourceCode.ast)

        if (retv == null) {
            retv = new DisabledArea()
            retv._scan(sourceCode)
            pool.set(sourceCode.ast, retv)
        }

        return retv
    }

    /**
     * Constructor.
     */
    constructor() {
        this.areas = []
        this.duplicateDisableDirectives = []
        this.unusedEnableDirectives = []
        this.numberOfRelatedDisableDirectives = new Map()
    }

    /**
     * Make disabled area.
     *
     * @param {Token} comment - The comment token to disable.
     * @param {object} location - The start location to disable.
     * @param {string[]|null} ruleIds - The ruleId names to disable.
     * @param {string} kind - The kind of disable-comments.
     * @returns {void}
     * @private
     */
    _disable(comment, location, ruleIds, kind) {
        if (ruleIds) {
            for (const ruleId of ruleIds) {
                if (this._getArea(ruleId, location) != null) {
                    this.duplicateDisableDirectives.push({ comment, ruleId })
                }

                this.areas.push({
                    comment,
                    ruleId,
                    kind,
                    start: location,
                    end: null,
                })
            }
        } else {
            if (this._getArea(null, location) != null) {
                this.duplicateDisableDirectives.push({ comment, ruleId: null })
            }

            this.areas.push({
                comment,
                ruleId: null,
                kind,
                start: location,
                end: null,
            })
        }
    }

    /**
     * Close disabled area.
     *
     * @param {Token} comment - The comment token to enable.
     * @param {object} location - The start location to enable.
     * @param {string[]|null} ruleIds - The ruleId names to enable.
     * @param {string} kind - The kind of disable-comments.
     * @returns {void}
     * @private
     */
    _enable(comment, location, ruleIds, kind) {
        const relatedDisableDirectives = new Set()

        if (ruleIds) {
            for (const ruleId of ruleIds) {
                let used = false

                for (let i = this.areas.length - 1; i >= 0; --i) {
                    const area = this.areas[i]

                    if (
                        area.end === null &&
                        area.kind === kind &&
                        area.ruleId === ruleId
                    ) {
                        relatedDisableDirectives.add(area.comment)
                        area.end = location
                        used = true
                    }
                }

                if (!used) {
                    this.unusedEnableDirectives.push({ comment, ruleId })
                }
            }
        } else {
            let used = false

            for (let i = this.areas.length - 1; i >= 0; --i) {
                const area = this.areas[i]

                if (area.end === null && area.kind === kind) {
                    relatedDisableDirectives.add(area.comment)
                    area.end = location
                    used = true
                }
            }

            if (!used) {
                this.unusedEnableDirectives.push({ comment, ruleId: null })
            }
        }

        this.numberOfRelatedDisableDirectives.set(
            comment,
            relatedDisableDirectives.size
        )
    }

    /**
     * Gets the area of the given ruleId and location.
     *
     * @param {string|null} ruleId - The ruleId name to get.
     * @param {object} location - The location to get.
     * @returns {object|null} The area of the given ruleId and location.
     * @private
     */
    _getArea(ruleId, location) {
        for (let i = this.areas.length - 1; i >= 0; --i) {
            const area = this.areas[i]

            if (
                (area.ruleId === null || area.ruleId === ruleId) &&
                utils.lte(area.start, location) &&
                (area.end === null || utils.lte(location, area.end))
            ) {
                return area
            }
        }

        return null
    }

    /**
     * Scan the source code and setup disabled area list.
     *
     * @param {eslint.SourceCode} sourceCode - The source code to scan.
     * @returns {void}
     * @private
     */
    _scan(sourceCode) {
        for (const comment of sourceCode.getAllComments()) {
            const directiveComment = utils.parseDirectiveComment(comment)
            if (directiveComment == null) {
                continue
            }

            const kind = directiveComment.kind
            if (
                kind !== "eslint-disable" &&
                kind !== "eslint-enable" &&
                kind !== "eslint-disable-line" &&
                kind !== "eslint-disable-next-line"
            ) {
                continue
            }
            const ruleIds = directiveComment.value
                ? directiveComment.value.split(DELIMITER)
                : null

            if (kind === "eslint-disable") {
                this._disable(comment, comment.loc.start, ruleIds, "block")
            } else if (kind === "eslint-enable") {
                this._enable(comment, comment.loc.start, ruleIds, "block")
            } else if (kind === "eslint-disable-line") {
                const line = comment.loc.start.line
                const start = { line, column: 0 }
                const end = { line: line + 1, column: -1 }

                this._disable(comment, start, ruleIds, "line")
                this._enable(comment, end, ruleIds, "line")
            } else if (kind === "eslint-disable-next-line") {
                const line = comment.loc.start.line
                const start = { line: line + 1, column: 0 }
                const end = { line: line + 2, column: -1 }

                this._disable(comment, start, ruleIds, "line")
                this._enable(comment, end, ruleIds, "line")
            }
        }
    }
}

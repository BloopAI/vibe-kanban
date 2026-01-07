"use strict";
var _plugin = /*#__PURE__*/ _interopRequireDefault(require("tailwindcss/plugin"));
function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
module.exports = (0, _plugin.default)(function containerQueries(param) {
    var matchUtilities = param.matchUtilities, matchVariant = param.matchVariant, theme = param.theme;
    var parseValue = function parseValue(value) {
        var _value_match;
        var _value_match_;
        var numericValue = (_value_match_ = (_value_match = value.match(/^(\d+\.\d+|\d+|\.\d+)\D+/)) === null || _value_match === void 0 ? void 0 : _value_match[1]) !== null && _value_match_ !== void 0 ? _value_match_ : null;
        if (numericValue === null) return null;
        return parseFloat(value);
    };
    var _theme;
    var values = (_theme = theme("containers")) !== null && _theme !== void 0 ? _theme : {};
    matchUtilities({
        "@container": function(value, param) {
            var modifier = param.modifier;
            return {
                "container-type": value,
                "container-name": modifier
            };
        }
    }, {
        values: {
            DEFAULT: "inline-size",
            normal: "normal"
        },
        modifiers: "any"
    });
    matchVariant("@", function() {
        var value = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : "", modifier = (arguments.length > 1 ? arguments[1] : void 0).modifier;
        var parsed = parseValue(value);
        return parsed !== null ? "@container ".concat(modifier !== null && modifier !== void 0 ? modifier : "", " (min-width: ").concat(value, ")") : [];
    }, {
        values: values,
        sort: function sort(aVariant, zVariant) {
            var a = parseFloat(aVariant.value);
            var z = parseFloat(zVariant.value);
            if (a === null || z === null) return 0;
            // Sort values themselves regardless of unit
            if (a - z !== 0) return a - z;
            var _aVariant_modifier;
            var aLabel = (_aVariant_modifier = aVariant.modifier) !== null && _aVariant_modifier !== void 0 ? _aVariant_modifier : "";
            var _zVariant_modifier;
            var zLabel = (_zVariant_modifier = zVariant.modifier) !== null && _zVariant_modifier !== void 0 ? _zVariant_modifier : "";
            // Explicitly move empty labels to the end
            if (aLabel === "" && zLabel !== "") {
                return 1;
            } else if (aLabel !== "" && zLabel === "") {
                return -1;
            }
            // Sort labels alphabetically in the English locale
            // We are intentionally overriding the locale because we do not want the sort to
            // be affected by the machine's locale (be it a developer or CI environment)
            return aLabel.localeCompare(zLabel, "en", {
                numeric: true
            });
        }
    });
}, {
    theme: {
        containers: {
            xs: "20rem",
            sm: "24rem",
            md: "28rem",
            lg: "32rem",
            xl: "36rem",
            "2xl": "42rem",
            "3xl": "48rem",
            "4xl": "56rem",
            "5xl": "64rem",
            "6xl": "72rem",
            "7xl": "80rem"
        }
    }
});

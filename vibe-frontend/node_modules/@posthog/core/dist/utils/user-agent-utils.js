"use strict";
var __webpack_require__ = {};
(()=>{
    __webpack_require__.d = (exports1, definition)=>{
        for(var key in definition)if (__webpack_require__.o(definition, key) && !__webpack_require__.o(exports1, key)) Object.defineProperty(exports1, key, {
            enumerable: true,
            get: definition[key]
        });
    };
})();
(()=>{
    __webpack_require__.o = (obj, prop)=>Object.prototype.hasOwnProperty.call(obj, prop);
})();
(()=>{
    __webpack_require__.r = (exports1)=>{
        if ('undefined' != typeof Symbol && Symbol.toStringTag) Object.defineProperty(exports1, Symbol.toStringTag, {
            value: 'Module'
        });
        Object.defineProperty(exports1, '__esModule', {
            value: true
        });
    };
})();
var __webpack_exports__ = {};
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
    detectDeviceType: ()=>detectDeviceType,
    detectOS: ()=>detectOS,
    detectDevice: ()=>detectDevice,
    detectBrowser: ()=>detectBrowser,
    detectBrowserVersion: ()=>detectBrowserVersion
});
const external_string_utils_js_namespaceObject = require("./string-utils.js");
const external_type_utils_js_namespaceObject = require("./type-utils.js");
const FACEBOOK = 'Facebook';
const MOBILE = 'Mobile';
const IOS = 'iOS';
const ANDROID = 'Android';
const TABLET = 'Tablet';
const ANDROID_TABLET = ANDROID + ' ' + TABLET;
const IPAD = 'iPad';
const APPLE = 'Apple';
const APPLE_WATCH = APPLE + ' Watch';
const SAFARI = 'Safari';
const BLACKBERRY = 'BlackBerry';
const SAMSUNG = 'Samsung';
const SAMSUNG_BROWSER = SAMSUNG + 'Browser';
const SAMSUNG_INTERNET = SAMSUNG + ' Internet';
const CHROME = 'Chrome';
const CHROME_OS = CHROME + ' OS';
const CHROME_IOS = CHROME + ' ' + IOS;
const INTERNET_EXPLORER = 'Internet Explorer';
const INTERNET_EXPLORER_MOBILE = INTERNET_EXPLORER + ' ' + MOBILE;
const OPERA = 'Opera';
const OPERA_MINI = OPERA + ' Mini';
const EDGE = 'Edge';
const MICROSOFT_EDGE = 'Microsoft ' + EDGE;
const FIREFOX = 'Firefox';
const FIREFOX_IOS = FIREFOX + ' ' + IOS;
const NINTENDO = 'Nintendo';
const PLAYSTATION = 'PlayStation';
const XBOX = 'Xbox';
const ANDROID_MOBILE = ANDROID + ' ' + MOBILE;
const MOBILE_SAFARI = MOBILE + ' ' + SAFARI;
const WINDOWS = 'Windows';
const WINDOWS_PHONE = WINDOWS + ' Phone';
const NOKIA = 'Nokia';
const OUYA = 'Ouya';
const GENERIC = 'Generic';
const GENERIC_MOBILE = GENERIC + ' ' + MOBILE.toLowerCase();
const GENERIC_TABLET = GENERIC + ' ' + TABLET.toLowerCase();
const KONQUEROR = 'Konqueror';
const BROWSER_VERSION_REGEX_SUFFIX = '(\\d+(\\.\\d+)?)';
const DEFAULT_BROWSER_VERSION_REGEX = new RegExp('Version/' + BROWSER_VERSION_REGEX_SUFFIX);
const XBOX_REGEX = new RegExp(XBOX, 'i');
const PLAYSTATION_REGEX = new RegExp(PLAYSTATION + ' \\w+', 'i');
const NINTENDO_REGEX = new RegExp(NINTENDO + ' \\w+', 'i');
const BLACKBERRY_REGEX = new RegExp(BLACKBERRY + '|PlayBook|BB10', 'i');
const windowsVersionMap = {
    'NT3.51': 'NT 3.11',
    'NT4.0': 'NT 4.0',
    '5.0': '2000',
    '5.1': 'XP',
    '5.2': 'XP',
    '6.0': 'Vista',
    '6.1': '7',
    '6.2': '8',
    '6.3': '8.1',
    '6.4': '10',
    '10.0': '10'
};
function isSafari(userAgent) {
    return (0, external_string_utils_js_namespaceObject.includes)(userAgent, SAFARI) && !(0, external_string_utils_js_namespaceObject.includes)(userAgent, CHROME) && !(0, external_string_utils_js_namespaceObject.includes)(userAgent, ANDROID);
}
const safariCheck = (ua, vendor)=>vendor && (0, external_string_utils_js_namespaceObject.includes)(vendor, APPLE) || isSafari(ua);
const detectBrowser = function(user_agent, vendor) {
    vendor = vendor || '';
    if ((0, external_string_utils_js_namespaceObject.includes)(user_agent, ' OPR/') && (0, external_string_utils_js_namespaceObject.includes)(user_agent, 'Mini')) return OPERA_MINI;
    if ((0, external_string_utils_js_namespaceObject.includes)(user_agent, ' OPR/')) return OPERA;
    if (BLACKBERRY_REGEX.test(user_agent)) return BLACKBERRY;
    if ((0, external_string_utils_js_namespaceObject.includes)(user_agent, 'IE' + MOBILE) || (0, external_string_utils_js_namespaceObject.includes)(user_agent, 'WPDesktop')) return INTERNET_EXPLORER_MOBILE;
    if ((0, external_string_utils_js_namespaceObject.includes)(user_agent, SAMSUNG_BROWSER)) return SAMSUNG_INTERNET;
    else if ((0, external_string_utils_js_namespaceObject.includes)(user_agent, EDGE) || (0, external_string_utils_js_namespaceObject.includes)(user_agent, 'Edg/')) return MICROSOFT_EDGE;
    else if ((0, external_string_utils_js_namespaceObject.includes)(user_agent, 'FBIOS')) return FACEBOOK + ' ' + MOBILE;
    else if ((0, external_string_utils_js_namespaceObject.includes)(user_agent, 'UCWEB') || (0, external_string_utils_js_namespaceObject.includes)(user_agent, 'UCBrowser')) return 'UC Browser';
    else if ((0, external_string_utils_js_namespaceObject.includes)(user_agent, 'CriOS')) return CHROME_IOS;
    else if ((0, external_string_utils_js_namespaceObject.includes)(user_agent, 'CrMo')) return CHROME;
    else if ((0, external_string_utils_js_namespaceObject.includes)(user_agent, CHROME)) return CHROME;
    else if ((0, external_string_utils_js_namespaceObject.includes)(user_agent, ANDROID) && (0, external_string_utils_js_namespaceObject.includes)(user_agent, SAFARI)) return ANDROID_MOBILE;
    else if ((0, external_string_utils_js_namespaceObject.includes)(user_agent, 'FxiOS')) return FIREFOX_IOS;
    else if ((0, external_string_utils_js_namespaceObject.includes)(user_agent.toLowerCase(), KONQUEROR.toLowerCase())) return KONQUEROR;
    else if (safariCheck(user_agent, vendor)) return (0, external_string_utils_js_namespaceObject.includes)(user_agent, MOBILE) ? MOBILE_SAFARI : SAFARI;
    else if ((0, external_string_utils_js_namespaceObject.includes)(user_agent, FIREFOX)) return FIREFOX;
    else if ((0, external_string_utils_js_namespaceObject.includes)(user_agent, 'MSIE') || (0, external_string_utils_js_namespaceObject.includes)(user_agent, 'Trident/')) return INTERNET_EXPLORER;
    else if ((0, external_string_utils_js_namespaceObject.includes)(user_agent, 'Gecko')) return FIREFOX;
    return '';
};
const versionRegexes = {
    [INTERNET_EXPLORER_MOBILE]: [
        new RegExp('rv:' + BROWSER_VERSION_REGEX_SUFFIX)
    ],
    [MICROSOFT_EDGE]: [
        new RegExp(EDGE + '?\\/' + BROWSER_VERSION_REGEX_SUFFIX)
    ],
    [CHROME]: [
        new RegExp('(' + CHROME + '|CrMo)\\/' + BROWSER_VERSION_REGEX_SUFFIX)
    ],
    [CHROME_IOS]: [
        new RegExp('CriOS\\/' + BROWSER_VERSION_REGEX_SUFFIX)
    ],
    'UC Browser': [
        new RegExp('(UCBrowser|UCWEB)\\/' + BROWSER_VERSION_REGEX_SUFFIX)
    ],
    [SAFARI]: [
        DEFAULT_BROWSER_VERSION_REGEX
    ],
    [MOBILE_SAFARI]: [
        DEFAULT_BROWSER_VERSION_REGEX
    ],
    [OPERA]: [
        new RegExp('(' + OPERA + '|OPR)\\/' + BROWSER_VERSION_REGEX_SUFFIX)
    ],
    [FIREFOX]: [
        new RegExp(FIREFOX + '\\/' + BROWSER_VERSION_REGEX_SUFFIX)
    ],
    [FIREFOX_IOS]: [
        new RegExp('FxiOS\\/' + BROWSER_VERSION_REGEX_SUFFIX)
    ],
    [KONQUEROR]: [
        new RegExp('Konqueror[:/]?' + BROWSER_VERSION_REGEX_SUFFIX, 'i')
    ],
    [BLACKBERRY]: [
        new RegExp(BLACKBERRY + ' ' + BROWSER_VERSION_REGEX_SUFFIX),
        DEFAULT_BROWSER_VERSION_REGEX
    ],
    [ANDROID_MOBILE]: [
        new RegExp('android\\s' + BROWSER_VERSION_REGEX_SUFFIX, 'i')
    ],
    [SAMSUNG_INTERNET]: [
        new RegExp(SAMSUNG_BROWSER + '\\/' + BROWSER_VERSION_REGEX_SUFFIX)
    ],
    [INTERNET_EXPLORER]: [
        new RegExp('(rv:|MSIE )' + BROWSER_VERSION_REGEX_SUFFIX)
    ],
    Mozilla: [
        new RegExp('rv:' + BROWSER_VERSION_REGEX_SUFFIX)
    ]
};
const detectBrowserVersion = function(userAgent, vendor) {
    const browser = detectBrowser(userAgent, vendor);
    const regexes = versionRegexes[browser];
    if ((0, external_type_utils_js_namespaceObject.isUndefined)(regexes)) return null;
    for(let i = 0; i < regexes.length; i++){
        const regex = regexes[i];
        const matches = userAgent.match(regex);
        if (matches) return parseFloat(matches[matches.length - 2]);
    }
    return null;
};
const osMatchers = [
    [
        new RegExp(XBOX + '; ' + XBOX + ' (.*?)[);]', 'i'),
        (match)=>[
                XBOX,
                match && match[1] || ''
            ]
    ],
    [
        new RegExp(NINTENDO, 'i'),
        [
            NINTENDO,
            ''
        ]
    ],
    [
        new RegExp(PLAYSTATION, 'i'),
        [
            PLAYSTATION,
            ''
        ]
    ],
    [
        BLACKBERRY_REGEX,
        [
            BLACKBERRY,
            ''
        ]
    ],
    [
        new RegExp(WINDOWS, 'i'),
        (_, user_agent)=>{
            if (/Phone/.test(user_agent) || /WPDesktop/.test(user_agent)) return [
                WINDOWS_PHONE,
                ''
            ];
            if (new RegExp(MOBILE).test(user_agent) && !/IEMobile\b/.test(user_agent)) return [
                WINDOWS + ' ' + MOBILE,
                ''
            ];
            const match = /Windows NT ([0-9.]+)/i.exec(user_agent);
            if (match && match[1]) {
                const version = match[1];
                let osVersion = windowsVersionMap[version] || '';
                if (/arm/i.test(user_agent)) osVersion = 'RT';
                return [
                    WINDOWS,
                    osVersion
                ];
            }
            return [
                WINDOWS,
                ''
            ];
        }
    ],
    [
        /((iPhone|iPad|iPod).*?OS (\d+)_(\d+)_?(\d+)?|iPhone)/,
        (match)=>{
            if (match && match[3]) {
                const versionParts = [
                    match[3],
                    match[4],
                    match[5] || '0'
                ];
                return [
                    IOS,
                    versionParts.join('.')
                ];
            }
            return [
                IOS,
                ''
            ];
        }
    ],
    [
        /(watch.*\/(\d+\.\d+\.\d+)|watch os,(\d+\.\d+),)/i,
        (match)=>{
            let version = '';
            if (match && match.length >= 3) version = (0, external_type_utils_js_namespaceObject.isUndefined)(match[2]) ? match[3] : match[2];
            return [
                'watchOS',
                version
            ];
        }
    ],
    [
        new RegExp('(' + ANDROID + ' (\\d+)\\.(\\d+)\\.?(\\d+)?|' + ANDROID + ')', 'i'),
        (match)=>{
            if (match && match[2]) {
                const versionParts = [
                    match[2],
                    match[3],
                    match[4] || '0'
                ];
                return [
                    ANDROID,
                    versionParts.join('.')
                ];
            }
            return [
                ANDROID,
                ''
            ];
        }
    ],
    [
        /Mac OS X (\d+)[_.](\d+)[_.]?(\d+)?/i,
        (match)=>{
            const result = [
                'Mac OS X',
                ''
            ];
            if (match && match[1]) {
                const versionParts = [
                    match[1],
                    match[2],
                    match[3] || '0'
                ];
                result[1] = versionParts.join('.');
            }
            return result;
        }
    ],
    [
        /Mac/i,
        [
            'Mac OS X',
            ''
        ]
    ],
    [
        /CrOS/,
        [
            CHROME_OS,
            ''
        ]
    ],
    [
        /Linux|debian/i,
        [
            'Linux',
            ''
        ]
    ]
];
const detectOS = function(user_agent) {
    for(let i = 0; i < osMatchers.length; i++){
        const [rgex, resultOrFn] = osMatchers[i];
        const match = rgex.exec(user_agent);
        const result = match && ((0, external_type_utils_js_namespaceObject.isFunction)(resultOrFn) ? resultOrFn(match, user_agent) : resultOrFn);
        if (result) return result;
    }
    return [
        '',
        ''
    ];
};
const detectDevice = function(user_agent) {
    if (NINTENDO_REGEX.test(user_agent)) return NINTENDO;
    if (PLAYSTATION_REGEX.test(user_agent)) return PLAYSTATION;
    if (XBOX_REGEX.test(user_agent)) return XBOX;
    if (new RegExp(OUYA, 'i').test(user_agent)) return OUYA;
    if (new RegExp('(' + WINDOWS_PHONE + '|WPDesktop)', 'i').test(user_agent)) return WINDOWS_PHONE;
    else if (/iPad/.test(user_agent)) return IPAD;
    else if (/iPod/.test(user_agent)) return 'iPod Touch';
    else if (/iPhone/.test(user_agent)) return 'iPhone';
    else if (/(watch)(?: ?os[,/]|\d,\d\/)[\d.]+/i.test(user_agent)) return APPLE_WATCH;
    else if (BLACKBERRY_REGEX.test(user_agent)) return BLACKBERRY;
    else if (/(kobo)\s(ereader|touch)/i.test(user_agent)) return 'Kobo';
    else if (new RegExp(NOKIA, 'i').test(user_agent)) return NOKIA;
    else if (/(kf[a-z]{2}wi|aeo[c-r]{2})( bui|\))/i.test(user_agent) || /(kf[a-z]+)( bui|\)).+silk\//i.test(user_agent)) return 'Kindle Fire';
    else if (/(Android|ZTE)/i.test(user_agent)) if (!(!new RegExp(MOBILE).test(user_agent) || /(9138B|TB782B|Nexus [97]|pixel c|HUAWEISHT|BTV|noble nook|smart ultra 6)/i.test(user_agent))) return ANDROID;
    else {
        if (/pixel[\daxl ]{1,6}/i.test(user_agent) && !/pixel c/i.test(user_agent) || /(huaweimed-al00|tah-|APA|SM-G92|i980|zte|U304AA)/i.test(user_agent) || /lmy47v/i.test(user_agent) && !/QTAQZ3/i.test(user_agent)) return ANDROID;
        return ANDROID_TABLET;
    }
    else if (new RegExp('(pda|' + MOBILE + ')', 'i').test(user_agent)) return GENERIC_MOBILE;
    else if (new RegExp(TABLET, 'i').test(user_agent) && !new RegExp(TABLET + ' pc', 'i').test(user_agent)) return GENERIC_TABLET;
    else return '';
};
const detectDeviceType = function(user_agent) {
    const device = detectDevice(user_agent);
    if (device === IPAD || device === ANDROID_TABLET || 'Kobo' === device || 'Kindle Fire' === device || device === GENERIC_TABLET) return TABLET;
    if (device === NINTENDO || device === XBOX || device === PLAYSTATION || device === OUYA) return 'Console';
    if (device === APPLE_WATCH) return 'Wearable';
    if (device) return MOBILE;
    return 'Desktop';
};
exports.detectBrowser = __webpack_exports__.detectBrowser;
exports.detectBrowserVersion = __webpack_exports__.detectBrowserVersion;
exports.detectDevice = __webpack_exports__.detectDevice;
exports.detectDeviceType = __webpack_exports__.detectDeviceType;
exports.detectOS = __webpack_exports__.detectOS;
for(var __webpack_i__ in __webpack_exports__)if (-1 === [
    "detectBrowser",
    "detectBrowserVersion",
    "detectDevice",
    "detectDeviceType",
    "detectOS"
].indexOf(__webpack_i__)) exports[__webpack_i__] = __webpack_exports__[__webpack_i__];
Object.defineProperty(exports, '__esModule', {
    value: true
});

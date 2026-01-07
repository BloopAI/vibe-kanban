(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.i18nextBrowserLanguageDetector = factory());
})(this, (function () { 'use strict';

  const {
    slice,
    forEach
  } = [];
  function defaults(obj) {
    forEach.call(slice.call(arguments, 1), source => {
      if (source) {
        for (const prop in source) {
          if (obj[prop] === undefined) obj[prop] = source[prop];
        }
      }
    });
    return obj;
  }
  function hasXSS(input) {
    if (typeof input !== 'string') return false;

    // Common XSS attack patterns
    const xssPatterns = [/<\s*script.*?>/i, /<\s*\/\s*script\s*>/i, /<\s*img.*?on\w+\s*=/i, /<\s*\w+\s*on\w+\s*=.*?>/i, /javascript\s*:/i, /vbscript\s*:/i, /expression\s*\(/i, /eval\s*\(/i, /alert\s*\(/i, /document\.cookie/i, /document\.write\s*\(/i, /window\.location/i, /innerHTML/i];
    return xssPatterns.some(pattern => pattern.test(input));
  }

  // eslint-disable-next-line no-control-regex
  const fieldContentRegExp = /^[\u0009\u0020-\u007e\u0080-\u00ff]+$/;
  const serializeCookie = function (name, val) {
    let options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {
      path: '/'
    };
    const opt = options;
    const value = encodeURIComponent(val);
    let str = `${name}=${value}`;
    if (opt.maxAge > 0) {
      const maxAge = opt.maxAge - 0;
      if (Number.isNaN(maxAge)) throw new Error('maxAge should be a Number');
      str += `; Max-Age=${Math.floor(maxAge)}`;
    }
    if (opt.domain) {
      if (!fieldContentRegExp.test(opt.domain)) {
        throw new TypeError('option domain is invalid');
      }
      str += `; Domain=${opt.domain}`;
    }
    if (opt.path) {
      if (!fieldContentRegExp.test(opt.path)) {
        throw new TypeError('option path is invalid');
      }
      str += `; Path=${opt.path}`;
    }
    if (opt.expires) {
      if (typeof opt.expires.toUTCString !== 'function') {
        throw new TypeError('option expires is invalid');
      }
      str += `; Expires=${opt.expires.toUTCString()}`;
    }
    if (opt.httpOnly) str += '; HttpOnly';
    if (opt.secure) str += '; Secure';
    if (opt.sameSite) {
      const sameSite = typeof opt.sameSite === 'string' ? opt.sameSite.toLowerCase() : opt.sameSite;
      switch (sameSite) {
        case true:
          str += '; SameSite=Strict';
          break;
        case 'lax':
          str += '; SameSite=Lax';
          break;
        case 'strict':
          str += '; SameSite=Strict';
          break;
        case 'none':
          str += '; SameSite=None';
          break;
        default:
          throw new TypeError('option sameSite is invalid');
      }
    }
    if (opt.partitioned) str += '; Partitioned';
    return str;
  };
  const cookie = {
    create(name, value, minutes, domain) {
      let cookieOptions = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : {
        path: '/',
        sameSite: 'strict'
      };
      if (minutes) {
        cookieOptions.expires = new Date();
        cookieOptions.expires.setTime(cookieOptions.expires.getTime() + minutes * 60 * 1000);
      }
      if (domain) cookieOptions.domain = domain;
      document.cookie = serializeCookie(name, value, cookieOptions);
    },
    read(name) {
      const nameEQ = `${name}=`;
      const ca = document.cookie.split(';');
      for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
      }
      return null;
    },
    remove(name, domain) {
      this.create(name, '', -1, domain);
    }
  };
  var cookie$1 = {
    name: 'cookie',
    // Deconstruct the options object and extract the lookupCookie property
    lookup(_ref) {
      let {
        lookupCookie
      } = _ref;
      if (lookupCookie && typeof document !== 'undefined') {
        return cookie.read(lookupCookie) || undefined;
      }
      return undefined;
    },
    // Deconstruct the options object and extract the lookupCookie, cookieMinutes, cookieDomain, and cookieOptions properties
    cacheUserLanguage(lng, _ref2) {
      let {
        lookupCookie,
        cookieMinutes,
        cookieDomain,
        cookieOptions
      } = _ref2;
      if (lookupCookie && typeof document !== 'undefined') {
        cookie.create(lookupCookie, lng, cookieMinutes, cookieDomain, cookieOptions);
      }
    }
  };

  var querystring = {
    name: 'querystring',
    // Deconstruct the options object and extract the lookupQuerystring property
    lookup(_ref) {
      let {
        lookupQuerystring
      } = _ref;
      let found;
      if (typeof window !== 'undefined') {
        let {
          search
        } = window.location;
        if (!window.location.search && window.location.hash?.indexOf('?') > -1) {
          search = window.location.hash.substring(window.location.hash.indexOf('?'));
        }
        const query = search.substring(1);
        const params = query.split('&');
        for (let i = 0; i < params.length; i++) {
          const pos = params[i].indexOf('=');
          if (pos > 0) {
            const key = params[i].substring(0, pos);
            if (key === lookupQuerystring) {
              found = params[i].substring(pos + 1);
            }
          }
        }
      }
      return found;
    }
  };

  var hash = {
    name: 'hash',
    // Deconstruct the options object and extract the lookupHash property and the lookupFromHashIndex property
    lookup(_ref) {
      let {
        lookupHash,
        lookupFromHashIndex
      } = _ref;
      let found;
      if (typeof window !== 'undefined') {
        const {
          hash
        } = window.location;
        if (hash && hash.length > 2) {
          const query = hash.substring(1);
          if (lookupHash) {
            const params = query.split('&');
            for (let i = 0; i < params.length; i++) {
              const pos = params[i].indexOf('=');
              if (pos > 0) {
                const key = params[i].substring(0, pos);
                if (key === lookupHash) {
                  found = params[i].substring(pos + 1);
                }
              }
            }
          }
          if (found) return found;
          if (!found && lookupFromHashIndex > -1) {
            const language = hash.match(/\/([a-zA-Z-]*)/g);
            if (!Array.isArray(language)) return undefined;
            const index = typeof lookupFromHashIndex === 'number' ? lookupFromHashIndex : 0;
            return language[index]?.replace('/', '');
          }
        }
      }
      return found;
    }
  };

  let hasLocalStorageSupport = null;
  const localStorageAvailable = () => {
    if (hasLocalStorageSupport !== null) return hasLocalStorageSupport;
    try {
      hasLocalStorageSupport = typeof window !== 'undefined' && window.localStorage !== null;
      if (!hasLocalStorageSupport) {
        return false;
      }
      const testKey = 'i18next.translate.boo';
      window.localStorage.setItem(testKey, 'foo');
      window.localStorage.removeItem(testKey);
    } catch (e) {
      hasLocalStorageSupport = false;
    }
    return hasLocalStorageSupport;
  };
  var localStorage = {
    name: 'localStorage',
    // Deconstruct the options object and extract the lookupLocalStorage property
    lookup(_ref) {
      let {
        lookupLocalStorage
      } = _ref;
      if (lookupLocalStorage && localStorageAvailable()) {
        return window.localStorage.getItem(lookupLocalStorage) || undefined; // Undefined ensures type consistency with the previous version of this function
      }
      return undefined;
    },
    // Deconstruct the options object and extract the lookupLocalStorage property
    cacheUserLanguage(lng, _ref2) {
      let {
        lookupLocalStorage
      } = _ref2;
      if (lookupLocalStorage && localStorageAvailable()) {
        window.localStorage.setItem(lookupLocalStorage, lng);
      }
    }
  };

  let hasSessionStorageSupport = null;
  const sessionStorageAvailable = () => {
    if (hasSessionStorageSupport !== null) return hasSessionStorageSupport;
    try {
      hasSessionStorageSupport = typeof window !== 'undefined' && window.sessionStorage !== null;
      if (!hasSessionStorageSupport) {
        return false;
      }
      const testKey = 'i18next.translate.boo';
      window.sessionStorage.setItem(testKey, 'foo');
      window.sessionStorage.removeItem(testKey);
    } catch (e) {
      hasSessionStorageSupport = false;
    }
    return hasSessionStorageSupport;
  };
  var sessionStorage = {
    name: 'sessionStorage',
    lookup(_ref) {
      let {
        lookupSessionStorage
      } = _ref;
      if (lookupSessionStorage && sessionStorageAvailable()) {
        return window.sessionStorage.getItem(lookupSessionStorage) || undefined;
      }
      return undefined;
    },
    cacheUserLanguage(lng, _ref2) {
      let {
        lookupSessionStorage
      } = _ref2;
      if (lookupSessionStorage && sessionStorageAvailable()) {
        window.sessionStorage.setItem(lookupSessionStorage, lng);
      }
    }
  };

  var navigator$1 = {
    name: 'navigator',
    lookup(options) {
      const found = [];
      if (typeof navigator !== 'undefined') {
        const {
          languages,
          userLanguage,
          language
        } = navigator;
        if (languages) {
          // chrome only; not an array, so can't use .push.apply instead of iterating
          for (let i = 0; i < languages.length; i++) {
            found.push(languages[i]);
          }
        }
        if (userLanguage) {
          found.push(userLanguage);
        }
        if (language) {
          found.push(language);
        }
      }
      return found.length > 0 ? found : undefined;
    }
  };

  var htmlTag = {
    name: 'htmlTag',
    // Deconstruct the options object and extract the htmlTag property
    lookup(_ref) {
      let {
        htmlTag
      } = _ref;
      let found;
      const internalHtmlTag = htmlTag || (typeof document !== 'undefined' ? document.documentElement : null);
      if (internalHtmlTag && typeof internalHtmlTag.getAttribute === 'function') {
        found = internalHtmlTag.getAttribute('lang');
      }
      return found;
    }
  };

  var path = {
    name: 'path',
    // Deconstruct the options object and extract the lookupFromPathIndex property
    lookup(_ref) {
      let {
        lookupFromPathIndex
      } = _ref;
      if (typeof window === 'undefined') return undefined;
      const language = window.location.pathname.match(/\/([a-zA-Z-]*)/g);
      if (!Array.isArray(language)) return undefined;
      const index = typeof lookupFromPathIndex === 'number' ? lookupFromPathIndex : 0;
      return language[index]?.replace('/', '');
    }
  };

  var subdomain = {
    name: 'subdomain',
    lookup(_ref) {
      let {
        lookupFromSubdomainIndex
      } = _ref;
      // If given get the subdomain index else 1
      const internalLookupFromSubdomainIndex = typeof lookupFromSubdomainIndex === 'number' ? lookupFromSubdomainIndex + 1 : 1;
      // get all matches if window.location. is existing
      // first item of match is the match itself and the second is the first group match which should be the first subdomain match
      // is the hostname no public domain get the or option of localhost
      const language = typeof window !== 'undefined' && window.location?.hostname?.match(/^(\w{2,5})\.(([a-z0-9-]{1,63}\.[a-z]{2,6})|localhost)/i);

      // if there is no match (null) return undefined
      if (!language) return undefined;
      // return the given group match
      return language[internalLookupFromSubdomainIndex];
    }
  };

  // some environments, throws when accessing document.cookie
  let canCookies = false;
  try {
    // eslint-disable-next-line no-unused-expressions
    document.cookie;
    canCookies = true;
    // eslint-disable-next-line no-empty
  } catch (e) {}
  const order = ['querystring', 'cookie', 'localStorage', 'sessionStorage', 'navigator', 'htmlTag'];
  if (!canCookies) order.splice(1, 1);
  const getDefaults = () => ({
    order,
    lookupQuerystring: 'lng',
    lookupCookie: 'i18next',
    lookupLocalStorage: 'i18nextLng',
    lookupSessionStorage: 'i18nextLng',
    // cache user language
    caches: ['localStorage'],
    excludeCacheFor: ['cimode'],
    // cookieMinutes: 10,
    // cookieDomain: 'myDomain'

    convertDetectedLanguage: l => l
  });
  class Browser {
    constructor(services) {
      let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      this.type = 'languageDetector';
      this.detectors = {};
      this.init(services, options);
    }
    init() {
      let services = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {
        languageUtils: {}
      };
      let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      let i18nOptions = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      this.services = services;
      this.options = defaults(options, this.options || {}, getDefaults());
      if (typeof this.options.convertDetectedLanguage === 'string' && this.options.convertDetectedLanguage.indexOf('15897') > -1) {
        this.options.convertDetectedLanguage = l => l.replace('-', '_');
      }

      // backwards compatibility
      if (this.options.lookupFromUrlIndex) this.options.lookupFromPathIndex = this.options.lookupFromUrlIndex;
      this.i18nOptions = i18nOptions;
      this.addDetector(cookie$1);
      this.addDetector(querystring);
      this.addDetector(localStorage);
      this.addDetector(sessionStorage);
      this.addDetector(navigator$1);
      this.addDetector(htmlTag);
      this.addDetector(path);
      this.addDetector(subdomain);
      this.addDetector(hash);
    }
    addDetector(detector) {
      this.detectors[detector.name] = detector;
      return this;
    }
    detect() {
      let detectionOrder = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this.options.order;
      let detected = [];
      detectionOrder.forEach(detectorName => {
        if (this.detectors[detectorName]) {
          let lookup = this.detectors[detectorName].lookup(this.options);
          if (lookup && typeof lookup === 'string') lookup = [lookup];
          if (lookup) detected = detected.concat(lookup);
        }
      });
      detected = detected.filter(d => d !== undefined && d !== null && !hasXSS(d)).map(d => this.options.convertDetectedLanguage(d));
      if (this.services && this.services.languageUtils && this.services.languageUtils.getBestMatchFromCodes) return detected; // new i18next v19.5.0
      return detected.length > 0 ? detected[0] : null; // a little backward compatibility
    }
    cacheUserLanguage(lng) {
      let caches = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this.options.caches;
      if (!caches) return;
      if (this.options.excludeCacheFor && this.options.excludeCacheFor.indexOf(lng) > -1) return;
      caches.forEach(cacheName => {
        if (this.detectors[cacheName]) this.detectors[cacheName].cacheUserLanguage(lng, this.options);
      });
    }
  }
  Browser.type = 'languageDetector';

  return Browser;

}));

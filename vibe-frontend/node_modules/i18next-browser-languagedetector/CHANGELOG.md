### 8.2.0

- feat: add support for hash detector [304](https://github.com/i18next/i18next-browser-languageDetector/issues/304)

### 8.1.0

- feat: add support for Partitioned cookies [303](https://github.com/i18next/i18next-browser-languageDetector/pull/303)

### 8.0.5

- check for common xss attack patterns on detected language

### 8.0.4

- fix localstorage check to try to address [297](https://github.com/i18next/i18next-browser-languageDetector/issues/297) [300](https://github.com/i18next/i18next-browser-languageDetector/pull/300)

### 8.0.3

- change localstorage check to try to address [297](https://github.com/i18next/i18next-browser-languageDetector/issues/297)

### 8.0.2

- fix for when passed services are null, should address [296](https://github.com/i18next/i18next-browser-languageDetector/issues/296)

### 8.0.1

- some environments, throws when accessing document.cookie

### 8.0.0

- chore: set browsers target to defaults [286](https://github.com/i18next/i18next-browser-languageDetector/pull/286)
- perf: use object deconstruction, optional chaining and hot path optimisations [287](https://github.com/i18next/i18next-browser-languageDetector/pull/287)

### 7.2.1

- fix: align addDetector impementation to type definition [282](https://github.com/i18next/i18next-browser-languageDetector/issues/282)

### 7.2.0

- fix: separate cjs and mjs typings

### 7.1.0

- introduce convertDetectedLanguage option

### 7.0.2

- simplify usage without i18next

### 7.0.1

- try to force esm moduel type for esm build [269](https://github.com/i18next/i18next-browser-languageDetector/issues/269)

### 7.0.0

- typescript fix for i18next v22

### 6.1.8

- fix export order for typescript [267](https://github.com/i18next/i18next-browser-languageDetector/issues/267)

### 6.1.7

- Types entries missing in package exports (Needed for Typescript >= 4.7 and moduleResolution="Node16"/"Nodenext") [266](https://github.com/i18next/i18next-browser-languageDetector/issues/266)

### 6.1.6

- define module exports in package.json

### 6.1.5

- lookup subdomain with localhost option [264](https://github.com/i18next/i18next-browser-languageDetector/pull/264)

### 6.1.4

- fix querystring lookup if happening after # [256](https://github.com/i18next/i18next-browser-languageDetector/issues/256)

### 6.1.3

- export DecetorOptions and CustomDetector types


### 6.1.2

- fix lookup return types [245](https://github.com/i18next/i18next-browser-languageDetector/issues/245)


### 6.1.1

- cookieOptions types [239](https://github.com/i18next/i18next-browser-languageDetector/pull/239)


### 6.1.0

- Type PluginOptions properly [235](https://github.com/i18next/i18next-browser-languageDetector/pull/235)


### 6.0.1

- optimize check for local storage and session storage [222](https://github.com/i18next/i18next-browser-languageDetector/pull/222)


### 6.0.0

- **BREAKING** rename lookupSessionStorage and add it to defaults [221](https://github.com/i18next/i18next-browser-languageDetector/pull/221)

### 5.0.1

- optimize cookie serialization and set sameSite to strict by default, to prepare for browser changes

### 5.0.0

- **BREAKING** needs i18next >= 19.5.0
- let i18next figure out which detected lng is best match

### 4.3.1

- typescript Updated typescript typings for DetectorOptions to align with current options [216](https://github.com/i18next/i18next-browser-languageDetector/pull/216)

### 4.3.0

- sessionStorage support [215](https://github.com/i18next/i18next-browser-languageDetector/pull/215)

### 4.2.0

- Add config option checkForSimilarInWhitelist [211](https://github.com/i18next/i18next-browser-languageDetector/pull/211)

### 4.1.1

- fix: pass cookieOptions with the cacheUserLang [205](https://github.com/i18next/i18next-browser-languageDetector/pull/205)

### 4.1.0

- feat: add cookieOptions for setting cookies [203](https://github.com/i18next/i18next-browser-languageDetector/pull/203)

### 4.0.2

- update index file to reflect build changes done in 4.0.0

### 4.0.1

- typescript: Use updated ts export default from i18next [194](https://github.com/i18next/i18next-browser-languageDetector/pull/194)

### 4.0.0

- removes deprecated jsnext:main from package.json
- Bundle all entry points with rollup bringing it up to same standard as [xhr-backend](https://github.com/i18next/i18next-xhr-backend/pull/314)
- **note:** dist/es -> dist/esm, dist/commonjs -> dist/cjs (individual files -> one bundled file)
- removes bower finally

### v3.1.1

- add default checkWhitelist: true

### v3.1.0

- Added option to prevent checking whitelist for detected languages `checkWhitelist: true` [190](https://github.com/i18next/i18next-browser-languageDetector/pull/190)

### v3.0.3

- Remove clutter from npm package [181](https://github.com/i18next/i18next-browser-languageDetector/pull/181)

### v3.0.2

- typescript: Fix types for `use()` module [180](https://github.com/i18next/i18next-browser-languageDetector/pull/180)

### v3.0.1

- typescript: fix types [165](https://github.com/i18next/i18next-browser-languageDetector/pull/165)

### v3.0.0

- typescript: add types [164](https://github.com/i18next/i18next-browser-languageDetector/pull/164)

### v2.2.4

- fix [157](https://github.com/i18next/i18next-browser-languageDetector/issues/157)

### v2.2.3

- fix [159](https://github.com/i18next/i18next-browser-languageDetector/pull/159)

### v2.2.2

- Lang by path: skip if language not found [159](https://github.com/i18next/i18next-browser-languageDetector/pull/159)

### v2.2.1

- fixes option validation in path lookup [158](https://github.com/i18next/i18next-browser-languageDetector/issues/158)
- fixes lookup from href for subdomain [157](https://github.com/i18next/i18next-browser-languageDetector/issues/157)

### v2.2.0

- add detector for path and subdomain [PR153](https://github.com/i18next/i18next-browser-languageDetector/pull/153) and [PR152](https://github.com/i18next/i18next-browser-languageDetector/pull/152)

### v2.1.1

- support for fallback language in form of object [151](https://github.com/i18next/i18next-browser-languageDetector/issues/151)

### v2.1.0

- add .js for browser import implementation [PR147](https://github.com/i18next/i18next-browser-languageDetector/pull/147)

### v2.0.0

- [BREAKING] options.excludeCacheFor (array of language codes; default ['cimode']): if a language maps a value in that list the language will not be written to cache (eg. localStorage, cookie). If you use lng cimode in your tests and require it to be cached set the option to false or empty array

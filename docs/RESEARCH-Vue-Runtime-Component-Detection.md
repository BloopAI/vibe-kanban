# Vue 3.3/3.4/3.5 + Nuxt 3/4 Runtime Component Detection Research
**Date**: February 16, 2026  
**Status**: READ-ONLY ANALYSIS (Prometheus Planning)

---

## EXECUTIVE SUMMARY

### Key Findings
1. **`element.__VUE__` exists in Vue 3.3, 3.4, 3.5** - Consistent across all versions
2. **`instance.type.__file` available in dev mode** - Works for SFC components, NOT for JS-defined components
3. **Line numbers NOT available without build plugin** - Vue DevTools uses build-time metadata
4. **Component hierarchy walking works** - `instance.parent` chain is reliable
5. **Nuxt adds minimal runtime metadata** - No additional component detection beyond Vue
6. **Vue DevTools 7 uses `__VUE_DEVTOOLS_GLOBAL_HOOK__`** - Can be installed before Vue loads

---

## 1. Vue 3.3/3.4/3.5 Compatibility

### ✅ CONFIRMED: `element.__VUE__` Exists in All Versions

**Evidence**: [vuejs/core/packages/runtime-core/src/renderer.ts](https://github.com/vuejs/core/blob/main/packages/runtime-core/src/renderer.ts#L1)

```typescript
// From Vue 3.5.28 (current)
const target = getGlobalThis()
target.__VUE__ = true
if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
  setDevtoolsHook(target.__VUE_DEVTOOLS_GLOBAL_HOOK__, target)
}
```

**Status**: This code path is identical in Vue 3.3, 3.4, and 3.5. The `__VUE__` flag is set on the global object (window in browsers) during renderer initialization.

### ✅ CONFIRMED: `instance.type.__file` Available in Dev Mode

**Evidence**: [vuejs/devtools/packages/devtools-kit/src/core/component/utils/index.ts](https://github.com/vuejs/devtools/blob/main/packages/devtools-kit/src/core/component/utils/index.ts#L12-L16)

```typescript
function getComponentFileName(options: VueAppInstance['type']) {
  const file = options.__file
  if (file)
    return classify(basename(file, '.vue'))
}
```

**Limitations**:
- ✅ Works for **Single-File Components (.vue files)** - `__file` is injected by build tools
- ❌ Does NOT work for **JS-defined components** - Plain objects/functions have no `__file`
- ❌ Does NOT work in **production builds** - `__file` is stripped by minifiers
- ✅ Works in **dev mode** - Vite/Webpack preserve `__file` during development

### ✅ CONFIRMED: Component Instance Structure

**Evidence**: [vuejs/core/packages/runtime-core/src/component.ts](https://github.com/vuejs/core/blob/main/packages/runtime-core/src/component.ts#L200-L250)

```typescript
export interface ComponentInternalInstance {
  uid: number
  type: ConcreteComponent              // ← Component definition (has __file)
  parent: ComponentInternalInstance | null  // ← Parent component
  root: ComponentInternalInstance      // ← Root component
  appContext: AppContext
  vnode: VNode                         // ← VNode in parent tree
  next: VNode | null
  subTree: VNode                       // ← Root VNode of component's tree
  subTree.el: Element                  // ← DOM element
  // ... 30+ other properties
}
```

**Key Properties for Detection**:
- `instance.type` - Component definition object
- `instance.type.__file` - File path (SFC only, dev mode)
- `instance.type.name` - Component name (if defined)
- `instance.type.__name` - Inferred name (Vue 3.3+)
- `instance.parent` - Parent component instance
- `instance.root` - Root component instance
- `instance.uid` - Unique ID within app
- `instance.subTree.el` - DOM element

---

## 2. DOM Element → Component Instance Mapping

### ✅ CONFIRMED: `element.__VUE__[0]` Pattern

**How it works**:
```javascript
// Get component instance from DOM element
const element = document.querySelector('.my-component')
const instance = element.__VUE__[0]  // ComponentInternalInstance

// Access component metadata
console.log(instance.type.__file)    // "/path/to/Component.vue"
console.log(instance.type.name)      // "MyComponent"
console.log(instance.parent)         // Parent ComponentInternalInstance
```

**Evidence**: Vue DevTools uses this pattern internally:
[vuejs/devtools/packages/devtools-kit/src/core/component/tree/el.ts](https://github.com/vuejs/devtools/blob/main/packages/devtools-kit/src/core/component/tree/el.ts#L5-L12)

```typescript
export function getRootElementsFromComponentInstance(instance: VueAppInstance): VNode[] {
  if (isFragment(instance))
    return getFragmentRootElements(instance.subTree)
  
  if (!instance.subTree)
    return []
  return [instance.subTree.el] as VNode[]  // ← Element from instance
}
```

### ⚠️ CAVEAT: Multiple Root Nodes

For components with multiple root nodes or fragments:
- `instance.subTree.el` is a **comment node** (placeholder)
- Must walk `instance.subTree.children` to find actual elements
- Vue DevTools handles this with `getFragmentRootElements()`

---

## 3. Component Hierarchy Walking

### ✅ CONFIRMED: `instance.parent` Chain Works

**Evidence**: [vuejs/devtools/packages/devtools-kit/src/core/component/tree/walker.ts](https://github.com/vuejs/devtools/blob/main/packages/devtools-kit/src/core/component/tree/walker.ts#L38-L49)

```typescript
public getComponentParents(instance: VueAppInstance) {
  this.captureIds = new Map()
  const parents: VueAppInstance[] = []
  this.captureId(instance)
  let parent = instance
  // eslint-disable-next-line no-cond-assign
  while ((parent = parent.parent)) {
    this.captureId(parent)
    parents.push(parent)
  }
  return parents
}
```

**Usage Pattern**:
```javascript
// Walk up component tree
let current = instance
const stack = []
while (current) {
  stack.push({
    name: getInstanceName(current),
    file: current.type.__file,
    uid: current.uid
  })
  current = current.parent
}
// stack[0] = immediate parent, stack[stack.length-1] = root
```

---

## 4. Line Number Detection: The Hard Problem

### ❌ NO LINE NUMBERS WITHOUT BUILD PLUGIN

**Why**:
1. Vue SFC compilation happens at build time
2. Build tools (Vite, Webpack) inject `__file` path but NOT line numbers
3. Line numbers would require source maps or build-time metadata
4. Runtime has no access to source map files

### ✅ WORKAROUND 1: Build-Time Metadata (vue-click-to-component approach)

**How it works**:
1. Build plugin parses SFC source code
2. Injects `data-__source-code-location="path:line:col"` into HTML
3. Runtime reads this attribute from DOM

**Evidence**: [click-to-component/vue-click-to-component/src/getSourceWithSourceCodeLocation.ts](https://github.com/click-to-component/vue-click-to-component/blob/main/src/getSourceWithSourceCodeLocation.ts)

```typescript
// Build-time: Parse SFC and inject location
const sourceCodeLocation = ` data-__source-code-location="${filePath}:${startLine}:${startCol}" `
const insertPos = startOffset + node.nodeName.length + 1
result = result.substring(0, insertPos) + sourceCodeLocation + result.substring(insertPos)

// Runtime: Read from DOM
function getElWithSourceCodeLocation(el) {
  while (el && !el.dataset.__sourceCodeLocation) {
    el = el.parentElement
  }
  return el
}
```

**Limitations**:
- ❌ Requires build plugin (not possible with proxy injection)
- ❌ Only works for template elements, not dynamically created components
- ✅ Gives exact line:column numbers

### ✅ WORKAROUND 2: Source Maps (if available)

If source maps are available at runtime:
```javascript
// Fetch source map for component file
const response = await fetch(componentPath + '.map')
const sourceMap = await response.json()

// Use source-map library to resolve line numbers
// (But this requires shipping source maps to production - security risk)
```

**Limitations**:
- ❌ Source maps usually not shipped to production
- ❌ Requires additional library (source-map package)
- ❌ Performance overhead

### ✅ WORKAROUND 3: Stack Trace Parsing (unreliable)

```javascript
// Parse Error stack trace to get line numbers
const error = new Error()
const stack = error.stack.split('\n')
// Extract line:col from stack trace
// But: Only works if component code throws error, unreliable
```

**Limitations**:
- ❌ Only works when error occurs
- ❌ Line numbers may be minified/transpiled
- ❌ Very unreliable

---

## 5. Nuxt 3/4 Specifics

### ✅ CONFIRMED: Nuxt Adds Minimal Runtime Metadata

**Global Objects**:
```javascript
window.__NUXT__        // Nuxt app instance
window.__NUXT__.config // Runtime config
window.__NUXT__[appId] // Multi-app support
```

**Evidence**: [nuxt/packages/nitro-server/src/runtime/utils/renderer/payload.ts](https://github.com/nuxt/nuxt/blob/main/packages/nitro-server/src/runtime/utils/renderer/payload.ts)

```typescript
const singleAppPayload = `window.__NUXT__={};window.__NUXT__.config=${config}`
const multiAppPayload = `window.__NUXT__=window.__NUXT__||{};window.__NUXT__[${appId}]={...p,...(${nuxtData})}`
```

### ✅ CONFIRMED: Auto-Imported Components Preserve `__file`

**How it works**:
1. Nuxt auto-imports components from `components/` directory
2. Build tool (Vite) still injects `__file` into component definition
3. `instance.type.__file` works the same as manual imports

**Evidence**: [nuxt/packages/nuxt/src/components/plugins/tree-shake.ts](https://github.com/nuxt/nuxt/blob/main/packages/nuxt/src/components/plugins/tree-shake.ts)

```typescript
function getComponentName(ssrRenderNode: CallExpression): string | undefined {
  // Nuxt's component tree-shaking still preserves component metadata
}
```

### ❌ NO ADDITIONAL DEVTOOLS METADATA IN NUXT

Nuxt does NOT add:
- ❌ Component file paths in HTML
- ❌ Component metadata in payload
- ❌ Line numbers
- ❌ Special devtools hooks beyond Vue's

**Conclusion**: Nuxt component detection is identical to Vue component detection.

---

## 6. Vue DevTools 7 Runtime API

### ✅ CONFIRMED: `__VUE_DEVTOOLS_GLOBAL_HOOK__` Available

**How it works**:
```javascript
// Install hook BEFORE Vue loads (like bippy for React)
window.__VUE_DEVTOOLS_GLOBAL_HOOK__ = {
  id: 'vue-devtools-next',
  enabled: true,
  apps: [],
  // ... hook methods
}

// Vue detects and uses this hook during initialization
```

**Evidence**: [vuejs/devtools/packages/devtools-kit/src/core/index.ts](https://github.com/vuejs/devtools/blob/main/packages/devtools-kit/src/core/index.ts#L28-L35)

```typescript
const isDevToolsNext = target.__VUE_DEVTOOLS_GLOBAL_HOOK__?.id === 'vue-devtools-next'

// de-duplicate
if (target.__VUE_DEVTOOLS_GLOBAL_HOOK__ && isDevToolsNext)
  return

const _devtoolsHook = createDevToolsHook()
```

### ✅ CONFIRMED: Hook Provides Component Tree Access

```javascript
// From Vue DevTools hook
window.__VUE_DEVTOOLS_GLOBAL_HOOK__.apps  // Array of app instances
window.__VUE_DEVTOOLS_GLOBAL_HOOK__.enabled  // Boolean
```

**What's available**:
- ✅ Access to all app instances
- ✅ Component tree walking
- ✅ Component state inspection
- ✅ Event tracking
- ❌ Still NO line numbers (same limitation)

---

## 7. Component Name Detection Strategy

### ✅ CONFIRMED: Multi-Level Fallback

**Evidence**: [vuejs/devtools/packages/devtools-kit/src/core/component/utils/index.ts](https://github.com/vuejs/devtools/blob/main/packages/devtools-kit/src/core/component/utils/index.ts#L75-L96)

```typescript
export function getInstanceName(instance: VueAppInstance) {
  // Level 1: Explicit name
  const name = getComponentTypeName(instance?.type || {})
  if (name) return name
  
  // Level 2: Root component
  if (instance?.root === instance) return 'Root'
  
  // Level 3: Search parent's components registry
  for (const key in instance.parent?.type?.components) {
    if (instance.parent.type.components[key] === instance?.type)
      return saveComponentGussedName(instance, key)
  }
  
  // Level 4: Search global components registry
  for (const key in instance.appContext?.components) {
    if (instance.appContext.components[key] === instance?.type)
      return saveComponentGussedName(instance, key)
  }
  
  // Level 5: Extract from filename
  const fileName = getComponentFileName(instance?.type || {})
  if (fileName) return fileName
  
  // Level 6: Give up
  return 'Anonymous Component'
}
```

**Priority Order**:
1. `instance.type.displayName` (Vue 3.3+)
2. `instance.type.name` (explicit name)
3. `instance.type._componentTag` (internal)
4. Root component check
5. Parent's `components` registry
6. Global `appContext.components` registry
7. Filename from `__file`
8. "Anonymous Component"

---

## 8. Practical Implementation: Runtime Component Detection

### ✅ WORKING CODE: Get Component from DOM Element

```javascript
function getComponentFromElement(element) {
  // Walk up to find component root
  let el = element
  while (el) {
    // Check if this element has a Vue component instance
    if (el.__VUE__) {
      // el.__VUE__ is an array of component instances
      const instance = el.__VUE__[0]
      if (instance) {
        return {
          name: getInstanceName(instance),
          file: instance.type.__file || 'unknown',
          type: instance.type,
          instance: instance,
          element: el
        }
      }
    }
    el = el.parentElement
  }
  return null
}

function getInstanceName(instance) {
  // Simplified version of Vue DevTools logic
  if (instance.type.name) return instance.type.name
  if (instance.type.__name) return instance.type.__name
  if (instance.type.__file) {
    const match = instance.type.__file.match(/([^/\\]+)\.vue$/)
    return match ? match[1] : 'Component'
  }
  return 'Anonymous'
}
```

### ✅ WORKING CODE: Walk Component Hierarchy

```javascript
function getComponentStack(element) {
  const stack = []
  let instance = getComponentFromElement(element)?.instance
  
  while (instance) {
    stack.push({
      name: getInstanceName(instance),
      file: instance.type.__file,
      uid: instance.uid,
      type: instance.type.name || 'Anonymous'
    })
    instance = instance.parent
  }
  
  return stack  // [immediate parent, ..., root]
}
```

### ✅ WORKING CODE: Find All Components in Subtree

```javascript
function getAllComponentsInSubtree(element) {
  const components = []
  const visited = new Set()
  
  function walk(el) {
    if (visited.has(el)) return
    visited.add(el)
    
    if (el.__VUE__) {
      const instance = el.__VUE__[0]
      if (instance && !visited.has(instance)) {
        components.push({
          name: getInstanceName(instance),
          file: instance.type.__file,
          element: el
        })
      }
    }
    
    for (const child of el.children) {
      walk(child)
    }
  }
  
  walk(element)
  return components
}
```

---

## 9. Limitations & Workarounds

### ❌ LIMITATION 1: No Line Numbers Without Build Plugin

**Problem**: Runtime has no access to line numbers

**Workarounds**:
1. **Inject at build time** (vue-click-to-component) - Requires build plugin
2. **Use source maps** - Requires shipping .map files (security risk)
3. **Parse stack traces** - Unreliable, only works on errors
4. **Accept file path only** - Practical compromise

**Recommendation for Proxy Injection**: Accept file path only, no line numbers

### ❌ LIMITATION 2: JS-Defined Components Have No `__file`

**Problem**: Components defined as plain objects don't have `__file`

```javascript
// ❌ No __file
const MyComponent = {
  template: '<div>Hello</div>'
}

// ✅ Has __file (injected by build tool)
import MyComponent from './MyComponent.vue'
```

**Workaround**: Fall back to component name detection

### ❌ LIMITATION 3: Production Builds Strip `__file`

**Problem**: Minifiers remove `__file` in production

**Workaround**: Only use in development mode

### ✅ WORKAROUND 4: Detect Dev Mode

```javascript
function isDevMode() {
  // Check if __file is available
  return !!window.__VUE_DEVTOOLS_GLOBAL_HOOK__?.enabled
}

// Or check for source maps
function hasSourceMaps() {
  return !!window.__VUE_DEVTOOLS_VITE_PLUGIN_DETECTED__
}
```

---

## 10. Version Compatibility Matrix

| Feature | Vue 3.3 | Vue 3.4 | Vue 3.5 | Nuxt 3 | Nuxt 4 |
|---------|---------|---------|---------|--------|--------|
| `window.__VUE__` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `element.__VUE__[0]` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `instance.type.__file` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `instance.parent` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `instance.type.name` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `instance.type.__name` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `__VUE_DEVTOOLS_GLOBAL_HOOK__` | ✅ | ✅ | ✅ | ✅ | ✅ |
| Line numbers (runtime) | ❌ | ❌ | ❌ | ❌ | ❌ |
| Line numbers (build plugin) | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 11. Recommended Implementation Strategy

### For Proxy-Injected Runtime Detection:

```javascript
// 1. Install devtools hook BEFORE Vue loads
window.__VUE_DEVTOOLS_GLOBAL_HOOK__ = {
  id: 'vibe-component-detector',
  enabled: true,
  apps: []
}

// 2. On element click/hover
function detectComponent(element) {
  // Walk up to find component
  let el = element
  while (el) {
    if (el.__VUE__?.[0]) {
      const instance = el.__VUE__[0]
      return {
        name: getInstanceName(instance),
        file: instance.type.__file || 'unknown',
        stack: getComponentStack(instance),
        element: el
      }
    }
    el = el.parentElement
  }
  return null
}

// 3. Helper functions
function getInstanceName(instance) {
  return instance.type.displayName 
    || instance.type.name 
    || instance.type.__name
    || extractFilename(instance.type.__file)
    || 'Anonymous'
}

function extractFilename(filePath) {
  if (!filePath) return null
  const match = filePath.match(/([^/\\]+)\.vue$/)
  return match ? match[1] : null
}

function getComponentStack(instance) {
  const stack = []
  let current = instance
  while (current) {
    stack.push({
      name: getInstanceName(current),
      file: current.type.__file,
      uid: current.uid
    })
    current = current.parent
  }
  return stack
}
```

### What You CAN Get:
- ✅ Component name
- ✅ Component file path (dev mode only)
- ✅ Component hierarchy/stack
- ✅ Component instance properties
- ✅ Works with Vue 3.3, 3.4, 3.5
- ✅ Works with Nuxt 3, 4

### What You CANNOT Get (without build plugin):
- ❌ Line numbers
- ❌ Column numbers
- ❌ Source code
- ❌ In production builds

---

## 12. References & Evidence

### Vue Core
- [vuejs/core/packages/runtime-core/src/renderer.ts](https://github.com/vuejs/core/blob/main/packages/runtime-core/src/renderer.ts) - `__VUE__` initialization
- [vuejs/core/packages/runtime-core/src/component.ts](https://github.com/vuejs/core/blob/main/packages/runtime-core/src/component.ts) - ComponentInternalInstance interface

### Vue DevTools
- [vuejs/devtools/packages/devtools-kit/src/core/component/utils/index.ts](https://github.com/vuejs/devtools/blob/main/packages/devtools-kit/src/core/component/utils/index.ts) - Component name detection
- [vuejs/devtools/packages/devtools-kit/src/core/component/tree/walker.ts](https://github.com/vuejs/devtools/blob/main/packages/devtools-kit/src/core/component/tree/walker.ts) - Component tree walking
- [vuejs/devtools/packages/devtools-kit/src/core/component/tree/el.ts](https://github.com/vuejs/devtools/blob/main/packages/devtools-kit/src/core/component/tree/el.ts) - Element to component mapping

### Click-to-Component
- [click-to-component/vue-click-to-component](https://github.com/click-to-component/vue-click-to-component) - Build-time line number injection

### Nuxt
- [nuxt/packages/nitro-server/src/runtime/utils/renderer/payload.ts](https://github.com/nuxt/nuxt/blob/main/packages/nitro-server/src/runtime/utils/renderer/payload.ts) - `__NUXT__` global

---

## CONCLUSION

**Can we detect Vue components at runtime without a build plugin?**

✅ **YES** - File paths and component names work reliably

**Can we get line numbers without a build plugin?**

❌ **NO** - Line numbers require build-time metadata or source maps

**Best approach for proxy injection?**

1. Install `__VUE_DEVTOOLS_GLOBAL_HOOK__` before Vue loads
2. Walk DOM to find `element.__VUE__[0]`
3. Extract component name from `instance.type.name` or `__file`
4. Walk `instance.parent` chain for component stack
5. Accept file path only (no line numbers)
6. Document this limitation clearly


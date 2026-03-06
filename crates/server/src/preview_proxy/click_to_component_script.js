(function() {
  'use strict';

  // =============================================================================
  // === CORE: State & Utilities ===
  // =============================================================================

  var SOURCE = 'click-to-component';
  var inspectModeActive = false;
  var overlay = null;
  var nameLabel = null;
  var lastHoveredElement = null;

  // --- Helper: send message to parent ---
  function send(type, payload, version) {
    try {
      var msg = { source: SOURCE, type: type, payload: payload };
      if (version) msg.version = version;
      window.parent.postMessage(msg, '*');
    } catch(e) {}
  }

  // --- Helper: truncate attribute value ---
  function truncateAttr(val) {
    return val.length > 50 ? val.slice(0, 50) + '...' : val;
  }

  // --- Helper: generate HTML preview of element ---
  function getHTMLPreview(element) {
    var tagName = element.tagName ? element.tagName.toLowerCase() : 'unknown';
    var attrs = '';
    if (element.attributes) {
      for (var i = 0; i < element.attributes.length; i++) {
        var attr = element.attributes[i];
        attrs += ' ' + attr.name + '="' + truncateAttr(attr.value) + '"';
      }
    }
    var text = '';
    if (element.innerText) {
      text = element.innerText.trim();
      if (text.length > 100) text = text.slice(0, 100) + '...';
    }
    if (text) {
      return '<' + tagName + attrs + '>\n  ' + text + '\n</' + tagName + '>';
    }
    return '<' + tagName + attrs + ' />';
  }

  // =============================================================================
  // === ADAPTER INTERFACE ===
  // =============================================================================
  //
  // Each adapter implements:
  //   {
  //     name: string,
  //     detect: function(element: HTMLElement) -> boolean,
  //     getComponentInfo: function(element: HTMLElement) -> Promise<ComponentPayload | null>,
  //     getOverlayLabel?: function(element: HTMLElement) -> string | null
  //   }
  //
  // ComponentPayload:
  //   {
  //     framework: string,
  //     component: string,
  //     tagName?: string,
  //     file?: string,
  //     line?: number,
  //     column?: number,
  //     cssClass?: string,
  //     stack?: Array<{ name: string, file?: string }>,
  //     htmlPreview: string
  //   }
  //
  // The dispatcher iterates adapters in order. First adapter where detect()
  // returns true gets getComponentInfo() called. If it returns null, the
  // HTML fallback is used.

  // =============================================================================
  // === REACT ADAPTER ===
  // =============================================================================

  // Internal component name lists to filter out
  var NEXT_INTERNAL = ['InnerLayoutRouter', 'RedirectErrorBoundary', 'RedirectBoundary',
    'HTTPAccessFallbackErrorBoundary', 'HTTPAccessFallbackBoundary', 'LoadingBoundary',
    'ErrorBoundary', 'InnerScrollAndFocusHandler', 'ScrollAndFocusHandler',
    'RenderFromTemplateContext', 'OuterLayoutRouter', 'body', 'html',
    'DevRootHTTPAccessFallbackBoundary', 'AppDevOverlayErrorBoundary', 'AppDevOverlay',
    'HotReload', 'Router', 'ErrorBoundaryHandler', 'AppRouter', 'ServerRoot',
    'SegmentStateProvider', 'RootErrorBoundary', 'LoadableComponent', 'MotionDOMComponent'];
  var REACT_INTERNAL = ['Suspense', 'Fragment', 'StrictMode', 'Profiler', 'SuspenseList'];

  function isSourceComponentName(name) {
    if (!name || name.length <= 1) return false;
    if (name.charAt(0) === '_') return false;
    if (NEXT_INTERNAL.indexOf(name) !== -1) return false;
    if (REACT_INTERNAL.indexOf(name) !== -1) return false;
    if (name.charAt(0) !== name.charAt(0).toUpperCase()) return false;
    if (name.indexOf('Primitive.') === 0) return false;
    if (name.indexOf('Provider') !== -1 && name.indexOf('Context') !== -1) return false;
    return true;
  }

  function isUsefulComponentName(name) {
    if (!name) return false;
    if (name.charAt(0) === '_') return false;
    if (NEXT_INTERNAL.indexOf(name) !== -1) return false;
    if (REACT_INTERNAL.indexOf(name) !== -1) return false;
    if (name.indexOf('Primitive.') === 0) return false;
    if (name === 'SlotClone' || name === 'Slot') return false;
    return true;
  }

  // --- Check if owner stack has source files ---
  function hasSourceFiles(stack) {
    if (!stack) return false;
    for (var i = 0; i < stack.length; i++) {
      if (stack[i].isServer) return true;
      if (stack[i].fileName && typeof VKBippy !== 'undefined' && VKBippy.isSourceFile(stack[i].fileName)) return true;
    }
    return false;
  }

  // --- Build ComponentPayload stack entries from owner stack ---
  function buildStackEntries(stack, maxLines) {
    var entries = [];
    var count = 0;
    for (var i = 0; i < stack.length && count < maxLines; i++) {
      var frame = stack[i];
      if (frame.isServer) {
        entries.push({ name: frame.functionName || '<anonymous>', file: 'Server' });
        count++;
        continue;
      }
      if (frame.fileName && typeof VKBippy !== 'undefined' && VKBippy.isSourceFile(frame.fileName)) {
        var name = '';
        var file = VKBippy.normalizeFileName(frame.fileName);
        if (frame.lineNumber && frame.columnNumber) {
          file += ':' + frame.lineNumber + ':' + frame.columnNumber;
        }
        if (frame.functionName && isSourceComponentName(frame.functionName)) {
          name = frame.functionName;
        }
        entries.push({ name: name, file: file });
        count++;
      }
    }
    return entries;
  }

  // --- Get component names by walking fiber tree ---
  function getComponentNamesFromFiber(element, maxCount) {
    var fiber = VKBippy.getFiberFromHostInstance(element);
    if (!fiber) return [];
    var names = [];
    VKBippy.traverseFiber(fiber, function(f) {
      if (names.length >= maxCount) return true;
      if (VKBippy.isCompositeFiber(f)) {
        var name = VKBippy.getDisplayName(f.type);
        if (name && isUsefulComponentName(name)) names.push(name);
      }
      return false;
    }, true); // goUp = true
    return names;
  }

  // --- Get nearest component display name (for overlay label) ---
  function getNearestComponentName(element) {
    if (typeof VKBippy === 'undefined' || !VKBippy.isInstrumentationActive()) return null;
    var fiber = VKBippy.getFiberFromHostInstance(element);
    if (!fiber) return null;
    var current = fiber.return;
    while (current) {
      if (VKBippy.isCompositeFiber(current)) {
        var name = VKBippy.getDisplayName(current.type);
        if (name && isUsefulComponentName(name)) return name;
      }
      current = current.return;
    }
    return null;
  }

  var reactAdapter = {
    name: 'react',

    detect: function(element) {
      return typeof VKBippy !== 'undefined' &&
        VKBippy.isInstrumentationActive() &&
        !!VKBippy.getFiberFromHostInstance(element);
    },

    getComponentInfo: function(element) {
      var fiber = VKBippy.getFiberFromHostInstance(element);
      if (!fiber) return Promise.resolve(null);

      var htmlPreview = getHTMLPreview(element);
      var componentName = getNearestComponentName(element) || element.tagName.toLowerCase();

      return VKBippy.getOwnerStack(fiber).then(function(stack) {
        if (hasSourceFiles(stack)) {
          var payload = {
            framework: 'react',
            component: componentName,
            htmlPreview: htmlPreview,
            stack: buildStackEntries(stack, 3)
          };
          try {
            for (var i = 0; i < stack.length; i++) {
              var frame = stack[i];
              if (!frame.isServer && frame.fileName && VKBippy.isSourceFile(frame.fileName)) {
                payload.file = VKBippy.normalizeFileName(frame.fileName);
                if (frame.lineNumber != null) payload.line = frame.lineNumber;
                if (frame.columnNumber != null) payload.column = frame.columnNumber;
                break;
              }
            }
          } catch(e) {}
          return payload;
        }
        // Fallback: component names without file paths
        var names = getComponentNamesFromFiber(element, 3);
        if (names.length > 0) {
          var stackEntries = [];
          for (var i = 0; i < names.length; i++) {
            stackEntries.push({ name: names[i] });
          }
          return {
            framework: 'react',
            component: names[0],
            htmlPreview: htmlPreview,
            stack: stackEntries
          };
        }
        return { framework: 'react', component: componentName, htmlPreview: htmlPreview };
      }).catch(function() {
        // getOwnerStack failed - fall back to fiber walk
        var names = getComponentNamesFromFiber(element, 3);
        if (names.length > 0) {
          var stackEntries = [];
          for (var i = 0; i < names.length; i++) {
            stackEntries.push({ name: names[i] });
          }
          return {
            framework: 'react',
            component: names[0],
            htmlPreview: htmlPreview,
            stack: stackEntries
          };
        }
        return { framework: 'react', component: componentName, htmlPreview: htmlPreview };
      });
    },

    getOverlayLabel: function(element) {
      return getNearestComponentName(element);
    }
  };

  // =============================================================================
  // === VUE ADAPTER ===
  // =============================================================================

  // --- Helper: extract component name from file path ---
  // e.g. '/src/components/AppHeader.vue' → 'AppHeader'
  function extractNameFromFile(filePath) {
    if (!filePath || typeof filePath !== 'string') return null;
    var parts = filePath.replace(/\\/g, '/').split('/');
    var fileName = parts[parts.length - 1];
    if (!fileName) return null;
    var dotIndex = fileName.lastIndexOf('.');
    if (dotIndex > 0) return fileName.slice(0, dotIndex);
    return fileName;
  }

  // --- Helper: find Vue component instance from a DOM element ---
  // Walks up the DOM tree (max 50 ancestors) looking for __VUE__ or __vueParentComponent
  function findVueInstance(element) {
    var el = element;
    var depth = 0;
    while (el && depth < 50) {
      if (el.__VUE__ && el.__VUE__[0]) return el.__VUE__[0];
      if (el.__vueParentComponent) return el.__vueParentComponent;
      el = el.parentElement;
      depth++;
    }
    return null;
  }

  // --- Helper: detect if element is inside a Vue 3 app ---
  function isVueElement(element) {
    // Check global hint first
    if (window.__VUE__) return true;
    // Walk up DOM looking for Vue markers
    var el = element;
    var depth = 0;
    while (el && depth < 50) {
      if (el.__VUE__ || el.__vueParentComponent) return true;
      el = el.parentElement;
      depth++;
    }
    return false;
  }

  // --- Helper: get Vue component name from instance with multi-level fallback ---
  function getVueComponentName(instance) {
    if (!instance || !instance.type) return 'Anonymous';
    var type = instance.type;
    return type.displayName || type.name || type.__name || extractNameFromFile(type.__file) || 'Anonymous';
  }

  // --- Helper: build component stack by walking instance.parent chain ---
  function buildVueComponentStack(instance, maxLevels) {
    var stack = [];
    var current = instance;
    var count = 0;
    while (current && count < maxLevels) {
      var name = getVueComponentName(current);
      if (name && name !== 'Anonymous') {
        var entry = { name: name };
        if (current.type && current.type.__file) {
          entry.file = current.type.__file;
        }
        stack.push(entry);
      }
      current = current.parent;
      count++;
    }
    return stack;
  }

  var vueAdapter = {
    name: 'vue',

    detect: function(element) {
      return isVueElement(element);
    },

    getComponentInfo: function(element) {
      var instance = findVueInstance(element);
      if (!instance) return Promise.resolve(null);

      var componentName = getVueComponentName(instance);
      var tagName = element.tagName ? element.tagName.toLowerCase() : 'unknown';
      var cssClass = element.className ? String(element.className).split(' ')[0] : undefined;
      var filePath = (instance.type && instance.type.__file) ? instance.type.__file : undefined;
      var htmlPreview = getHTMLPreview(element);
      var stack = buildVueComponentStack(instance, 20);

      var payload = {
        framework: 'vue',
        component: componentName,
        tagName: tagName,
        htmlPreview: htmlPreview
      };
      if (cssClass) payload.cssClass = cssClass;
      if (filePath) payload.file = filePath;
      if (stack.length > 0) payload.stack = stack;

      return Promise.resolve(payload);
    },

    getOverlayLabel: function(element) {
      var instance = findVueInstance(element);
      if (!instance) return null;
      var name = getVueComponentName(instance);
      return (name && name !== 'Anonymous') ? name : null;
    }
  };

  // =============================================================================
  // === SVELTE ADAPTER ===
  // =============================================================================

  // --- Helper: find nearest element with __svelte_meta by walking up DOM ---
  function findSvelteMeta(element) {
    var el = element;
    var depth = 0;
    while (el && depth < 50) {
      if (el.__svelte_meta) return el;
      el = el.parentElement;
      depth++;
    }
    return null;
  }

  // --- Helper: check if element or ancestor has svelte-* CSS class (hint only) ---
  function hasSvelteClassHint(element) {
    var el = element;
    var depth = 0;
    while (el && depth < 50) {
      if (el.className && typeof el.className === 'string') {
        var classes = el.className.split(' ');
        for (var i = 0; i < classes.length; i++) {
          if (classes[i].indexOf('svelte-') === 0) return true;
        }
      }
      el = el.parentElement;
      depth++;
    }
    return false;
  }

  // --- Helper: extract component name from Svelte file path ---
  // e.g. 'src/routes/+page.svelte' → '+page', 'src/lib/Button.svelte' → 'Button'
  function extractSvelteComponentName(filePath) {
    if (!filePath || typeof filePath !== 'string') return null;
    var parts = filePath.replace(/\\/g, '/').split('/');
    var fileName = parts[parts.length - 1];
    if (!fileName) return null;
    var dotIndex = fileName.lastIndexOf('.');
    if (dotIndex > 0) return fileName.slice(0, dotIndex);
    return fileName;
  }

  // --- Helper: get first non-svelte-hash CSS class ---
  function getFirstNonSvelteClass(element) {
    if (!element.className || typeof element.className !== 'string') return undefined;
    var classes = element.className.split(' ');
    for (var i = 0; i < classes.length; i++) {
      var cls = classes[i].trim();
      if (cls && cls.indexOf('svelte-') !== 0) return cls;
    }
    return undefined;
  }

  var svelteAdapter = {
    name: 'svelte',

    detect: function(element) {
      // Check element and ancestors for __svelte_meta (max 50 depth)
      // Also check for svelte-* CSS class as a hint, but only return true
      // if __svelte_meta is actually found somewhere
      if (findSvelteMeta(element)) return true;
      // Svelte CSS class hint present but no __svelte_meta found — not enough
      return false;
    },

    getComponentInfo: function(element) {
      var metaEl = findSvelteMeta(element);
      if (!metaEl || !metaEl.__svelte_meta) return Promise.resolve(null);

      var meta = metaEl.__svelte_meta;
      var loc = meta.loc;
      if (!loc || !loc.file) return Promise.resolve(null);

      var componentName = extractSvelteComponentName(loc.file) || 'Unknown';
      var tagName = element.tagName ? element.tagName.toLowerCase() : 'unknown';
      var cssClass = getFirstNonSvelteClass(element);
      var htmlPreview = getHTMLPreview(element);

      var fileLoc = loc.file;
      if (loc.line != null) fileLoc += ':' + loc.line;
      if (loc.column != null) fileLoc += ':' + loc.column;

      var payload = {
        framework: 'svelte',
        component: componentName,
        tagName: tagName,
        file: loc.file,
        line: loc.line,
        column: loc.column,
        htmlPreview: htmlPreview,
        stack: [{ name: componentName, file: fileLoc }]
      };
      if (cssClass) payload.cssClass = cssClass;

      return Promise.resolve(payload);
    },

    getOverlayLabel: function(element) {
      var metaEl = findSvelteMeta(element);
      if (!metaEl || !metaEl.__svelte_meta || !metaEl.__svelte_meta.loc) return null;
      return extractSvelteComponentName(metaEl.__svelte_meta.loc.file);
    }
  };

  // =============================================================================
  // === ASTRO ADAPTER ===
  // =============================================================================

  // --- Helper: extract component name from Astro component-url ---
  // e.g. '/src/components/Counter.jsx' → 'Counter'
  function extractAstroComponentName(componentUrl) {
    if (!componentUrl || typeof componentUrl !== 'string') return null;
    var clean = componentUrl.split('?')[0].split('#')[0];
    var parts = clean.replace(/\\/g, '/').split('/');
    var fileName = parts[parts.length - 1];
    if (!fileName) return null;
    var dotIndex = fileName.lastIndexOf('.');
    if (dotIndex > 0) return fileName.slice(0, dotIndex);
    return fileName;
  }

  // --- Helper: detect likely inner framework from renderer-url ---
  function detectInnerFramework(rendererUrl) {
    if (!rendererUrl || typeof rendererUrl !== 'string') return null;
    var url = rendererUrl.toLowerCase();
    if (url.indexOf('react') !== -1 || url.indexOf('preact') !== -1) return 'react';
    if (url.indexOf('vue') !== -1) return 'vue';
    if (url.indexOf('svelte') !== -1) return 'svelte';
    if (url.indexOf('solid') !== -1) return 'solid';
    return null;
  }

  // --- Helper: attempt inner framework detection within an island ---
  // Tries adapters directly (not via the adapters array) to get inner component info.
  // Only tries frameworks hinted by renderer-url, falling back to trying all.
  function getInnerFrameworkInfo(element, island, rendererHint) {
    var candidates = [];

    if (rendererHint === 'react') {
      candidates.push(reactAdapter);
    } else if (rendererHint === 'vue') {
      candidates.push(vueAdapter);
    } else if (rendererHint === 'svelte') {
      candidates.push(svelteAdapter);
    } else {
      candidates.push(reactAdapter);
      candidates.push(vueAdapter);
      candidates.push(svelteAdapter);
    }

    var el = element;
    while (el && el !== island.parentElement) {
      for (var i = 0; i < candidates.length; i++) {
        if (candidates[i].detect(el)) {
          return candidates[i].getComponentInfo(el);
        }
      }
      el = el.parentElement;
    }

    return Promise.resolve(null);
  }

  var astroAdapter = {
    name: 'astro',

    detect: function(element) {
      return !!element.closest && !!element.closest('astro-island');
    },

    getComponentInfo: function(element) {
      var island = element.closest('astro-island');
      if (!island) return Promise.resolve(null);

      var componentUrl = island.getAttribute('component-url') || '';
      var componentExport = island.getAttribute('component-export') || 'default';
      var rendererUrl = island.getAttribute('renderer-url') || '';
      var clientDirective = island.getAttribute('client') || '';
      var componentName = extractAstroComponentName(componentUrl) || 'AstroIsland';
      var htmlPreview = getHTMLPreview(element);
      var rendererHint = detectInnerFramework(rendererUrl);

      return getInnerFrameworkInfo(element, island, rendererHint).then(function(innerPayload) {
        var stack = [];

        if (innerPayload) {
          if (innerPayload.stack) {
            for (var i = 0; i < innerPayload.stack.length; i++) {
              stack.push(innerPayload.stack[i]);
            }
          } else {
            var innerEntry = { name: innerPayload.component || 'Unknown' };
            if (innerPayload.file) innerEntry.file = innerPayload.file;
            stack.push(innerEntry);
          }
        }

        var astroEntry = { name: componentName };
        if (componentUrl) astroEntry.file = componentUrl;
        stack.push(astroEntry);

        var payload = {
          framework: 'astro',
          component: innerPayload ? innerPayload.component : componentName,
          htmlPreview: htmlPreview,
          stack: stack
        };

        if (componentUrl) payload.file = componentUrl;

        return payload;
      });
    },

    getOverlayLabel: function(element) {
      var island = element.closest('astro-island');
      if (!island) return null;

      var rendererUrl = island.getAttribute('renderer-url') || '';
      var rendererHint = detectInnerFramework(rendererUrl);

      if (rendererHint === 'react' && reactAdapter.getOverlayLabel) {
        var reactLabel = reactAdapter.getOverlayLabel(element);
        if (reactLabel) return reactLabel;
      }
      if (rendererHint === 'vue' && vueAdapter.getOverlayLabel) {
        var vueLabel = vueAdapter.getOverlayLabel(element);
        if (vueLabel) return vueLabel;
      }
      if (rendererHint === 'svelte' && svelteAdapter.getOverlayLabel) {
        var svelteLabel = svelteAdapter.getOverlayLabel(element);
        if (svelteLabel) return svelteLabel;
      }

      var componentUrl = island.getAttribute('component-url');
      return extractAstroComponentName(componentUrl) || null;
    }
  };

  // =============================================================================
  // === HTML FALLBACK ===
  // =============================================================================

  var htmlFallbackAdapter = {
    name: 'html-fallback',

    detect: function() {
      return true;
    },

    getComponentInfo: function(element) {
      var tagName = element.tagName ? element.tagName.toLowerCase() : 'unknown';
      var cssClass = element.className ? String(element.className).split(' ')[0] : undefined;
      return Promise.resolve({
        framework: 'html',
        component: tagName,
        tagName: tagName,
        cssClass: cssClass,
        htmlPreview: getHTMLPreview(element)
      });
    }
  };

  // =============================================================================
  // === ADAPTER REGISTRY & DISPATCHER ===
  // =============================================================================

  var adapters = [astroAdapter, reactAdapter, vueAdapter, svelteAdapter];

  // --- Diagnostic: detect which frameworks are present on the page ---
  function detectFrameworks() {
    var detected = [];
    // Check for Astro islands
    if (document.querySelector('astro-island')) detected.push('astro');
    // Check for React (VKBippy)
    if (typeof VKBippy !== 'undefined' && VKBippy.isInstrumentationActive && VKBippy.isInstrumentationActive()) detected.push('react');
    // Check for Vue
    if (window.__VUE__ || document.querySelector('[data-v-app]')) detected.push('vue');
    // Check for Svelte (check for svelte CSS classes)
    if (document.querySelector('[class*="svelte-"]') || document.querySelector('[data-svelte-h]')) detected.push('svelte');
    return detected;
  }

  // --- Convert ComponentPayload to markdown string (v1 postMessage format) ---
  function payloadToMarkdown(payload) {
    var markdown = payload.htmlPreview;
    if (payload.stack) {
      for (var i = 0; i < payload.stack.length; i++) {
        var entry = payload.stack[i];
        markdown += '\n  in ';
        if (entry.name && entry.file) {
          markdown += entry.name + ' (at ' + entry.file + ')';
        } else if (entry.file) {
          markdown += entry.file;
        } else if (entry.name) {
          markdown += entry.name;
        }
      }
    }
    return markdown;
  }

  // --- Dispatcher: iterate adapters, first match wins, fallback to HTML ---
  // Returns raw ComponentPayload (v2 protocol — no markdown conversion)
  function getElementContext(element) {
    for (var i = 0; i < adapters.length; i++) {
      if (adapters[i].detect(element)) {
        return adapters[i].getComponentInfo(element).then(function(payload) {
          if (payload) return payload;
          return htmlFallbackAdapter.getComponentInfo(element);
        });
      }
    }
    return htmlFallbackAdapter.getComponentInfo(element);
  }

  // --- Get overlay label from first matching adapter ---
  function getOverlayLabelForElement(element) {
    for (var i = 0; i < adapters.length; i++) {
      if (adapters[i].getOverlayLabel) {
        var label = adapters[i].getOverlayLabel(element);
        if (label) return label;
      }
    }
    return null;
  }

  // =============================================================================
  // === CORE: Overlay, Events & Initialization ===
  // =============================================================================

  function createOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:999999;border:2px solid #3b82f6;background:rgba(59,130,246,0.1);transition:all 0.05s ease;display:none;';
    nameLabel = document.createElement('div');
    nameLabel.style.cssText = 'position:absolute;top:-22px;left:0;background:#3b82f6;color:white;font-size:11px;padding:2px 6px;border-radius:3px;white-space:nowrap;font-family:system-ui,sans-serif;';
    overlay.appendChild(nameLabel);
    document.body.appendChild(overlay);
  }

  function removeOverlay() {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    overlay = null;
    nameLabel = null;
  }

  function positionOverlay(element) {
    if (!overlay) return;
    var rect = element.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    var compName = getOverlayLabelForElement(element);
    if (nameLabel) {
      nameLabel.textContent = compName || element.tagName.toLowerCase();
      nameLabel.style.display = 'block';
    }
  }

  function hideOverlay() {
    if (overlay) overlay.style.display = 'none';
  }

  // --- Event handlers ---
  function onMouseOver(event) {
    if (!inspectModeActive) return;
    var el = event.target;
    if (el === overlay || (overlay && overlay.contains(el))) return;
    if (el === lastHoveredElement) return;
    lastHoveredElement = el;
    positionOverlay(el);
  }

  function onClick(event) {
    if (!inspectModeActive) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    var el = event.target;
    if (el === overlay || (overlay && overlay.contains(el))) return;

    // Exit inspect mode immediately (visual feedback)
    setInspectMode(false);

    getElementContext(el).then(function(componentPayload) {
      send('component-detected', componentPayload, 2);
    });
  }

  // --- setInspectMode ---
  function setInspectMode(active) {
    if (active === inspectModeActive) return;
    inspectModeActive = active;

    if (active) {
      createOverlay();
      document.body.style.cursor = 'crosshair';
      document.addEventListener('mouseover', onMouseOver, true);
      document.addEventListener('click', onClick, true);
    } else {
      document.removeEventListener('mouseover', onMouseOver, true);
      document.removeEventListener('click', onClick, true);
      document.body.style.cursor = '';
      hideOverlay();
      removeOverlay();
      lastHoveredElement = null;
    }
  }

  // --- Message listener ---
  window.addEventListener('message', function(event) {
    if (!event.data || event.data.source !== SOURCE) return;
    if (event.data.type === 'toggle-inspect') {
      setInspectMode(event.data.payload && event.data.payload.active);
    }
  });

  // --- Log detected frameworks on page load (diagnostic only) ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      console.debug('[vk-ctc] Detected frameworks:', detectFrameworks().join(', ') || 'none');
    });
  } else {
    console.debug('[vk-ctc] Detected frameworks:', detectFrameworks().join(', ') || 'none');
  }
})();

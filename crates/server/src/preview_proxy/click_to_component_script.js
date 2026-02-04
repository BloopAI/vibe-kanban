(function() {
  'use strict';

  var SOURCE = 'click-to-component';
  var inspectModeActive = false;
  var overlay = null;
  var nameLabel = null;
  var lastHoveredElement = null;

  // Internal component name lists to filter out
  var NEXT_INTERNAL = ['InnerLayoutRouter', 'RedirectErrorBoundary', 'RedirectBoundary',
    'HTTPAccessFallbackErrorBoundary', 'HTTPAccessFallbackBoundary', 'LoadingBoundary',
    'ErrorBoundary', 'InnerScrollAndFocusHandler', 'ScrollAndFocusHandler',
    'RenderFromTemplateContext', 'OuterLayoutRouter', 'body', 'html',
    'DevRootHTTPAccessFallbackBoundary', 'AppDevOverlayErrorBoundary', 'AppDevOverlay',
    'HotReload', 'Router', 'ErrorBoundaryHandler', 'AppRouter', 'ServerRoot',
    'SegmentStateProvider', 'RootErrorBoundary', 'LoadableComponent', 'MotionDOMComponent'];
  var REACT_INTERNAL = ['Suspense', 'Fragment', 'StrictMode', 'Profiler', 'SuspenseList'];

  // --- Helper: check if name is a user source component ---
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

  // --- Helper: send message to parent ---
  function send(type, payload) {
    try {
      window.parent.postMessage({ source: SOURCE, type: type, payload: payload }, '*');
    } catch(e) {}
  }

  // --- Helper: truncate attribute value ---
  function truncateAttr(val) {
    return val.length > 50 ? val.slice(0, 50) + '...' : val;
  }

  // --- Helper: generate HTML preview of element (like react-grab getHTMLPreview) ---
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

  // --- Helper: format stack frames (from getOwnerStack) ---
  function formatStack(stack, maxLines) {
    if (!stack) return '';
    maxLines = maxLines || 3;
    var result = '';
    var count = 0;
    for (var i = 0; i < stack.length && count < maxLines; i++) {
      var frame = stack[i];
      if (frame.isServer) {
        result += '\n  in ' + (frame.functionName || '<anonymous>') + ' (at Server)';
        count++;
        continue;
      }
      if (frame.fileName && typeof VKBippy !== 'undefined' && VKBippy.isSourceFile(frame.fileName)) {
        var line = '\n  in ';
        var hasName = frame.functionName && isSourceComponentName(frame.functionName);
        if (hasName) line += frame.functionName + ' (at ';
        line += VKBippy.normalizeFileName(frame.fileName);
        if (frame.lineNumber && frame.columnNumber) {
          line += ':' + frame.lineNumber + ':' + frame.columnNumber;
        }
        if (hasName) line += ')';
        result += line;
        count++;
      }
    }
    return result;
  }

  // --- Helper: check if stack has source files ---
  function hasSourceFiles(stack) {
    if (!stack) return false;
    for (var i = 0; i < stack.length; i++) {
      if (stack[i].isServer) return true;
      if (stack[i].fileName && typeof VKBippy !== 'undefined' && VKBippy.isSourceFile(stack[i].fileName)) return true;
    }
    return false;
  }

  // --- Helper: get component names by walking fiber tree (fallback) ---
  function getComponentNamesFromFiber(element, maxCount) {
    if (typeof VKBippy === 'undefined' || !VKBippy.isInstrumentationActive()) return [];
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

  // --- Helper: get nearest component display name (for overlay label) ---
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

  // --- Main: detect element context (async) ---
  function getElementContext(element) {
    var html = getHTMLPreview(element);

    if (typeof VKBippy === 'undefined' || !VKBippy.isInstrumentationActive()) {
      return Promise.resolve(html + '\n  (no React component detected)');
    }

    var fiber = VKBippy.getFiberFromHostInstance(element);
    if (!fiber) {
      return Promise.resolve(html + '\n  (no React component detected)');
    }

    return VKBippy.getOwnerStack(fiber).then(function(stack) {
      if (hasSourceFiles(stack)) {
        return html + formatStack(stack, 3);
      }
      // Fallback: component names without file paths
      var names = getComponentNamesFromFiber(element, 3);
      if (names.length > 0) {
        var nameStr = '';
        for (var i = 0; i < names.length; i++) {
          nameStr += '\n  in ' + names[i];
        }
        return html + nameStr;
      }
      return html;
    }).catch(function() {
      // getOwnerStack failed — fall back to fiber walk
      var names = getComponentNamesFromFiber(element, 3);
      if (names.length > 0) {
        var nameStr = '';
        for (var i = 0; i < names.length; i++) {
          nameStr += '\n  in ' + names[i];
        }
        return html + nameStr;
      }
      return html + '\n  (no React component detected)';
    });
  }

  // --- Overlay: create/show/hide ---
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
    var compName = getNearestComponentName(element);
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

    // Detect component (async)
    getElementContext(el).then(function(markdown) {
      send('component-detected', { markdown: markdown });
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
})();

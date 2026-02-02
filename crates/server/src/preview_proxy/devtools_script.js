(function() {
  'use strict';
  
  const SOURCE = 'vibe-devtools';
  
  // === Helper: Send message to parent ===
  function send(type, payload) {
    try {
      window.parent.postMessage({ source: SOURCE, type, payload }, '*');
    } catch (e) {
      // Ignore if parent is not accessible
    }
  }
  
  // === Helper: Serialize argument for postMessage ===
  function serializeArg(arg) {
    if (arg === null) return null;
    if (arg === undefined) return undefined;
    if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
      return arg;
    }
    if (arg instanceof Error) {
      return { __type: 'Error', message: arg.message, stack: arg.stack, name: arg.name };
    }
    if (typeof HTMLElement !== 'undefined' && arg instanceof HTMLElement) {
      return { __type: 'HTMLElement', tagName: arg.tagName, id: arg.id, className: arg.className };
    }
    if (Array.isArray(arg)) {
      return arg.map(serializeArg);
    }
    try {
      // Try to serialize as JSON
      const str = JSON.stringify(arg);
      return JSON.parse(str);
    } catch {
      return String(arg);
    }
  }

  // === Console Interception ===
  const originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
  };
  
  function wrapConsole(level) {
    console[level] = function(...args) {
      send('console', {
        level,
        args: args.map(serializeArg),
        timestamp: Date.now(),
      });
      return originalConsole[level](...args);
    };
  }
  
  ['log', 'warn', 'error', 'info', 'debug'].forEach(wrapConsole);

  // === Network Interception: Fetch ===
  const originalFetch = window.fetch;
  let requestId = 0;
  
  window.fetch = function(input, init) {
    const id = 'fetch-' + (++requestId);
    const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
    const method = (init && init.method) || 'GET';
    
    send('network', {
      id,
      method: method.toUpperCase(),
      url,
      phase: 'start',
      timestamp: Date.now(),
    });
    
    const startTime = Date.now();
    
    return originalFetch.apply(this, arguments)
      .then(function(response) {
        send('network', {
          id,
          method: method.toUpperCase(),
          url,
          status: response.status,
          statusText: response.statusText,
          duration: Date.now() - startTime,
          phase: 'end',
          timestamp: Date.now(),
        });
        return response;
      })
      .catch(function(error) {
        send('network', {
          id,
          method: method.toUpperCase(),
          url,
          error: error.message,
          phase: 'error',
          timestamp: Date.now(),
        });
        throw error;
      });
  };

  // === Network Interception: XMLHttpRequest ===
  const XHROpen = XMLHttpRequest.prototype.open;
  const XHRSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url) {
    this._vkMethod = method;
    this._vkUrl = url;
    this._vkId = 'xhr-' + (++requestId);
    return XHROpen.apply(this, arguments);
  };
  
  XMLHttpRequest.prototype.send = function() {
    const xhr = this;
    const id = xhr._vkId;
    const method = xhr._vkMethod || 'GET';
    const url = xhr._vkUrl || '';
    const startTime = Date.now();
    
    send('network', {
      id,
      method: method.toUpperCase(),
      url: String(url),
      phase: 'start',
      timestamp: Date.now(),
    });
    
    xhr.addEventListener('load', function() {
      send('network', {
        id,
        method: method.toUpperCase(),
        url: String(url),
        status: xhr.status,
        statusText: xhr.statusText,
        duration: Date.now() - startTime,
        phase: 'end',
        timestamp: Date.now(),
      });
    });
    
    xhr.addEventListener('error', function() {
      send('network', {
        id,
        method: method.toUpperCase(),
        url: String(url),
        error: 'Network error',
        phase: 'error',
        timestamp: Date.now(),
      });
    });
    
    return XHRSend.apply(this, arguments);
  };

  // === Error Capture ===
  window.addEventListener('error', function(event) {
    send('error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error ? event.error.stack : undefined,
      timestamp: Date.now(),
    });
  });
  
  window.addEventListener('unhandledrejection', function(event) {
    const reason = event.reason;
    send('error', {
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      timestamp: Date.now(),
    });
  });

  // === Navigation Tracking ===
  function sendNavigation() {
    send('navigation', {
      url: location.href,
      title: document.title,
      canGoBack: history.length > 1,
      canGoForward: false, // Cannot reliably detect forward availability
      timestamp: Date.now(),
    });
  }
  
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function() {
    const result = originalPushState.apply(this, arguments);
    sendNavigation();
    return result;
  };
  
  history.replaceState = function() {
    const result = originalReplaceState.apply(this, arguments);
    sendNavigation();
    return result;
  };
  
  window.addEventListener('popstate', sendNavigation);
  
  // Also track hash changes
  window.addEventListener('hashchange', sendNavigation);

  // === Command Receiver ===
  window.addEventListener('message', function(event) {
    if (!event.data || event.data.source !== SOURCE || event.data.type !== 'navigate') {
      return;
    }
    
    var payload = event.data.payload;
    if (!payload) return;
    
    switch (payload.action) {
      case 'back':
        history.back();
        break;
      case 'forward':
        history.forward();
        break;
      case 'refresh':
        location.reload();
        break;
      case 'goto':
        if (payload.url) {
          location.href = payload.url;
        }
        break;
    }
  });

  // === Ready Signal ===
  send('ready', {});
  
  // Send initial navigation state after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sendNavigation);
  } else {
    sendNavigation();
  }
})();

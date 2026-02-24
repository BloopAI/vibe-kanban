(function() {
  'use strict';

  var SOURCE = 'vibe-devtools';
  var NAV_SESSION_POINTER_KEY = '__vk_nav_session';
  var NAV_SESSION_PREFIX = '__vk_nav_';
  var DOC_ID = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);

  function serializeError(value) {
    if (!value) return null;
    try {
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack || null
        };
      }
      if (typeof value === 'object') {
        return JSON.parse(JSON.stringify(value));
      }
      return String(value);
    } catch (e) {
      return String(value);
    }
  }

  function send(type, payload) {
    try {
      window.parent.postMessage({ source: SOURCE, type: type, payload: payload }, '*');
    } catch (e) {
      // Ignore if parent is not accessible
    }
  }

  function sendDebug(event, details) {
    send('debug', {
      event: event,
      docId: DOC_ID,
      href: location.href,
      title: document.title,
      historyLength: history.length,
      timestamp: Date.now(),
      details: details || null
    });
  }

  function getNavStorageKey() {
    var sessionId = 'default';
    try {
      var params = new URLSearchParams(location.search);
      var refresh = params.get('_refresh');
      if (refresh) {
        sessionStorage.setItem(NAV_SESSION_POINTER_KEY, refresh);
        sessionId = refresh;
      } else {
        var saved = sessionStorage.getItem(NAV_SESSION_POINTER_KEY);
        if (saved) sessionId = saved;
      }
    } catch (e) {
      // sessionStorage may be unavailable
    }
    return NAV_SESSION_PREFIX + sessionId;
  }

  var NAV_STORAGE_KEY = getNavStorageKey();
  var navStack = [];
  var navIndex = -1;
  var navSeq = 0;
  var lastObservedHref = location.href;
  var originalPushState = history.pushState;
  var originalReplaceState = history.replaceState;

  function normalizeUrl(url) {
    try {
      var u = new URL(url);
      u.searchParams.delete('_refresh');
      return u.toString();
    } catch (e) {
      return url;
    }
  }

  function loadNavState() {
    try {
      var saved = sessionStorage.getItem(NAV_STORAGE_KEY);
      if (!saved) return;

      var state = JSON.parse(saved);
      if (Array.isArray(state.stack)) {
        navStack = state.stack
          .map(function(entry) {
            if (typeof entry === 'string') return entry;
            if (entry && typeof entry.url === 'string') return entry.url;
            return null;
          })
          .filter(function(entry) {
            return typeof entry === 'string' && entry.length > 0;
          });
      } else {
        navStack = [];
      }

      navIndex = typeof state.index === 'number' ? state.index : -1;
      if (navIndex >= navStack.length) navIndex = navStack.length - 1;
    } catch (e) {
      navStack = [];
      navIndex = -1;
    }
  }

  function saveNavState() {
    try {
      sessionStorage.setItem(
        NAV_STORAGE_KEY,
        JSON.stringify({
          stack: navStack,
          index: navIndex
        })
      );
    } catch (e) {
      // ignore storage errors
    }
  }

  function sendNavigation() {
    navSeq += 1;
    send('navigation', {
      docId: DOC_ID,
      seq: navSeq,
      url: location.href,
      title: document.title,
      canGoBack: navIndex > 0,
      canGoForward: navIndex < navStack.length - 1,
      timestamp: Date.now()
    });
  }

  function ensureCurrentInStack(currentHref, mode) {
    var normalized = normalizeUrl(currentHref);
    var found = false;

    if (mode === 'replace') {
      if (navIndex >= 0 && navIndex < navStack.length) {
        navStack[navIndex] = currentHref;
      } else {
        navStack = [currentHref];
        navIndex = 0;
      }
      return;
    }

    if (mode === 'push') {
      navStack = navStack.slice(0, navIndex + 1);
      navStack.push(currentHref);
      navIndex = navStack.length - 1;
      return;
    }

    if (navIndex >= 0 && navIndex < navStack.length &&
        normalizeUrl(navStack[navIndex]) === normalized) {
      navStack[navIndex] = currentHref;
      found = true;
    } else if (navIndex + 1 < navStack.length &&
               normalizeUrl(navStack[navIndex + 1]) === normalized) {
      navIndex++;
      navStack[navIndex] = currentHref;
      found = true;
    } else if (navIndex > 0 &&
               normalizeUrl(navStack[navIndex - 1]) === normalized) {
      navIndex--;
      navStack[navIndex] = currentHref;
      found = true;
    } else {
      for (var i = 0; i < navStack.length; i++) {
        if (normalizeUrl(navStack[i]) === normalized) {
          navIndex = i;
          navStack[navIndex] = currentHref;
          found = true;
          break;
        }
      }
    }

    if (!found) {
      navStack = navStack.slice(0, navIndex + 1);
      navStack.push(currentHref);
      navIndex = navStack.length - 1;
    }
  }

  function observeLocation(eventName, details, mode) {
    var previousHref = lastObservedHref;
    var currentHref = location.href;
    lastObservedHref = currentHref;

    ensureCurrentInStack(currentHref, mode || 'auto');
    saveNavState();
    sendNavigation();

    var payload = {
      from: previousHref === currentHref ? null : previousHref,
      to: currentHref,
      stackSize: navStack.length,
      navIndex: navIndex
    };

    if (details && typeof details === 'object') {
      for (var key in details) {
        if (Object.prototype.hasOwnProperty.call(details, key)) {
          payload[key] = details[key];
        }
      }
    }

    sendDebug(eventName, payload);
  }

  function initializeNavigation() {
    loadNavState();

    if (navStack.length === 0) {
      navStack = [location.href];
      navIndex = 0;
      saveNavState();
    } else if (navIndex < 0 || navIndex >= navStack.length) {
      navIndex = navStack.length - 1;
      if (navIndex < 0) navIndex = 0;
      saveNavState();
    }

    observeLocation('nav_initialized', {});
  }

  window.addEventListener('popstate', function() {
    var stateKeys = null;
    try {
      stateKeys = history.state ? Object.keys(history.state) : null;
    } catch (e) {
      stateKeys = null;
    }
    observeLocation('popstate', { stateKeys: stateKeys }, 'auto');
  });

  window.addEventListener('hashchange', function() {
    observeLocation('hashchange', {}, 'auto');
  });

  window.addEventListener('pageshow', function(event) {
    observeLocation('pageshow', { persisted: Boolean(event.persisted) }, 'auto');
  });

  window.addEventListener('load', function() {
    observeLocation('window_load', {}, 'auto');
  });

  history.pushState = function(state, title, url) {
    var result = originalPushState.apply(this, arguments);
    observeLocation('pushstate', {
      urlArgument: typeof url === 'string' ? url : null
    }, 'push');
    return result;
  };

  history.replaceState = function(state, title, url) {
    var result = originalReplaceState.apply(this, arguments);
    observeLocation('replacestate', {
      urlArgument: typeof url === 'string' ? url : null
    }, 'replace');
    return result;
  };

  document.addEventListener('visibilitychange', function() {
    sendDebug('visibilitychange', {
      visibilityState: document.visibilityState
    });
  });

  window.addEventListener('error', function(event) {
    sendDebug('window_error', {
      message: event.message || null,
      filename: event.filename || null,
      lineno: event.lineno || null,
      colno: event.colno || null,
      error: serializeError(event.error)
    });
  });

  window.addEventListener('unhandledrejection', function(event) {
    sendDebug('unhandled_rejection', {
      reason: serializeError(event.reason)
    });
  });

  window.addEventListener('message', function(event) {
    if (!event.data || event.data.source !== SOURCE || event.data.type !== 'navigate') {
      return;
    }

    var payload = event.data.payload;
    if (!payload) return;

    sendDebug('command_received', {
      action: payload.action,
      url: payload.url || null
    });

    switch (payload.action) {
      case 'back':
        if (navIndex > 0) history.back();
        break;
      case 'forward':
        if (navIndex < navStack.length - 1) history.forward();
        break;
      case 'refresh':
        location.reload();
        break;
      case 'goto':
        if (payload.url) {
          navStack = navStack.slice(0, navIndex + 1);
          navStack.push(payload.url);
          navIndex = navStack.length - 1;
          saveNavState();
          sendNavigation();
          sendDebug('command_goto_navigate', {
            to: payload.url
          });
          location.href = payload.url;
        }
        break;
    }
  });

  window.setInterval(function() {
    if (location.href !== lastObservedHref) {
      observeLocation('href_poll_change', {}, 'auto');
    }
  }, 150);

  send('ready', { docId: DOC_ID });
  sendDebug('ready_sent', {
    navStorageKey: NAV_STORAGE_KEY,
    docId: DOC_ID
  });

  initializeNavigation();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      observeLocation('dom_content_loaded', {}, 'auto');
    });
  } else {
    observeLocation('dom_ready_immediate', {}, 'auto');
  }
})();

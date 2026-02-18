(function() {
  'use strict';

  var SOURCE = 'vibe-devtools';

  var originalPushState = history.pushState;
  var originalReplaceState = history.replaceState;

  // === Helper: Send message to parent ===
  function send(type, payload) {
    try {
      window.parent.postMessage({ source: SOURCE, type: type, payload: payload }, '*');
    } catch (e) {
      // Ignore if parent is not accessible
    }
  }

  // History API doesn't expose current position in session history (no currentIndex,
  // no canGoForward). We track our own stack in sessionStorage with __vk_navId in
  // history.state for popstate identification. Sessions segmented by _refresh param.

  function getNavSessionKey() {
    try {
      var params = new URLSearchParams(location.search);
      var refresh = params.get('_refresh');
      if (refresh) {
        sessionStorage.setItem('__vk_nav_session', refresh);
        return '__vk_nav_' + refresh;
      }
      var saved = sessionStorage.getItem('__vk_nav_session');
      if (saved) return '__vk_nav_' + saved;
    } catch (e) { /* sessionStorage may be unavailable */ }
    return '__vk_nav_default';
  }

  var NAV_SESSION_KEY = getNavSessionKey();
  var navStack = [];
  var navIndex = -1;
  var navIdCounter = 0;

  function loadNavState() {
    try {
      var saved = sessionStorage.getItem(NAV_SESSION_KEY);
      if (saved) {
        var state = JSON.parse(saved);
        navStack = Array.isArray(state.stack) ? state.stack : [];
        navIndex = typeof state.index === 'number' ? state.index : -1;
        navIdCounter = typeof state.counter === 'number' ? state.counter : 0;
      }
    } catch (e) { /* ignore parse errors */ }
  }

  function saveNavState() {
    try {
      sessionStorage.setItem(NAV_SESSION_KEY, JSON.stringify({
        stack: navStack,
        index: navIndex,
        counter: navIdCounter
      }));
    } catch (e) { /* ignore quota errors */ }
  }

  function normalizeUrl(url) {
    try {
      var u = new URL(url);
      u.searchParams.delete('_refresh');
      return u.toString();
    } catch (e) {
      return url;
    }
  }

  function sendNavigation() {
    send('navigation', {
      url: location.href,
      title: document.title,
      canGoBack: navIndex > 0,
      canGoForward: navIndex < navStack.length - 1,
      timestamp: Date.now()
    });
  }

  function pushNavEntry(url) {
    var normalized = normalizeUrl(url);
    if (navIndex >= 0 && navIndex < navStack.length &&
        normalizeUrl(navStack[navIndex].url) === normalized) {
      navStack[navIndex].url = url;
      saveNavState();
      return navStack[navIndex].id;
    }
    navStack = navStack.slice(0, navIndex + 1);
    var newId = ++navIdCounter;
    navStack.push({ url: url, id: newId });
    navIndex = navStack.length - 1;
    saveNavState();
    return newId;
  }

  loadNavState();

  var currentUrl = location.href;
  var stateNavId = history.state && history.state.__vk_navId;

  if (stateNavId != null) {
    var foundIndex = -1;
    for (var i = 0; i < navStack.length; i++) {
      if (navStack[i].id === stateNavId) {
        foundIndex = i;
        break;
      }
    }
    if (foundIndex !== -1) {
      navIndex = foundIndex;
      navStack[navIndex].url = currentUrl;
      saveNavState();
    } else {
      pushNavEntry(currentUrl);
    }
  } else {
    var normalizedCurrent = normalizeUrl(currentUrl);
    if (navIndex >= 0 && navIndex < navStack.length &&
        normalizeUrl(navStack[navIndex].url) === normalizedCurrent) {
      navStack[navIndex].url = currentUrl;
      saveNavState();
    } else {
      var newId = pushNavEntry(currentUrl);
      try {
        var currentState = history.state || {};
        originalReplaceState.call(history,
          Object.assign({}, currentState, { __vk_navId: newId }), '');
      } catch (e) { /* ignore */ }
    }
  }

  history.pushState = function(state, title, url) {
    var newId = ++navIdCounter;
    var augmentedState = Object.assign({}, state || {}, { __vk_navId: newId });
    var result = originalPushState.call(this, augmentedState, title, url);

    navStack = navStack.slice(0, navIndex + 1);
    navStack.push({ url: location.href, id: newId });
    navIndex = navStack.length - 1;
    saveNavState();
    sendNavigation();
    return result;
  };

  history.replaceState = function(state, title, url) {
    var currentNavId = (navIndex >= 0 && navIndex < navStack.length)
      ? navStack[navIndex].id
      : ++navIdCounter;
    var augmentedState = Object.assign({}, state || {}, { __vk_navId: currentNavId });
    var result = originalReplaceState.call(this, augmentedState, title, url);

    if (navIndex >= 0 && navIndex < navStack.length) {
      navStack[navIndex] = { url: location.href, id: currentNavId };
    }
    saveNavState();
    sendNavigation();
    return result;
  };

  window.addEventListener('popstate', function() {
    var popNavId = history.state && history.state.__vk_navId;

    if (popNavId != null) {
      for (var i = 0; i < navStack.length; i++) {
        if (navStack[i].id === popNavId) {
          navIndex = i;
          break;
        }
      }
    } else {
      var current = normalizeUrl(location.href);
      var found = false;

      if (navIndex > 0 && normalizeUrl(navStack[navIndex - 1].url) === current) {
        navIndex--;
        found = true;
      } else if (navIndex < navStack.length - 1 &&
                 normalizeUrl(navStack[navIndex + 1].url) === current) {
        navIndex++;
        found = true;
      }

      if (!found) {
        for (var j = 0; j < navStack.length; j++) {
          if (j !== navIndex && normalizeUrl(navStack[j].url) === current) {
            navIndex = j;
            found = true;
            break;
          }
        }
      }

      if (!found) {
        pushNavEntry(location.href);
      }
    }

    saveNavState();
    sendNavigation();
  });

  window.addEventListener('hashchange', function() {
    var currentHref = location.href;
    if (navIndex >= 0 && navStack[navIndex] &&
        normalizeUrl(navStack[navIndex].url) !== normalizeUrl(currentHref)) {
      var hashNavId = pushNavEntry(currentHref);
      try {
        originalReplaceState.call(history,
          Object.assign({}, history.state || {}, { __vk_navId: hashNavId }), '');
      } catch (e) { /* ignore */ }
    }
    sendNavigation();
  });

  // === Command Receiver ===
  window.addEventListener('message', function(event) {
    if (!event.data || event.data.source !== SOURCE || event.data.type !== 'navigate') {
      return;
    }

    var payload = event.data.payload;
    if (!payload) return;

    switch (payload.action) {
      case 'back':
        if (navIndex > 0) {
          history.back();
        }
        break;
      case 'forward':
        if (navIndex < navStack.length - 1) {
          history.forward();
        }
        break;
      case 'refresh':
        location.reload();
        break;
      case 'goto':
        if (payload.url) {
          navStack = navStack.slice(0, navIndex + 1);
          var gotoId = ++navIdCounter;
          navStack.push({ url: payload.url, id: gotoId });
          navIndex = navStack.length - 1;
          saveNavState();
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

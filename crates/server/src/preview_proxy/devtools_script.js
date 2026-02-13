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

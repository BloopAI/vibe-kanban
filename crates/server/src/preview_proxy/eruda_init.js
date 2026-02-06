(function() {
  'use strict';
  
  const SOURCE = 'vibe-devtools';
  const COMMAND_SOURCE = 'vibe-kanban';
  
  // === Helper: Send message to parent ===
  function send(type, payload) {
    try {
      window.parent.postMessage({ source: SOURCE, type, payload }, '*');
    } catch (e) {
      // Ignore if parent is not accessible
    }
  }
  
  // === Initialize Eruda ===
  function initEruda() {
    if (typeof window.eruda === 'undefined') {
      // Eruda CDN failed to load, silently skip
      return;
    }
    
    // Initialize with dark theme
    window.eruda.init({ defaults: { theme: 'Dark' } });
    
    // Hide by default
    window.eruda.hide();
    
    // Send ready signal
    send('eruda-ready', {});
  }
  
  // === Command Receiver ===
  window.addEventListener('message', function(event) {
    if (!event.data || event.data.source !== COMMAND_SOURCE) {
      return;
    }
    
    if (typeof window.eruda === 'undefined') {
      return;
    }
    
    var command = event.data.command;
    
    switch (command) {
      case 'toggle-eruda':
        if (window.eruda._isShow) {
          window.eruda.hide();
        } else {
          window.eruda.show();
        }
        break;
      case 'show-eruda':
        window.eruda.show();
        break;
      case 'hide-eruda':
        window.eruda.hide();
        break;
    }
  });
  
  // === Initialize when ready ===
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEruda);
  } else {
    initEruda();
  }
})();

# Style Override via postMessage

Simple API for overriding styles when embedding the frontend in an iframe.

## Usage

```javascript
// Switch theme
iframe.contentWindow.postMessage({
  type: 'VIBE_STYLE',
  theme: 'purple'  // 'system', 'light', 'dark', 'purple', 'green', 'blue', 'orange', 'red'
}, 'https://your-app-domain.com');

// Override CSS variables (--vibe-* prefix only)
iframe.contentWindow.postMessage({
  type: 'VIBE_STYLE',
  css: {
    '--vibe-primary': '220 14% 96%',
    '--vibe-background': '0 0% 100%'
  }
}, 'https://your-app-domain.com');

// Both together
iframe.contentWindow.postMessage({
  type: 'VIBE_STYLE',
  theme: 'dark',
  css: {
    '--vibe-accent': '210 100% 50%'
  }
}, 'https://your-app-domain.com');
```

## Security

- Origin validation via `VITE_PARENT_ORIGIN` environment variable
- Only `--vibe-*` prefixed CSS variables can be overridden
- Browser validates CSS values automatically

## Example

```html
<iframe id="vibe" src="https://app.com" width="100%" height="600"></iframe>
<script>
  const iframe = document.getElementById('vibe');
  
  iframe.addEventListener('load', () => {
    // Apply custom theme
    iframe.contentWindow.postMessage({
      type: 'VIBE_STYLE',
      theme: 'purple',
      css: {
        '--vibe-brand': '210 100% 50%'
      }
    }, 'https://app.com');
  });
</script>
```

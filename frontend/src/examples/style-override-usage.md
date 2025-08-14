# Style Override via postMessage

This document shows how to use the style override feature when embedding the Vibe Kanban frontend in an iframe.

## Configuration

The parent origin can be configured via the `VITE_PARENT_ORIGIN` environment variable for enhanced security. If not set, messages from all origins will be accepted.

## API Reference

### Theme Override

Switch between predefined themes:

```javascript
// Switch to purple theme
iframe.contentWindow.postMessage(
  {
    type: 'VIBE_STYLE_OVERRIDE',
    payload: {
      kind: 'theme',
      theme: 'purple',
    },
  },
  'https://your-app-domain.com'
);

// Available themes: 'system', 'light', 'dark', 'purple', 'green', 'blue', 'orange', 'red'
```

### CSS Variables Override

Override individual CSS custom properties:

```javascript
// Override specific color variables
iframe.contentWindow.postMessage(
  {
    type: 'VIBE_STYLE_OVERRIDE',
    payload: {
      kind: 'cssVars',
      variables: {
        '--primary': '220 14% 96%', // HSL triplet format
        '--background': '0 0% 100%', // HSL triplet format
        '--radius': '1rem', // rem value for border radius
      },
    },
  },
  'https://your-app-domain.com'
);
```

## Response/Acknowledgment

The iframe will send back an acknowledgment message:

```javascript
// Listen for acknowledgments
window.addEventListener('message', (event) => {
  if (event.data.type === 'VIBE_STYLE_OVERRIDE_ACK') {
    if (event.data.applied) {
      console.log('Style override applied successfully');

      if (event.data.kind === 'theme') {
        console.log('Theme changed to:', event.data.theme);
      } else if (event.data.kind === 'cssVars') {
        console.log('Applied variables:', event.data.appliedVariables);
        console.log('Rejected variables:', event.data.rejectedVariables);
      }
    } else {
      console.error('Style override failed:', event.data.error);
    }
  }
});
```

## Security

- Only CSS variables from the allowlist can be overridden
- CSS values are validated (HSL triplets for colors, rem values for radius)
- Origin checking is enforced if `VITE_PARENT_ORIGIN` is configured
- Invalid variables/values are rejected and logged

## Supported CSS Variables

The following CSS variables can be overridden:

### Base Theme Variables

- `--background`, `--foreground`
- `--card`, `--card-foreground`
- `--popover`, `--popover-foreground`
- `--primary`, `--primary-foreground`
- `--secondary`, `--secondary-foreground`
- `--muted`, `--muted-foreground`
- `--accent`, `--accent-foreground`
- `--destructive`, `--destructive-foreground`
- `--border`, `--input`, `--ring`
- `--radius`

### Status Colors

- `--success`, `--success-foreground`
- `--warning`, `--warning-foreground`
- `--info`, `--info-foreground`
- `--neutral`, `--neutral-foreground`

### Status Indicators

- `--status-init`, `--status-init-foreground`
- `--status-running`, `--status-running-foreground`
- `--status-complete`, `--status-complete-foreground`
- `--status-failed`, `--status-failed-foreground`
- `--status-paused`, `--status-paused-foreground`

### Console Colors

- `--console-background`, `--console-foreground`
- `--console-success`, `--console-error`

## Example: Complete Integration

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Vibe Kanban Embedded</title>
  </head>
  <body>
    <h1>My Dashboard</h1>

    <!-- Theme selector -->
    <select id="theme-selector">
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
      <option value="purple">Purple</option>
      <option value="green">Green</option>
      <option value="blue">Blue</option>
      <option value="orange">Orange</option>
      <option value="red">Red</option>
    </select>

    <!-- Embedded iframe -->
    <iframe
      id="vibe-iframe"
      src="https://your-vibe-kanban-app.com"
      width="100%"
      height="600px"
    >
    </iframe>

    <script>
      const iframe = document.getElementById('vibe-iframe');
      const themeSelector = document.getElementById('theme-selector');

      // Handle theme changes
      themeSelector.addEventListener('change', (event) => {
        iframe.contentWindow.postMessage(
          {
            type: 'VIBE_STYLE_OVERRIDE',
            payload: {
              kind: 'theme',
              theme: event.target.value,
            },
          },
          'https://your-vibe-kanban-app.com'
        );
      });

      // Listen for acknowledgments
      window.addEventListener('message', (event) => {
        if (event.data.type === 'VIBE_STYLE_OVERRIDE_ACK') {
          console.log('Style override result:', event.data);
        }
      });

      // Apply custom branding colors when iframe loads
      iframe.addEventListener('load', () => {
        iframe.contentWindow.postMessage(
          {
            type: 'VIBE_STYLE_OVERRIDE',
            payload: {
              kind: 'cssVars',
              variables: {
                '--primary': '210 100% 50%', // Your brand blue
                '--primary-foreground': '0 0% 100%',
              },
            },
          },
          'https://your-vibe-kanban-app.com'
        );
      });
    </script>
  </body>
</html>
```

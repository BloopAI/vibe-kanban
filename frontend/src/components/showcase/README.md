# Showcase System Developer Guide

## 1. Overview

The showcase system provides a modal-based, multi-stage onboarding experience for introducing new features to users. Each showcase consists of multiple stages with rich media (videos or images) and localized text.

**When to use it:**

- Introducing new features that require explanation
- Onboarding flows for complex UI components
- Feature announcements with visual demonstrations

## 2. Quick Start

Add a new showcase in 5 steps:

### Step 1: Define ShowcaseConfig

Add your showcase to [`frontend/src/config/showcases.ts`](../../../config/showcases.ts):

```typescript
export const myFeatureShowcase: ShowcaseConfig = {
  id: 'my-feature-onboarding',
  version: '1.0.0',
  stages: [
    {
      titleKey: 'showcases.myFeature.stage1.title',
      descriptionKey: 'showcases.myFeature.stage1.description',
      media: {
        type: 'video',
        src: 'https://example.com/video.mp4',
      },
    },
  ],
};

// Export it
export const showcases = {
  taskPanel: taskPanelShowcase,
  myFeature: myFeatureShowcase,
};
```

### Step 2: Add i18n Keys

Add translations to [`frontend/src/i18n/locales/en/tasks.json`](../../../i18n/locales/en/tasks.json):

```json
{
  "showcases": {
    "myFeature": {
      "stage1": {
        "title": "Feature Title",
        "description": "Feature description explaining what the user can do."
      }
    }
  }
}
```

### Step 3: Prepare Media

- Host videos or images on a CDN or static file server
- Ensure videos are encoded for web (MP4/H.264)
- Use the recommended 16:10 aspect ratio (1728 × 1080)

### Step 4: Trigger the Showcase

Use the `useShowcaseTrigger` hook to automatically manage showcase visibility:

```typescript
import { FeatureShowcaseModal } from '@/components/showcase/FeatureShowcaseModal';
import { useShowcaseTrigger } from '@/hooks/useShowcaseTrigger';
import { myFeatureShowcase } from '@/config/showcases';

function MyComponent() {
  const isFeatureActive = /* your condition here */;

  const { isOpen, close } = useShowcaseTrigger(myFeatureShowcase, {
    enabled: isFeatureActive,
  });

  return (
    <>
      {/* Your component */}
      <FeatureShowcaseModal
        isOpen={isOpen}
        onClose={close}
        config={myFeatureShowcase}
      />
    </>
  );
}
```

**Hook options:**

- `enabled` (required): Boolean to control when the showcase can appear
- `openDelay`: Milliseconds to wait before showing (default: 300)
- `resetOnDisable`: Reset `isOpen` when `enabled` becomes false (default: true)
- `markSeenOnClose`: Automatically mark as seen when closed (default: true)

### Step 5: Test and Verify

- Clear localStorage: `localStorage.clear()` in browser console
- Verify all stages display correctly
- Check translations appear
- Test video playback
- Confirm persistence works (shouldn't show again after finishing)

## 3. ShowcaseConfig Structure

```typescript
interface ShowcaseConfig {
  id: string; // Unique identifier (e.g., 'task-panel-onboarding')
  version: string; // Semver version (e.g., '1.0.0')
  stages: ShowcaseStage[];
}
```

**Properties:**

- `id`: Unique identifier used for persistence. Should be descriptive and stable (don't change this).
- `version`: Semantic version string. Increment when updating content. Users who've seen older versions will see new ones.
- `stages`: Array of showcase stages (see below).

### ShowcaseStage Properties

```typescript
interface ShowcaseStage {
  titleKey: string; // i18n key for stage title
  descriptionKey: string; // i18n key for stage description
  media: ShowcaseMedia; // Media to display
}
```

**Properties:**

- `titleKey`: Translation key for the stage title (e.g., `'showcases.myFeature.stage1.title'`)
- `descriptionKey`: Translation key for the stage description
- `media`: Media object defining what to display

### ShowcaseMedia Properties

```typescript
interface ShowcaseMedia {
  type: 'image' | 'video'; // Media type
  src: string; // URL to media file
  poster?: string; // Optional poster image URL (for videos)
  alt?: string; // Optional alt text (for images)
}
```

**Properties:**

- `type`: Either `'video'` or `'image'`
- `src`: Full URL to the media file
- `poster`: (Optional) Thumbnail image shown before video plays
- `alt`: (Optional) Alt text for accessibility (images only)

## 4. Media Guidelines

### Supported Formats

- **Videos**: MP4 (H.264 codec recommended)
- **Images**: PNG, JPG, WebP, GIF

### Video Recommendations

- **Aspect Ratio**: 16:10 (1728 × 1080 pixels)
- **File Size**: < 5MB per video for optimal loading
- **Duration**: 5-15 seconds per stage
- **Encoding**: H.264 codec, web-optimized
- **Hosting**: Use a CDN for best performance

### Image Recommendations

- **Aspect Ratio**: 16:10 (1728 × 1080 pixels)
- **File Size**: < 1MB per image
- **Format**: PNG for screenshots, JPG for photos, WebP for best compression

### Example Media Objects

```typescript
// Video with poster
media: {
  type: 'video',
  src: 'https://cdn.example.com/feature-demo.mp4',
  poster: 'https://cdn.example.com/feature-poster.jpg',
}

// Simple video
media: {
  type: 'video',
  src: 'https://cdn.example.com/demo.mp4',
}

// Image
media: {
  type: 'image',
  src: 'https://cdn.example.com/screenshot.png',
  alt: 'Screenshot showing the new feature',
}
```

## 5. Trigger Locations

### Common Patterns

**On Component Mount (First Time):**

```typescript
const { isOpen, close } = useShowcaseTrigger(showcase, {
  enabled: true, // Always enabled, will show once if not seen
});
```

**On Specific Condition:**

```typescript
const isFeatureReady = /* your condition */;

const { isOpen, close } = useShowcaseTrigger(showcase, {
  enabled: isFeatureReady, // Only show when condition is met
});
```

**With Custom Delay:**

```typescript
const { isOpen, close } = useShowcaseTrigger(showcase, {
  enabled: isFeatureReady,
  openDelay: 500, // Wait 500ms after enabled becomes true
});
```

**Manual Control (Don't Mark as Seen on Close):**

```typescript
const { isOpen, close, open, hasSeen } = useShowcaseTrigger(showcase, {
  enabled: false, // Manually control when to open
  markSeenOnClose: false, // Don't auto-mark as seen
});

// Manually trigger later
const handleShowDemo = () => {
  if (!hasSeen) {
    open();
  }
};
```

### Real-World Example from project-tasks.tsx

```typescript
import { FeatureShowcaseModal } from '@/components/showcase/FeatureShowcaseModal';
import { useShowcaseTrigger } from '@/hooks/useShowcaseTrigger';
import { taskPanelShowcase } from '@/config/showcases';

function ProjectTasks() {
  const isPanelOpen = Boolean(taskId && selectedTask);

  // Automatically show showcase when panel opens (if not seen before)
  const { isOpen: showTaskPanelShowcase, close: closeTaskPanelShowcase } =
    useShowcaseTrigger(taskPanelShowcase, {
      enabled: isPanelOpen,
    });

  return (
    <div>
      {/* Component content */}
      <FeatureShowcaseModal
        isOpen={showTaskPanelShowcase}
        onClose={closeTaskPanelShowcase}
        config={taskPanelShowcase}
      />
    </div>
  );
}
```

## 6. Versioning & Updates

### How Version Bumping Works

The showcase system uses localStorage to track which versions users have seen. The storage key is:

```
showcase:{id}:v{version}:seen
```

**When to increment version:**

- Adding new stages
- Significantly changing content or media
- Major feature updates that warrant re-showing the showcase

**Version format:**

Use semantic versioning (semver):

- `1.0.0` → Initial release
- `1.1.0` → Added new stage or minor content update
- `2.0.0` → Major overhaul of showcase

**Example:**

```typescript
// Original
export const myShowcase: ShowcaseConfig = {
  id: 'my-feature',
  version: '1.0.0',
  stages: [
    /* ... */
  ],
};

// After adding a new stage
export const myShowcase: ShowcaseConfig = {
  id: 'my-feature',
  version: '1.1.0', // ← Incremented
  stages: [
    /* ... new stage added */
  ],
};
```

**Important:** Never change the `id` field, or users will see the showcase again regardless of version.

## 7. i18n Best Practices

### Key Naming Conventions

```
showcases.{featureName}.{stageName}.{field}
```

**Examples:**

```
showcases.taskPanel.companion.title
showcases.taskPanel.companion.description
showcases.myFeature.stage1.title
showcases.myFeature.stage1.description
```

### Where to Add Translations

Add showcase translations to the `tasks` namespace:

**File:** `frontend/src/i18n/locales/en/tasks.json`

```json
{
  "showcases": {
    "myFeature": {
      "stage1": {
        "title": "Introducing the New Feature",
        "description": "This feature allows you to accomplish X, Y, and Z with greater efficiency."
      },
      "stage2": {
        "title": "How It Works",
        "description": "Follow these steps to get started..."
      }
    }
  }
}
```

### Translation Tips

- **Keep titles short**: 3-7 words maximum
- **Descriptions should be concise**: 1-2 sentences explaining the value
- **Use active voice**: "Click to select" not "Components can be selected"
- **Focus on benefits**: What can the user do with this feature?

## 8. Testing Checklist

### Manual Testing Steps

1. **Clear localStorage:**

   ```javascript
   // In browser console
   localStorage.clear();
   // Or specifically:
   localStorage.removeItem('showcase:my-feature:v1.0.0:seen');
   ```

2. **Verify translations appear:**
   - Check all stage titles and descriptions
   - Ensure no missing translation keys (e.g., `showcases.myFeature.stage1.title`)

3. **Test media playback:**
   - Videos should autoplay and loop
   - Images should display without distortion
   - Check poster images appear before video plays

4. **Test navigation:**
   - Click "Next" through all stages
   - Click "Previous" to go back
   - Verify "Finish" appears on last stage

5. **Test persistence:**
   - Click "Finish" on the last stage
   - Refresh the page
   - Confirm it doesn't show again

6. **Test on different viewports:**
   - Desktop (1920x1080, 1366x768)
   - Tablet (768px width)
   - Mobile responsiveness

## 9. Troubleshooting

### Translation Keys Not Showing

**Problem:** You see `showcases.myFeature.stage1.title` instead of the actual title.

**Solutions:**

- Verify the key exists in `frontend/src/i18n/locales/en/tasks.json`
- Check for typos in the key name
- Ensure the JSON is valid (no trailing commas, proper quotes)
- Restart the dev server to reload translations

### Showcase Not Appearing

**Problem:** The showcase doesn't display when it should.

**Solutions:**

- Check `hasSeen()` returns `false` (clear localStorage)
- Verify the trigger condition is met (e.g., `isPanelOpen === true`)
- Check browser console for errors
- Ensure `isOpen` prop is set to `true`

### Videos Not Loading

**Problem:** Videos fail to play or show broken.

**Solutions:**

- Verify the video URL is accessible (open in new tab)
- Check video encoding (should be H.264 MP4)
- Ensure CORS headers allow video loading
- Check browser console for network errors
- Try adding a poster image as fallback

### Showcase Shows Every Time

**Problem:** The showcase appears on every page load despite being closed.

**Solutions:**

- Verify `markSeen()` is called in the `onClose` handler
- Check localStorage for the key: `localStorage.getItem('showcase:id:v1.0.0:seen')`
- Ensure the `id` and `version` match between config and persistence calls
- Check for errors in `onClose` handler that prevent `markSeen()` execution

### Layout/Styling Issues

**Problem:** Media doesn't fit properly or modal looks broken.

**Solutions:**

- Check media aspect ratio (should be 16:10)
- Verify media dimensions (recommended: 1728 × 1080)
- Inspect CSS in browser DevTools
- Check for CSS conflicts with other components

---

## Additional Resources

- [FeatureShowcaseModal Component](./FeatureShowcaseModal.tsx)
- [ShowcaseStageMedia Component](./ShowcaseStageMedia.tsx)
- [Type Definitions](../../types/showcase.ts)
- [Persistence Utilities](../../utils/showcasePersistence.ts)
- [Example Showcase Configuration](../../config/showcases.ts)

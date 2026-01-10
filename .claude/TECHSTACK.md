# iKanban Tech Stack Reference

Claude should reference this for accurate library usage and versions.

## Frontend (vibe-frontend)

### Core
| Package | Version | Usage |
|---------|---------|-------|
| react | ^18.2.0 | UI framework |
| vite | 5.0.8 | Build tool |
| typescript | 5.9.2 | Type safety |

### UI Components (shadcn/ui stack)
| Package | Version | Usage |
|---------|---------|-------|
| @radix-ui/react-* | ^1.x-2.x | Primitives for shadcn |
| tailwindcss | v4 | Styling |
| class-variance-authority | ^0.7.1 | Variant styling |
| clsx | ^2.0.0 | Class merging |
| lucide-react | ^0.539.0 | Icons |

### State & Data
| Package | Version | Usage |
|---------|---------|-------|
| zustand | (latest) | Global state |
| @tanstack/react-query | ^5.85.5 | Server state |
| @tanstack/react-form | ^1.23.8 | Form handling |
| idb-keyval | ^6.2.2 | IndexedDB persistence |

### Auth & Services
| Package | Version | Usage |
|---------|---------|-------|
| @clerk/clerk-react | ^5.59.2 | Authentication |
| @supabase/supabase-js | ^2.90.0 | Storage/DB client |
| @sentry/react | ^9.34.0 | Error tracking |
| posthog-js | ^1.276.0 | Analytics |

### Rich Text & Code
| Package | Version | Usage |
|---------|---------|-------|
| lexical | ^0.36.2 | Rich text editor |
| @uiw/react-codemirror | ^4.25.1 | Code editor |
| highlight.js | ^11.11.1 | Syntax highlighting |
| react-markdown | (latest) | Markdown rendering |

### Utilities
| Package | Version | Usage |
|---------|---------|-------|
| date-fns | ^4.1.0 | Date formatting |
| lodash | ^4.17.21 | Utilities |
| framer-motion | ^12.23.24 | Animations |
| react-hotkeys-hook | ^5.1.0 | Keyboard shortcuts |
| i18next | ^25.5.2 | Internationalization |

### Drag & Drop
| Package | Version | Usage |
|---------|---------|-------|
| @dnd-kit/core | ^6.3.1 | Drag and drop |
| @dnd-kit/utilities | ^3.2.2 | DnD utilities |

## Backend (vibe-backend)

### Core
| Crate | Version | Usage |
|-------|---------|-------|
| tokio | 1.0 | Async runtime |
| axum | 0.8.4 | Web framework |
| tower-http | 0.5 | HTTP middleware |

### Database
| Crate | Version | Usage |
|-------|---------|-------|
| sqlx | (workspace) | Compile-time SQL |
| uuid | (workspace) | UUID handling |
| chrono | (workspace) | DateTime |

### Serialization
| Crate | Version | Usage |
|-------|---------|-------|
| serde | 1.0 | Serialization |
| serde_json | 1.0 | JSON handling |
| ts-rs | (git) | TypeScript type gen |
| schemars | 1.0.4 | JSON Schema |

### Error Handling
| Crate | Version | Usage |
|-------|---------|-------|
| anyhow | 1.0 | Error context |
| thiserror | 2.0.12 | Custom errors |

### Observability
| Crate | Version | Usage |
|-------|---------|-------|
| tracing | 0.1.43 | Structured logging |
| tracing-subscriber | 0.3 | Log formatting |
| sentry | (latest) | Error tracking |

## Database

| Technology | Details |
|------------|---------|
| Provider | Supabase |
| Engine | PostgreSQL |
| Schema | Drizzle ORM (TypeScript) |
| Queries | SQLx (compile-time) |
| Storage | Supabase Storage |

## Code Patterns

### Frontend Component
```tsx
import { Button } from "@/components/ui/button";
import { useAuth } from "@clerk/clerk-react";

export function MyComponent() {
  const { userId } = useAuth();
  return <Button>Click</Button>;
}
```

### Backend Handler
```rust
use axum::{extract::State, Json};
use sqlx::PgPool;

pub async fn handler(
    State(pool): State<PgPool>,
) -> Result<Json<Response>, AppError> {
    // ...
}
```

### SQLx Query
```rust
sqlx::query_as!(
    Model,
    r#"SELECT id as "id!: Uuid",
              created_at as "created_at!: DateTime<Utc>"
       FROM table WHERE id = $1"#,
    id
)
.fetch_one(&pool)
.await?
```

## Import Aliases

### Frontend
```typescript
@/components/* → src/components/*
@/lib/*        → src/lib/*
@/hooks/*      → src/hooks/*
@/stores/*     → src/stores/*
@/types/*      → src/types/*
```

## Environment Variables

### Frontend (.env.local)
```
VITE_CLERK_PUBLISHABLE_KEY=pk_...
VITE_API_URL=http://localhost:3001
VITE_POSTHOG_API_KEY=...
VITE_SENTRY_DSN=...
```

### Backend (.env)
```
DATABASE_URL=postgres://...
CLERK_SECRET_KEY=sk_...
SENTRY_DSN=...
PORT=3001
```

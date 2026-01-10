# iKanban Code Patterns

Common patterns and conventions used in this codebase.

## Frontend Patterns

### Component Structure
```tsx
// src/components/feature/FeatureName.tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useFeatureHook } from "@/hooks/useFeatureHook";

interface FeatureNameProps {
  id: string;
  onComplete?: () => void;
}

export function FeatureName({ id, onComplete }: FeatureNameProps) {
  const [state, setState] = useState(false);
  const { data, isLoading } = useFeatureHook(id);

  if (isLoading) return <Skeleton />;

  return (
    <div className="flex flex-col gap-4">
      {/* content */}
    </div>
  );
}
```

### Custom Hook Pattern
```tsx
// src/hooks/useFeature.ts
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useFeature(id: string) {
  const query = useQuery({
    queryKey: ["feature", id],
    queryFn: () => api.getFeature(id),
  });

  const mutation = useMutation({
    mutationFn: api.updateFeature,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature", id] });
    },
  });

  return { ...query, update: mutation.mutate };
}
```

### Zustand Store Pattern
```tsx
// src/stores/featureStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface FeatureState {
  items: Item[];
  addItem: (item: Item) => void;
  removeItem: (id: string) => void;
}

export const useFeatureStore = create<FeatureState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item) => set((s) => ({ items: [...s.items, item] })),
      removeItem: (id) => set((s) => ({
        items: s.items.filter((i) => i.id !== id)
      })),
    }),
    { name: "feature-storage" }
  )
);
```

### Modal Pattern (NiceModal)
```tsx
// src/components/dialogs/FeatureDialog.tsx
import NiceModal, { useModal } from "@ebay/nice-modal-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export const FeatureDialog = NiceModal.create<{ id: string }>(({ id }) => {
  const modal = useModal();

  return (
    <Dialog open={modal.visible} onOpenChange={modal.hide}>
      <DialogContent>
        {/* content */}
      </DialogContent>
    </Dialog>
  );
});

// Usage:
NiceModal.show(FeatureDialog, { id: "123" });
```

### API Call Pattern
```tsx
// src/lib/api.ts
const API_URL = import.meta.env.VITE_API_URL;

export const api = {
  async getFeature(id: string) {
    const res = await fetch(`${API_URL}/api/features/${id}`, {
      headers: await getAuthHeaders(),
    });
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
  },
};

async function getAuthHeaders() {
  const token = await clerk.session?.getToken();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}
```

## Backend Patterns

### Axum Handler Pattern
```rust
// src/routes/feature.rs
use axum::{
    extract::{Path, State},
    Json,
};

pub async fn get_feature(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    claims: Claims,  // Auth middleware extracts this
) -> Result<Json<Feature>, AppError> {
    let feature = db::get_feature(&pool, id, claims.user_id).await?;
    Ok(Json(feature))
}

pub async fn create_feature(
    State(pool): State<PgPool>,
    claims: Claims,
    Json(payload): Json<CreateFeatureRequest>,
) -> Result<Json<Feature>, AppError> {
    let feature = db::create_feature(&pool, claims.user_id, payload).await?;
    Ok(Json(feature))
}
```

### SQLx Query Pattern
```rust
// crates/db/src/features.rs
pub async fn get_feature(
    pool: &PgPool,
    id: Uuid,
    user_id: String,
) -> Result<Feature, sqlx::Error> {
    sqlx::query_as!(
        Feature,
        r#"
        SELECT
            id as "id!: Uuid",
            name,
            created_at as "created_at!: DateTime<Utc>",
            updated_at as "updated_at!: DateTime<Utc>"
        FROM features
        WHERE id = $1 AND user_id = $2
        "#,
        id,
        user_id
    )
    .fetch_one(pool)
    .await
}
```

### Error Handling Pattern
```rust
// crates/server/src/error.rs
use axum::{http::StatusCode, response::IntoResponse, Json};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Not found")]
    NotFound,
    #[error("Unauthorized")]
    Unauthorized,
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match self {
            AppError::NotFound => (StatusCode::NOT_FOUND, "Not found"),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "Unauthorized"),
            AppError::Database(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}
```

### Router Pattern
```rust
// crates/server/src/routes/mod.rs
use axum::{routing::{get, post}, Router};

pub fn feature_routes() -> Router<AppState> {
    Router::new()
        .route("/features", get(list_features).post(create_feature))
        .route("/features/:id", get(get_feature).put(update_feature).delete(delete_feature))
}
```

## File Naming Conventions

### Frontend
```
src/
├── components/
│   ├── ui/              # shadcn components (kebab-case)
│   │   └── button.tsx
│   ├── dialogs/         # Modal dialogs (PascalCase)
│   │   └── FeatureDialog.tsx
│   └── feature/         # Feature components (PascalCase)
│       └── FeatureCard.tsx
├── hooks/               # Custom hooks (camelCase with use prefix)
│   └── useFeature.ts
├── stores/              # Zustand stores (camelCase)
│   └── featureStore.ts
├── lib/                 # Utilities (camelCase)
│   └── api.ts
└── types/               # Type definitions (camelCase)
    └── feature.ts
```

### Backend
```
crates/
├── server/src/
│   ├── routes/          # Route handlers (snake_case)
│   │   └── feature.rs
│   └── middleware/      # Middleware (snake_case)
│       └── auth.rs
├── db/src/
│   └── features.rs      # DB operations (snake_case)
└── services/src/
    └── feature.rs       # Business logic (snake_case)
```

## Testing Patterns

### Frontend Test
```tsx
import { render, screen } from "@testing-library/react";
import { FeatureName } from "./FeatureName";

describe("FeatureName", () => {
  it("renders correctly", () => {
    render(<FeatureName id="123" />);
    expect(screen.getByText("Feature")).toBeInTheDocument();
  });
});
```

### Backend Test
```rust
#[tokio::test]
async fn test_get_feature() {
    let pool = setup_test_db().await;
    let feature = db::get_feature(&pool, test_id, test_user).await;
    assert!(feature.is_ok());
}
```

# User Login OAuth Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          USER LOGIN OAUTH FLOW                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  User    │     │ Frontend │     │ Backend  │     │  Remote  │     │ Provider │
│          │     │          │     │  Server  │     │  Server  │     │ (GitHub/ │
│          │     │          │     │          │     │          │     │  Google) │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │                │
     │  Click Login   │                │                │                │
     │───────────────>│                │                │                │
     │                │                │                │                │
     │                │ Show Login     │                │                │
     │                │ Modal          │                │                │
     │<───────────────│                │                │                │
     │                │                │                │                │
     │ Select Provider│                │                │                │
     │ (GitHub/Google)│                │                │                │
     │───────────────>│                │                │                │
     │                │                │                │                │
     │                │  POST /api/auth/handoff/init   │                │
     │                │  {provider, return_to}         │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ Generate       │                │
     │                │                │ app_verifier   │                │
     │                │                │ app_challenge  │                │
     │                │                │                │                │
     │                │                │  POST /auth/handoff/init        │
     │                │                │  {provider, app_challenge}      │
     │                │                │───────────────>│                │
     │                │                │                │                │
     │                │                │                │ Generate       │
     │                │                │                │ handoff_id     │
     │                │                │                │ authorize_url  │
     │                │                │                │                │
     │                │                │  {handoff_id, authorize_url}    │
     │                │                │<───────────────│                │
     │                │                │                │                │
     │                │                │ Store handoff  │                │
     │                │                │ state          │                │
     │                │                │                │                │
     │                │  {handoff_id, authorize_url}   │                │
     │                │<───────────────│                │                │
     │                │                │                │                │
     │                │ Open popup     │                │                │
     │                │ window         │                │                │
     │                │────────────────────────────────────────────────>│
     │                │                │                │                │
     │                │                │                │                │ User
     │                │                │                │                │ authenticates
     │                │                │                │                │
     │                │                │                │  Redirect with │
     │                │                │                │  app_code      │
     │                │                │                │<───────────────│
     │                │                │                │                │
     │                │  GET /api/auth/handoff/complete?app_code=...   │
     │                │<──────────────────────────────────────────────────
     │                │                │                │                │
     │                │                │  handoff/complete              │
     │                │                │───────────────>│                │
     │                │                │                │                │
     │                │                │                │  handoff/redeem│
     │                │                │                │───────────────>│
     │                │                │                │                │
     │                │                │                │  {access_token,│
     │                │                │                │   refresh_token}
     │                │                │                │<───────────────│
     │                │                │                │                │
     │                │                │  {access_token, refresh_token} │
     │                │                │<───────────────│                │
     │                │                │                │                │
     │                │                │ Save credentials               │
     │                │                │ Cache profile  │                │
     │                │                │                │                │
     │                │  Close popup   │                │                │
     │                │  window        │                │                │
     │                │<───────────────│                │                │
     │                │                │                │                │
     │                │  GET /api/auth/status          │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │  {logged_in: true, profile}    │                │
     │                │<───────────────│                │                │
     │                │                │                │                │
     │  Show logged   │                │                │                │
     │  in state      │                │                │                │
     │<───────────────│                │                │                │
     │                │                │                │                │
```

## Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/handoff/init` | POST | Initialize OAuth handoff |
| `/api/auth/handoff/complete` | GET | Complete OAuth callback |
| `/api/auth/status` | GET | Check login status |
| `/api/auth/logout` | POST | Logout user |

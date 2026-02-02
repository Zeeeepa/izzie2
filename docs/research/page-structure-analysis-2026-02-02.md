# Izzie Page Structure Analysis

**Date:** 2026-02-02
**Researcher:** Research Agent
**Ticket Context:** Task #14 - Make /login the default landing page

## Summary

This analysis documents the current page structure of Izzie and outlines changes needed to make `/login` the default landing page.

## Current Page Structure

### Root URL (`/`)
**File:** `src/app/page.tsx`

**Current Behavior:**
- Client-side rendered page (`'use client'`)
- Checks authentication status using `authClient.getSession()`
- **Authenticated users:** Redirected to `/dashboard`
- **Unauthenticated users:** Shows a minimal landing page with:
  - "Izzie2 - AI Personal Assistant" heading
  - "Sign in with Google" link pointing to `/login`

**Key Code:**
```typescript
useEffect(() => {
  authClient.getSession().then((result) => {
    if (result.data?.user) {
      router.replace('/dashboard');
    } else {
      setIsLoading(false);
    }
  });
}, [router]);
```

### Login Page (`/login`)
**File:** `src/app/login/page.tsx`

**Current Behavior:**
- Client-side rendered page (`'use client'`)
- Beautiful, polished design with:
  - Gradient background with dot pattern
  - Decorative gradient orbs
  - Izzie branding with icon
  - Google Sign-in button
  - Links to Terms of Service and Privacy Policy
- Checks if user is already authenticated and redirects to `/dashboard`
- Handles OAuth flow via `authClient.signIn.social()`

### Other Landing/Marketing Pages

| Route | File | Purpose |
|-------|------|---------|
| `/privacy` | `src/app/privacy/page.tsx` | Privacy Policy (static, required for OAuth) |
| `/terms` | `src/app/terms/page.tsx` | Terms of Service (static, required for OAuth) |

Both `/privacy` and `/terms` link back to `/` (the root).

### Dashboard Pages (Protected)

All under `src/app/dashboard/`:
- `/dashboard` - Main dashboard with quick actions
- `/dashboard/chat` - AI chat interface
- `/dashboard/entities` - People, companies, topics
- `/dashboard/relationships` - Connections & context
- `/dashboard/discover` - Find new entities
- `/dashboard/settings/*` - Various settings pages
- `/dashboard/calendar` - Calendar
- `/dashboard/people` - People management
- And more...

### Admin Pages
- `/admin/ingestion` - Admin ingestion interface

## Authentication Routing

### Current Implementation

**No Next.js middleware exists at project root.** Authentication is handled:

1. **Client-side:** Each page checks auth status using `authClient.getSession()`
2. **Dashboard layout comment:** States "Authentication is handled by middleware.ts - this layout assumes user is authenticated" but no middleware.ts exists at root
3. **Proxy middleware:** `src/lib/proxy/middleware.ts` exists but is for API proxying, not auth

### Auth Flow
1. User visits `/` or `/login`
2. Page checks `authClient.getSession()`
3. If authenticated, redirect to `/dashboard`
4. If not authenticated, show sign-in UI
5. OAuth handled by Better Auth library

## Changes Needed to Make /login the Default Landing Page

### Option A: Swap Page Contents (Recommended)

**Minimal changes, preserves URLs:**

1. **Rename/move current pages:**
   - Move `src/app/page.tsx` to `src/app/landing-simple/page.tsx` (backup)
   - Move `src/app/login/page.tsx` to `src/app/page.tsx`

2. **Update links in `/privacy` and `/terms`:**
   - Change "Back to Izzie" link from `href="/"` to stay as `href="/"`
   - No change needed - they already link to root

3. **Update OAuth callback:**
   - Check if `callbackURL: '/dashboard'` needs changes (should be fine)

4. **Delete or repurpose old simple landing:**
   - The simple landing in current `/` becomes unnecessary

**Files to modify:**
- `src/app/page.tsx` (replace with login page content)
- `src/app/login/page.tsx` (delete or redirect to `/`)

### Option B: Next.js Redirect Configuration

**Add redirect in `next.config.js`:**

```javascript
module.exports = {
  async redirects() {
    return [
      {
        source: '/',
        destination: '/login',
        permanent: false, // Use 307 temporary redirect
      },
    ];
  },
};
```

**Pros:** Minimal code changes
**Cons:** Extra redirect hop, changes URL visible to users

### Option C: Middleware-Based Routing

**Create `src/middleware.ts`:**

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Root URL redirects to login
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/'],
};
```

**Pros:** Flexible for future auth middleware
**Cons:** More complex, adds middleware overhead

## Recommendation

**Option A (Swap Page Contents)** is recommended because:

1. **Cleanest URLs:** Users land on `/` directly with the beautiful login page
2. **No redirect overhead:** Faster page load
3. **Single source of truth:** Login logic lives in one place
4. **Natural flow:** `/` is login, authenticated users go to `/dashboard`

## Implementation Checklist

- [ ] Back up current `src/app/page.tsx`
- [ ] Copy login page content to `src/app/page.tsx`
- [ ] Update any internal links/imports
- [ ] Delete `src/app/login/page.tsx` or make it redirect to `/`
- [ ] Test unauthenticated flow: visit `/` -> see login
- [ ] Test authenticated flow: visit `/` -> redirect to dashboard
- [ ] Verify Terms/Privacy links still work
- [ ] Verify OAuth callback still works

## Files Analyzed

- `/Users/masa/Projects/izzie2/src/app/page.tsx`
- `/Users/masa/Projects/izzie2/src/app/login/page.tsx`
- `/Users/masa/Projects/izzie2/src/app/privacy/page.tsx`
- `/Users/masa/Projects/izzie2/src/app/terms/page.tsx`
- `/Users/masa/Projects/izzie2/src/app/dashboard/page.tsx`
- `/Users/masa/Projects/izzie2/src/app/dashboard/layout.tsx`
- `/Users/masa/Projects/izzie2/src/app/layout.tsx`
- `/Users/masa/Projects/izzie2/src/lib/auth-client.ts`

## Risk Assessment

**Low Risk:** This change is straightforward because:
- No database changes
- No auth flow changes
- No API changes
- Visual content swap only
- OAuth callbacks already point to `/dashboard`

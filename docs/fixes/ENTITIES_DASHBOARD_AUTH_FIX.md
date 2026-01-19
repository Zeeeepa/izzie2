# Entities Dashboard Authentication Fix

## Problem Summary

The `/dashboard/entities` page was showing an "Unauthorized - authentication required" error when trying to fetch entities.

**Error Message:**
```
Failed to fetch entities: {"error":"Failed to fetch entities","details":"Unauthorized - authentication required"}
```

## Root Cause Analysis

### API Route Behavior (Correct)
The `/api/entities` route correctly requires authentication:
```typescript
// src/app/api/entities/route.ts
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth(request);  // ✅ Throws if not authenticated
    const userId = session.user.id;
    // ... rest of handler
  }
}
```

This matches the pattern used in other protected routes like:
- `/api/protected/me`
- `/api/calendar/list`
- `/api/calendar/events`

### Dashboard Page Behavior (Bug)
The dashboard page was NOT checking authentication before attempting to fetch:
```typescript
// ❌ Old behavior:
export default function EntitiesPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch entities on mount - NO AUTH CHECK!
  useEffect(() => {
    fetchEntities(selectedType);  // This will fail if user not logged in
  }, [selectedType]);
}
```

### Comparison with Working Pages
The home page (`/page.tsx`) correctly checks authentication:
```typescript
// ✅ Correct pattern:
export default function Home() {
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    authClient.getSession().then((result) => {
      setSession(result.data);  // Check auth state
      setIsLoading(false);
    });
  }, []);

  // Only show content if authenticated
  {session?.user && (
    <div>Protected content...</div>
  )}
}
```

## Fix Applied

Updated `/src/app/dashboard/entities/page.tsx` to:

1. **Check authentication on mount**
   ```typescript
   const [session, setSession] = useState<any>(null);
   const [authChecking, setAuthChecking] = useState(true);

   useEffect(() => {
     authClient.getSession().then((result) => {
       if (!result.data?.user) {
         router.push('/login');  // Redirect if not authenticated
       } else {
         setSession(result.data);
         setAuthChecking(false);
       }
     });
   }, [router]);
   ```

2. **Only fetch entities after auth check passes**
   ```typescript
   useEffect(() => {
     if (!authChecking && session?.user) {
       fetchEntities(selectedType);  // Only fetch if authenticated
     }
   }, [selectedType, authChecking, session]);
   ```

3. **Show loading state during auth check**
   ```typescript
   if (authChecking) {
     return (
       <div>
         <Spinner />
         <p>Checking authentication...</p>
       </div>
     );
   }
   ```

4. **Better error handling**
   ```typescript
   const [error, setError] = useState<string | null>(null);

   const fetchEntities = async (type: string = '') => {
     setError(null);
     try {
       const response = await fetch(`/api/entities?${params}`);
       if (!response.ok) {
         const errorData = await response.json();
         setError(errorData.details || errorData.error);
       }
     } catch (error) {
       setError(error instanceof Error ? error.message : 'Failed to fetch');
     }
   };
   ```

5. **Display error state in UI**
   ```typescript
   {error && (
     <div style={{ backgroundColor: '#fee2e2', ... }}>
       <p>Error loading entities</p>
       <p>{error}</p>
     </div>
   )}
   ```

## Expected Behavior After Fix

### Scenario 1: User Not Logged In
1. User navigates to `/dashboard/entities`
2. Page shows "Checking authentication..." spinner
3. Auth check detects no session
4. User is redirected to `/login`
5. After login, user can navigate back to `/dashboard/entities`

### Scenario 2: User Logged In
1. User navigates to `/dashboard/entities`
2. Page shows "Checking authentication..." spinner (briefly)
3. Auth check passes
4. Page fetches entities from `/api/entities` (with session cookie)
5. Entities are displayed OR "No entities found" message

### Scenario 3: Auth Error During Fetch
1. User is logged in and on `/dashboard/entities`
2. Entities fetch fails (network error, session expired, etc.)
3. Error message is displayed in red banner
4. User can retry or navigate to login

## Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│ User navigates to /dashboard/entities                       │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ useEffect: authClient.getSession()                          │
└──────────────────┬──────────────────────────────────────────┘
                   │
          ┌────────┴────────┐
          │                 │
          ▼                 ▼
    ┌─────────┐      ┌──────────┐
    │ No User │      │ Has User │
    └────┬────┘      └─────┬────┘
         │                 │
         ▼                 ▼
┌──────────────┐   ┌──────────────────────┐
│ router.push  │   │ fetchEntities()      │
│ ('/login')   │   │ (with session)       │
└──────────────┘   └──────────────────────┘
```

## Testing Checklist

- [x] Verified `/api/entities` returns 401 without auth
- [x] Verified `/api/protected/me` also returns 401 (confirms no session)
- [x] Added auth check to dashboard page
- [x] Added redirect to login if not authenticated
- [x] Added loading state during auth check
- [x] Added error state display
- [x] Fixed data fetching to only occur after auth passes

## Files Modified

1. `/src/app/dashboard/entities/page.tsx`
   - Added `authClient` import
   - Added `useRouter` import
   - Added `session` state
   - Added `authChecking` state
   - Added `error` state
   - Added auth check useEffect
   - Modified fetch useEffect to depend on auth
   - Added loading screen during auth check
   - Added error display in UI

## Next Steps

To fully test the fix:

1. **Test unauthenticated flow:**
   ```bash
   # Clear cookies in browser
   # Navigate to http://localhost:3300/dashboard/entities
   # Should redirect to /login
   ```

2. **Test authenticated flow:**
   ```bash
   # Login via http://localhost:3300/login
   # Navigate to http://localhost:3300/dashboard/entities
   # Should show entities or "No entities found"
   ```

3. **Test with entities:**
   - Sync some emails first via `/admin/ingestion`
   - Then check `/dashboard/entities` shows extracted entities

## Related Patterns

This fix follows the same pattern as:
- `/src/app/page.tsx` - Home page auth check
- `/src/app/login/page.tsx` - Login page with redirect
- `/src/app/api/protected/me/route.ts` - Protected API route

All protected routes should:
1. Use `requireAuth(request)` on server side
2. Use `authClient.getSession()` on client side
3. Redirect to `/login` if not authenticated
4. Show appropriate loading/error states

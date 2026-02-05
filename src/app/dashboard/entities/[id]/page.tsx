/**
 * Entity Profile Page
 * Displays detailed view of a specific entity with relationships and timeline
 *
 * This is a dynamic route that cannot be statically generated because:
 * 1. Entity IDs are user-specific and created dynamically
 * 2. The page requires authentication to fetch data
 */

import { Suspense } from 'react';
import { EntityProfileClient } from './EntityProfileClient';

// Tell Next.js this route should be partially prerendered
// We provide a placeholder param that gets the static shell generated
// All actual entity IDs will be dynamically rendered
export function generateStaticParams() {
  // Return a placeholder to satisfy cacheComponents requirement
  // This creates a static shell that gets hydrated with real data
  return [{ id: '_placeholder' }];
}

// Loading component for Suspense fallback
function EntityProfileLoading() {
  return (
    <div className="py-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <span>Entities</span>
        <span>/</span>
        <span className="h-4 w-20 bg-muted animate-pulse rounded" />
      </div>
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-muted-foreground">Loading entity profile...</p>
      </div>
    </div>
  );
}

// Server component wrapper
export default async function EntityProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;

  return (
    <Suspense fallback={<EntityProfileLoading />}>
      <EntityProfileClient entityId={resolvedParams.id} />
    </Suspense>
  );
}

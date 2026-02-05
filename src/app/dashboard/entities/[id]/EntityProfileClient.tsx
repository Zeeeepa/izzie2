/**
 * Entity Profile Client Component
 * Client-side component for entity profile with interactive features
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EntityProfile } from '@/components/dashboard/EntityProfile';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface EntityDetailResponse {
  entity: {
    id: string;
    type: string;
    value: string;
    normalized: string;
    confidence: number;
    source: string;
    context?: string;
    firstSeen: string | null;
    lastSeen: string | null;
  };
  relationshipScore: {
    strength: number;
    interactionCount: number;
    factors: {
      emailFrequency: number;
      calendarFrequency: number;
      recency: number;
      sentiment: number;
    };
  } | null;
  timeline: Array<{
    date: string;
    source: string;
    sourceId: string;
    action: string;
    context: string;
    relatedEntity?: {
      type: string;
      value: string;
    };
  }>;
  relatedEntities: Array<{
    entityType: string;
    entityValue: string;
    coOccurrenceCount: number;
    relationshipTypes: string[];
  }>;
}

interface AliasesResponse {
  aliases: string[];
}

interface EntityProfileClientProps {
  entityId: string;
}

export function EntityProfileClient({ entityId }: EntityProfileClientProps) {
  const router = useRouter();
  const [entityData, setEntityData] = useState<EntityDetailResponse | null>(null);
  const [aliases, setAliases] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [isMerging, setIsMerging] = useState(false);

  const decodedEntityId = decodeURIComponent(entityId);

  const fetchEntityData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/entities/${encodeURIComponent(decodedEntityId)}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data: EntityDetailResponse = await response.json();
        setEntityData(data);

        // Also fetch aliases if available
        try {
          // Parse entity type and value from ID
          const colonIndex = decodedEntityId.indexOf(':');
          if (colonIndex !== -1) {
            const entityType = decodedEntityId.substring(0, colonIndex);
            const entityValue = decodedEntityId.substring(colonIndex + 1);

            // Try to fetch aliases from entity aliases table
            const aliasParams = new URLSearchParams({
              entityType,
              entityValue,
            });
            const aliasResponse = await fetch(`/api/entities/aliases?${aliasParams}`, {
              credentials: 'include',
            });
            if (aliasResponse.ok) {
              const aliasData: AliasesResponse = await aliasResponse.json();
              setAliases(aliasData.aliases || []);
            }
          }
        } catch (aliasError) {
          // Silently ignore alias fetch errors - they're optional
          console.warn('Failed to fetch aliases:', aliasError);
        }
      } else if (response.status === 404) {
        setError('Entity not found');
      } else {
        const err = await response.json();
        setError(err.details || err.error || 'Failed to fetch entity');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch entity');
    } finally {
      setIsLoading(false);
    }
  }, [decodedEntityId]);

  useEffect(() => {
    fetchEntityData();
  }, [fetchEntityData]);

  const handleMerge = async () => {
    if (!mergeTargetId.trim()) {
      alert('Please enter a target entity ID');
      return;
    }

    setIsMerging(true);
    try {
      const response = await fetch('/api/entities/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sourceEntityId: decodedEntityId,
          targetEntityId: mergeTargetId.trim(),
        }),
      });

      if (response.ok) {
        setShowMergeDialog(false);
        // Redirect to the target entity's page after merge
        router.push(`/dashboard/entities/${encodeURIComponent(mergeTargetId.trim())}`);
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to merge entities');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to merge entities');
    } finally {
      setIsMerging(false);
    }
  };

  // Parse entity type for breadcrumb
  const colonIndex = decodedEntityId.indexOf(':');
  const entityType = colonIndex !== -1 ? decodedEntityId.substring(0, colonIndex) : 'entity';
  const entityValue = colonIndex !== -1 ? decodedEntityId.substring(colonIndex + 1) : decodedEntityId;

  return (
    <div className="py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Link href="/dashboard/entities" className="hover:text-foreground">
          Entities
        </Link>
        <span>/</span>
        <span className="capitalize">{entityType.replace('_', ' ')}</span>
        <span>/</span>
        <span className="text-foreground truncate max-w-[200px]">{entityValue}</span>
      </div>

      {/* Back Button */}
      <div className="mb-6">
        <Link href="/dashboard/entities">
          <Button variant="ghost" size="sm">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="mr-2"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to Entities
          </Button>
        </Link>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="py-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center mb-4">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-destructive"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-destructive mb-1">Error</h2>
              <p className="text-destructive/80 mb-4">{error}</p>
              <Link href="/dashboard/entities">
                <Button variant="outline">Back to Entities</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-muted-foreground">Loading entity profile...</p>
        </div>
      )}

      {/* Entity Profile */}
      {!isLoading && !error && entityData && (
        <EntityProfile
          entity={entityData.entity}
          relationshipScore={entityData.relationshipScore}
          timeline={entityData.timeline}
          relatedEntities={entityData.relatedEntities}
          aliases={aliases}
          onMerge={() => setShowMergeDialog(true)}
        />
      )}

      {/* Merge Dialog */}
      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Entity</DialogTitle>
            <DialogDescription>
              Merge this entity with another entity. This will create a SAME_AS relationship and
              consolidate the entities.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="targetEntity">Target Entity ID</Label>
            <Input
              id="targetEntity"
              placeholder="e.g., person:john_doe"
              value={mergeTargetId}
              onChange={(e) => setMergeTargetId(e.target.value)}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Enter the ID of the entity you want to merge with. Format: type:value (e.g.,
              person:john_doe, company:acme)
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMergeDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleMerge} disabled={isMerging}>
              {isMerging ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Merging...
                </>
              ) : (
                'Merge Entities'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

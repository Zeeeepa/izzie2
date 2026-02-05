/**
 * Entity Profile Component
 * Displays detailed view of an entity with aliases and relationships
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface EntityProfileProps {
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
  aliases?: string[];
  onMerge?: () => void;
  onEdit?: () => void;
}

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  person: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-300' },
  company: { bg: 'bg-green-50', text: 'text-green-800', border: 'border-green-300' },
  project: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-300' },
  action_item: { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-300' },
  topic: { bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-300' },
  location: { bg: 'bg-pink-50', text: 'text-pink-800', border: 'border-pink-300' },
};

export function EntityProfile({
  entity,
  relationshipScore,
  timeline,
  relatedEntities,
  aliases = [],
  onMerge,
  onEdit,
}: EntityProfileProps) {
  const [showAllTimeline, setShowAllTimeline] = useState(false);
  const [showAllRelated, setShowAllRelated] = useState(false);

  const colors = TYPE_COLORS[entity.type] || {
    bg: 'bg-gray-50',
    text: 'text-gray-800',
    border: 'border-gray-300',
  };

  const confidencePercent = Math.round(entity.confidence * 100);
  const confidenceColor =
    confidencePercent >= 80
      ? 'text-green-600'
      : confidencePercent >= 60
        ? 'text-amber-600'
        : 'text-red-600';

  const displayedTimeline = showAllTimeline ? timeline : timeline.slice(0, 5);
  const displayedRelated = showAllRelated ? relatedEntities : relatedEntities.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Entity Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`${colors.text} ${colors.border} uppercase text-xs`}
                >
                  {entity.type.replace('_', ' ')}
                </Badge>
                <span className={`text-sm font-medium ${confidenceColor}`}>
                  {confidencePercent}% confidence
                </span>
              </div>
              <CardTitle className="text-2xl">{entity.value}</CardTitle>
              {entity.normalized !== entity.value && (
                <CardDescription>
                  Normalized: <span className="font-medium">{entity.normalized}</span>
                </CardDescription>
              )}
            </div>
            <div className="flex gap-2">
              {onEdit && (
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="mr-1"
                  >
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit
                </Button>
              )}
              {onMerge && (
                <Button variant="outline" size="sm" onClick={onMerge}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="mr-1"
                  >
                    <path d="M8 6l4-4 4 4M8 18l4 4 4-4M12 2v20" />
                  </svg>
                  Merge
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Source</p>
              <p className="font-medium capitalize">{entity.source}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">First Seen</p>
              <p className="font-medium">
                {entity.firstSeen
                  ? new Date(entity.firstSeen).toLocaleDateString()
                  : 'Unknown'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last Seen</p>
              <p className="font-medium">
                {entity.lastSeen
                  ? new Date(entity.lastSeen).toLocaleDateString()
                  : 'Unknown'}
              </p>
            </div>
            {relationshipScore && (
              <div>
                <p className="text-xs text-muted-foreground">Interactions</p>
                <p className="font-medium">{relationshipScore.interactionCount}</p>
              </div>
            )}
          </div>
          {entity.context && (
            <div className="mt-4 p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Context</p>
              <p className="text-sm italic">"{entity.context}"</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Relationship Score Card */}
      {relationshipScore && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Relationship Strength</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Overall Score</span>
                <span className="text-2xl font-bold">
                  {Math.round(relationshipScore.strength * 100)}%
                </span>
              </div>
              <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${relationshipScore.strength * 100}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
              <div>
                <p className="text-xs text-muted-foreground">Email Frequency</p>
                <p className="font-medium">
                  {Math.round(relationshipScore.factors.emailFrequency * 100)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Calendar Frequency</p>
                <p className="font-medium">
                  {Math.round(relationshipScore.factors.calendarFrequency * 100)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Recency</p>
                <p className="font-medium">
                  {Math.round(relationshipScore.factors.recency * 100)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sentiment</p>
                <p className="font-medium">
                  {Math.round(relationshipScore.factors.sentiment * 100)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Aliases Card */}
      {aliases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Also Known As</CardTitle>
            <CardDescription>
              Other names or aliases for this entity (SAME_AS relationships)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {aliases.map((alias, index) => (
                <Badge key={index} variant="secondary" className="text-sm">
                  {alias}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Related Entities Card */}
      {relatedEntities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Related Entities</CardTitle>
            <CardDescription>
              Entities that frequently appear together with this one
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {displayedRelated.map((related, index) => {
                const relatedColors = TYPE_COLORS[related.entityType] || {
                  bg: 'bg-gray-50',
                  text: 'text-gray-800',
                  border: 'border-gray-300',
                };
                const relatedId = `${related.entityType}:${related.entityValue}`;

                return (
                  <Link
                    key={index}
                    href={`/dashboard/entities/${encodeURIComponent(relatedId)}`}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className={`${relatedColors.text} ${relatedColors.border} text-xs`}
                      >
                        {related.entityType}
                      </Badge>
                      <span className="font-medium">{related.entityValue}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{related.coOccurrenceCount} co-occurrences</span>
                      {related.relationshipTypes.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {related.relationshipTypes[0]}
                          {related.relationshipTypes.length > 1 &&
                            ` +${related.relationshipTypes.length - 1}`}
                        </Badge>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
            {relatedEntities.length > 5 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-4"
                onClick={() => setShowAllRelated(!showAllRelated)}
              >
                {showAllRelated
                  ? 'Show Less'
                  : `Show ${relatedEntities.length - 5} More`}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Timeline Card */}
      {timeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Activity Timeline</CardTitle>
            <CardDescription>Recent interactions involving this entity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
              <div className="space-y-4">
                {displayedTimeline.map((entry, index) => (
                  <div key={index} className="relative pl-10">
                    <div className="absolute left-2.5 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                    <div className="p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium capitalize">
                          {entry.action}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.date).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{entry.context}</p>
                      {entry.relatedEntity && (
                        <div className="mt-2">
                          <Badge variant="outline" className="text-xs">
                            {entry.relatedEntity.type}: {entry.relatedEntity.value}
                          </Badge>
                        </div>
                      )}
                      <div className="mt-2 text-xs text-muted-foreground">
                        Source: {entry.source}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {timeline.length > 5 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-4"
                onClick={() => setShowAllTimeline(!showAllTimeline)}
              >
                {showAllTimeline ? 'Show Less' : `Show ${timeline.length - 5} More`}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

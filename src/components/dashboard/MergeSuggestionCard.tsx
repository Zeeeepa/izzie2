/**
 * Merge Suggestion Card Component
 * Displays side-by-side comparison of two entities with accept/reject actions
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface MergeSuggestionCardProps {
  suggestion: {
    id: string;
    entity1Type: string;
    entity1Value: string;
    entity2Type: string;
    entity2Value: string;
    confidence: number;
    matchReason: string;
    status: string;
    createdAt: string;
  };
  onAccept: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  person: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-300' },
  company: { bg: 'bg-green-50', text: 'text-green-800', border: 'border-green-300' },
  project: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-300' },
  action_item: { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-300' },
  topic: { bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-300' },
  location: { bg: 'bg-pink-50', text: 'text-pink-800', border: 'border-pink-300' },
};

const MATCH_REASON_LABELS: Record<string, { label: string; color: string }> = {
  exact: { label: 'Exact Match', color: 'bg-green-100 text-green-800' },
  alias: { label: 'Alias Match', color: 'bg-blue-100 text-blue-800' },
  fuzzy: { label: 'Fuzzy Match', color: 'bg-amber-100 text-amber-800' },
  email_domain: { label: 'Same Email Domain', color: 'bg-purple-100 text-purple-800' },
  normalized: { label: 'Normalized Match', color: 'bg-cyan-100 text-cyan-800' },
};

export function MergeSuggestionCard({
  suggestion,
  onAccept,
  onReject,
}: MergeSuggestionCardProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionType, setActionType] = useState<'accept' | 'reject' | null>(null);

  const handleAccept = async () => {
    setIsProcessing(true);
    setActionType('accept');
    try {
      await onAccept(suggestion.id);
    } finally {
      setIsProcessing(false);
      setActionType(null);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    setActionType('reject');
    try {
      await onReject(suggestion.id);
    } finally {
      setIsProcessing(false);
      setActionType(null);
    }
  };

  const confidencePercent = Math.round(suggestion.confidence * 100);
  const confidenceColor =
    confidencePercent >= 80
      ? 'text-green-600'
      : confidencePercent >= 60
        ? 'text-amber-600'
        : 'text-red-600';

  const entity1Colors = TYPE_COLORS[suggestion.entity1Type] || {
    bg: 'bg-gray-50',
    text: 'text-gray-800',
    border: 'border-gray-300',
  };
  const entity2Colors = TYPE_COLORS[suggestion.entity2Type] || {
    bg: 'bg-gray-50',
    text: 'text-gray-800',
    border: 'border-gray-300',
  };

  const matchReasonInfo = MATCH_REASON_LABELS[suggestion.matchReason] || {
    label: suggestion.matchReason,
    color: 'bg-gray-100 text-gray-800',
  };

  // Generate entity IDs for linking
  const entity1Id = `${suggestion.entity1Type}:${suggestion.entity1Value}`;
  const entity2Id = `${suggestion.entity2Type}:${suggestion.entity2Value}`;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className={matchReasonInfo.color}>{matchReasonInfo.label}</Badge>
            <span className={`text-sm font-semibold ${confidenceColor}`}>
              {confidencePercent}% confidence
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(suggestion.createdAt).toLocaleDateString()}
          </span>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-center">
          {/* Entity 1 */}
          <Link
            href={`/dashboard/entities/${encodeURIComponent(entity1Id)}`}
            className={`p-4 rounded-lg border-2 ${entity1Colors.bg} ${entity1Colors.border} hover:shadow-md transition-shadow`}
          >
            <Badge
              variant="outline"
              className={`mb-2 ${entity1Colors.text} ${entity1Colors.border}`}
            >
              {suggestion.entity1Type.replace('_', ' ')}
            </Badge>
            <p className="font-semibold text-foreground truncate" title={suggestion.entity1Value}>
              {suggestion.entity1Value}
            </p>
          </Link>

          {/* Arrow */}
          <div className="flex flex-col items-center gap-1">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              className="text-muted-foreground"
            >
              <path
                d="M8 12h8m0 0l-4-4m4 4l-4 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-xs text-muted-foreground">merge</span>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              className="text-muted-foreground rotate-180"
            >
              <path
                d="M8 12h8m0 0l-4-4m4 4l-4 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* Entity 2 */}
          <Link
            href={`/dashboard/entities/${encodeURIComponent(entity2Id)}`}
            className={`p-4 rounded-lg border-2 ${entity2Colors.bg} ${entity2Colors.border} hover:shadow-md transition-shadow`}
          >
            <Badge
              variant="outline"
              className={`mb-2 ${entity2Colors.text} ${entity2Colors.border}`}
            >
              {suggestion.entity2Type.replace('_', ' ')}
            </Badge>
            <p className="font-semibold text-foreground truncate" title={suggestion.entity2Value}>
              {suggestion.entity2Value}
            </p>
          </Link>
        </div>
      </CardContent>

      <CardFooter className="flex justify-end gap-2 border-t pt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handleReject}
          disabled={isProcessing}
          className="text-red-600 border-red-300 hover:bg-red-50"
        >
          {isProcessing && actionType === 'reject' ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin mr-2" />
              Rejecting...
            </>
          ) : (
            <>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="mr-1"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Reject
            </>
          )}
        </Button>
        <Button
          size="sm"
          onClick={handleAccept}
          disabled={isProcessing}
          className="bg-green-600 hover:bg-green-700"
        >
          {isProcessing && actionType === 'accept' ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              Accepting...
            </>
          ) : (
            <>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="mr-1"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Accept Merge
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

/**
 * FeedbackDialog Component
 * A modal dialog for providing feedback on discovered items with full context
 */

'use client';

import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { ThumbsUp, ThumbsDown, X, Mail, Calendar, Clock, Lightbulb } from 'lucide-react';

export interface DiscoveredItemForDialog {
  id: string;
  type: 'entity' | 'relationship';
  content: {
    text: string;
    context?: string;
  };
  source?: {
    id?: string;
    type?: string;
  };
  prediction: {
    label: string;
    confidence: number;
    reasoning?: string;
  };
  createdAt: string;
  occurrenceCount?: number;
}

export interface PendingFeedbackItem {
  isCorrect: boolean;
  note: string;
}

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: DiscoveredItemForDialog | null;
  pendingFeedback?: PendingFeedbackItem | null;
  onSaveFeedback: (itemId: string, isCorrect: boolean, note: string) => void;
}

export function FeedbackDialog({
  open,
  onOpenChange,
  item,
  pendingFeedback,
  onSaveFeedback,
}: FeedbackDialogProps) {
  const [selectedFeedback, setSelectedFeedback] = React.useState<boolean | null>(null);
  const [noteText, setNoteText] = React.useState('');

  // Reset state when item changes
  React.useEffect(() => {
    if (item && open) {
      setSelectedFeedback(pendingFeedback?.isCorrect ?? null);
      setNoteText(pendingFeedback?.note ?? '');
    }
  }, [item, open, pendingFeedback]);

  const handleMarkCorrect = () => {
    if (!item) return;
    onSaveFeedback(item.id, true, noteText);
    onOpenChange(false);
  };

  const handleMarkIncorrect = () => {
    if (!item) return;
    onSaveFeedback(item.id, false, noteText);
    onOpenChange(false);
  };

  if (!item) return null;

  const SourceIcon = item.source?.type === 'email' ? Mail : item.source?.type === 'calendar' ? Calendar : null;
  const sourceLabel = item.source?.type === 'email' ? 'Email' : item.source?.type === 'calendar' ? 'Calendar event' : 'Unknown source';

  // Format the creation date
  const createdDate = new Date(item.createdAt);
  const formattedDate = createdDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const formattedTime = createdDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2',
            'bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
            'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
            'duration-200 overflow-hidden'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Review Discovery
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
            {/* Entity/Relationship Name */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={cn(
                    'text-xs font-medium px-2 py-0.5 rounded',
                    item.type === 'entity'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                      : 'bg-pink-100 text-pink-800 dark:bg-pink-900/50 dark:text-pink-300'
                  )}
                >
                  {item.type === 'entity' ? 'Entity' : 'Relationship'}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {item.prediction.label}
                </span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {item.content.text}
              </h3>
              {item.occurrenceCount && item.occurrenceCount > 1 && (
                <p className="text-sm text-gray-500 mt-1">
                  Found {item.occurrenceCount} times in your data
                </p>
              )}
            </div>

            {/* Discovery Context Section */}
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 mb-4">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <Lightbulb className="w-4 h-4" />
                Discovery Context
              </h4>

              <div className="space-y-3">
                {/* Source */}
                <div className="flex items-start gap-3">
                  {SourceIcon && (
                    <SourceIcon className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Source: {sourceLabel}
                    </p>
                    {item.source?.id && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[300px]">
                        ID: {item.source.id}
                      </p>
                    )}
                  </div>
                </div>

                {/* Date discovered */}
                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Discovered: {formattedDate} at {formattedTime}
                    </p>
                  </div>
                </div>

                {/* Extraction reasoning */}
                {item.prediction.reasoning && (
                  <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Why it was extracted:
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {item.prediction.reasoning}
                    </p>
                  </div>
                )}

                {/* Original context */}
                {item.content.context && (
                  <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Original context:
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                      {item.content.context}
                    </p>
                  </div>
                )}

                {/* Confidence */}
                <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      AI Confidence
                    </p>
                    <span
                      className={cn(
                        'text-sm font-semibold',
                        item.prediction.confidence >= 80
                          ? 'text-green-600'
                          : item.prediction.confidence >= 60
                          ? 'text-yellow-600'
                          : 'text-red-600'
                      )}
                    >
                      {item.prediction.confidence}%
                    </span>
                  </div>
                  <div className="mt-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        item.prediction.confidence >= 80
                          ? 'bg-green-500'
                          : item.prediction.confidence >= 60
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                      )}
                      style={{ width: `${item.prediction.confidence}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Note textarea */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Add a note (optional)
              </label>
              <textarea
                placeholder="Add corrections, clarifications, or additional context..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={3}
                className={cn(
                  'w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700',
                  'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100',
                  'placeholder:text-gray-400 dark:placeholder:text-gray-500',
                  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                  'resize-none text-sm'
                )}
              />
            </div>
          </div>

          {/* Footer with action buttons */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex gap-3">
              <button
                onClick={handleMarkCorrect}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg',
                  'font-semibold text-sm transition-all',
                  'bg-green-500 hover:bg-green-600 text-white',
                  'focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2'
                )}
              >
                <ThumbsUp className="w-4 h-4" />
                Mark Correct
              </button>
              <button
                onClick={handleMarkIncorrect}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg',
                  'font-semibold text-sm transition-all',
                  'bg-red-500 hover:bg-red-600 text-white',
                  'focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2'
                )}
              >
                <ThumbsDown className="w-4 h-4" />
                Mark Incorrect
              </button>
            </div>
            <p className="text-xs text-gray-500 text-center mt-3">
              Feedback will be saved locally. Click &quot;Submit All Feedback&quot; to send to server.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Discover Page
 * Entity and relationship discovery with autonomous processing and feedback review
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/components/ui/toast';
import { useConfirmModal } from '@/components/ui/confirm-modal';
import { FeedbackDialog } from '@/components/feedback/FeedbackDialog';
import { ThumbsUp, ThumbsDown, MessageSquare, X, Play, Pause, Square, RefreshCw, DollarSign, AlertCircle, Mail, Calendar, Loader2, Send, CheckCircle2 } from 'lucide-react';

// ============================================================
// Types
// ============================================================

type DiscoverTab = 'discovery' | 'review';
type FilterType = 'all' | 'entity' | 'relationship';
type FilterStatus = 'all' | 'pending' | 'reviewed';

// Discovery status
type DiscoveryStatus = 'idle' | 'running' | 'paused' | 'complete' | 'budget_exhausted';

interface DiscoverySession {
  id: string;
  status: DiscoveryStatus;
  mode?: string;
  createdAt?: string;
}

interface BudgetInfo {
  total: number;
  used: number;
  remaining: number;
}

interface DiscoveryBudget {
  total: number;
  used: number;
  remaining: number;
}

interface TrainingBudget {
  total: number;
  used: number;
  remaining: number;
}

interface DiscoveryProgress {
  daysProcessed: number;
  itemsDiscovered: number;
  currentActivity?: string;
}

// Processing status details for the current day
interface ProcessingDetails {
  currentDay: string; // Date string like "2026-01-15"
  phase: 'fetching' | 'extracting' | 'complete';
  emailCount?: number;
  calendarCount?: number;
  entitiesFound?: number;
  relationshipsFound?: number;
  lastItemsFound?: number;
}

// Helper to format date nicely (e.g., "January 15, 2026")
function formatDateNicely(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

interface FeedbackStats {
  total: number;
  reviewed: number;
  pending: number;
}

// Discovered item for review
interface DiscoveredItem {
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
  status: 'pending' | 'reviewed' | 'skipped';
  feedback?: {
    isCorrect: boolean;
    correctedLabel?: string;
    notes?: string;
  };
  createdAt: string;
  occurrenceCount?: number; // How many times this entity was found
}

// ============================================================
// Constants
// ============================================================

const MIN_FEEDBACK_FOR_AUTO_TRAIN = 50;

const BUDGET_OPTIONS = [
  { value: 5, label: '$5' },
  { value: 10, label: '$10' },
  { value: 25, label: '$25' },
  { value: 50, label: '$50' },
];

const POLL_INTERVAL = 2000; // 2 seconds between polls

// ============================================================
// Component
// ============================================================

export default function DiscoverPage() {
  const toast = useToast();
  const { showConfirmation } = useConfirmModal();

  // Tab state
  const [activeTab, setActiveTab] = useState<DiscoverTab>('discovery');

  // ============================================================
  // Discovery State
  // ============================================================
  const [session, setSession] = useState<DiscoverySession | null>(null);
  const [budget, setBudget] = useState<DiscoveryBudget | null>(null);
  const [discoveryBudget, setDiscoveryBudget] = useState<BudgetInfo | null>(null);
  const [trainingBudget, setTrainingBudget] = useState<TrainingBudget | null>(null);
  const [progress, setProgress] = useState<DiscoveryProgress | null>(null);
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingDetails, setProcessingDetails] = useState<ProcessingDetails | null>(null);
  const [error, setError] = useState('');

  // Setup form - separate budgets
  const [setupDiscoveryBudget, setSetupDiscoveryBudget] = useState(10);
  const [setupTrainingBudget, setSetupTrainingBudget] = useState(5);

  // Polling ref for client-driven processing
  const processingRef = useRef(false);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Refs to prevent duplicate toasts
  const budgetExhaustedToastShown = useRef(false);
  const lastProcessTime = useRef(0);
  const MIN_PROCESS_INTERVAL = 2000; // 2 seconds minimum between API calls

  // ============================================================
  // Review State
  // ============================================================
  const [items, setItems] = useState<DiscoveredItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('pending');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Feedback dialog state (new context-aware dialog)
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackDialogItem, setFeedbackDialogItem] = useState<DiscoveredItem | null>(null);

  // Local pending feedback state (batch mode - not submitted until user clicks submit)
  const [pendingFeedback, setPendingFeedback] = useState<Map<string, {
    isCorrect: boolean;
    note: string;
  }>>(new Map());

  // Track which items are currently being submitted (for batch submission)
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);

  // ============================================================
  // Discovery API Handlers
  // ============================================================

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/discover/status');
      const data = await res.json();

      if (data.success) {
        if (data.hasActiveSession) {
          setSession(data.session);
          setBudget(data.budget);
          setDiscoveryBudget(data.discoveryBudget || data.budget);
          setTrainingBudget(data.trainingBudget || { total: 500, used: 0, remaining: 500 });
          setProgress(data.progress);
          setFeedbackStats(data.feedbackStats);
        } else {
          setSession(null);
          setBudget(null);
          setDiscoveryBudget(null);
          setTrainingBudget(null);
          setProgress(null);
          setFeedbackStats(null);
        }
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const startDiscovery = async () => {
    setError('');
    setIsLoading(true);
    // Reset toast flags for new session
    budgetExhaustedToastShown.current = false;

    try {
      const res = await fetch('/api/discover/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          budget: setupDiscoveryBudget,
          trainingBudget: setupTrainingBudget,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSession(data.session);
        setBudget(data.budget);
        setDiscoveryBudget(data.discoveryBudget || data.budget);
        setTrainingBudget(data.trainingBudget || { total: setupTrainingBudget * 100, used: 0, remaining: setupTrainingBudget * 100 });
        setProgress(data.progress);
        toast.success('Discovery started!');
        // Start client-driven processing
        startProcessing();
      } else {
        setError(data.error || 'Failed to start discovery');
      }
    } catch (err) {
      setError('Failed to start discovery');
    } finally {
      setIsLoading(false);
    }
  };

  const pauseDiscovery = async () => {
    try {
      const res = await fetch('/api/discover/pause', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        stopProcessing();
        await fetchStatus();
        toast.success('Discovery paused');
      }
    } catch (err) {
      console.error('Failed to pause:', err);
    }
  };

  const resumeDiscovery = async () => {
    // Reset toast flag when resuming
    budgetExhaustedToastShown.current = false;

    try {
      const res = await fetch('/api/discover/resume', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        await fetchStatus();
        toast.success('Discovery resumed');
        startProcessing();
      }
    } catch (err) {
      console.error('Failed to resume:', err);
    }
  };

  const cancelDiscovery = async () => {
    const confirmed = await showConfirmation({
      title: 'Cancel Discovery?',
      message: 'This will stop the discovery session. You can start a new one later.',
      confirmText: 'Cancel Discovery',
      cancelText: 'Keep Going',
      variant: 'destructive',
    });

    if (!confirmed) return;

    stopProcessing();
    try {
      const res = await fetch('/api/discover/cancel', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        setSession(null);
        setBudget(null);
        setProgress(null);
        toast.success('Discovery cancelled');
      } else {
        toast.error(data.error || 'Failed to cancel discovery');
      }
    } catch (err) {
      console.error('Failed to cancel:', err);
      toast.error('Failed to cancel discovery');
    }
  };

  // Stop processing - defined first to avoid circular dependencies
  const stopProcessing = useCallback(() => {
    processingRef.current = false;
    setIsProcessing(false);
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  // Client-driven processing
  const processNextDay = useCallback(async () => {
    // Guard: Stop if not actively processing
    if (!processingRef.current) {
      return;
    }

    // Guard: Enforce minimum interval between API calls
    const now = Date.now();
    if (now - lastProcessTime.current < MIN_PROCESS_INTERVAL) {
      // Too soon, schedule for later
      pollTimeoutRef.current = setTimeout(processNextDay, MIN_PROCESS_INTERVAL);
      return;
    }
    lastProcessTime.current = now;

    // Guard: Stop if budget is already exhausted (check local state before API call)
    if (discoveryBudget && discoveryBudget.remaining <= 0) {
      if (!budgetExhaustedToastShown.current) {
        toast.success('Discovery budget exhausted. Discovery session complete.');
        budgetExhaustedToastShown.current = true;
      }
      stopProcessing();
      return;
    }

    // Set initial processing details with the current day being processed
    const today = new Date();
    const estimatedDaysAgo = progress?.daysProcessed || 0;
    const estimatedDate = new Date(today);
    estimatedDate.setDate(estimatedDate.getDate() - estimatedDaysAgo);
    const estimatedDateStr = estimatedDate.toISOString().split('T')[0];

    setProcessingDetails({
      currentDay: estimatedDateStr,
      phase: 'fetching',
    });

    try {
      const res = await fetch('/api/discover/process-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await res.json();

      if (data.success) {
        setBudget(data.budget);
        setDiscoveryBudget(data.discoveryBudget || data.budget);
        if (data.trainingBudget) {
          setTrainingBudget(data.trainingBudget);
        }
        setProgress(data.progress);

        // Update processing details with results
        if (data.processedDay) {
          setProcessingDetails({
            currentDay: data.processedDay,
            phase: 'complete',
            lastItemsFound: data.results?.itemsFound || 0,
          });
        }

        // Refresh items after each day is processed (for real-time updates)
        if (data.results?.itemsFound > 0) {
          // Fetch new items and prepend to list (most recent first)
          try {
            const params = new URLSearchParams({
              page: '1',
              limit: '50',
            });
            if (filterType !== 'all') params.set('type', filterType);
            if (filterStatus !== 'all') params.set('status', filterStatus);

            const itemsRes = await fetch(`/api/discover/items?${params}`);
            const itemsData = await itemsRes.json();

            if (itemsData.success) {
              setItems(itemsData.items);
              setTotalPages(itemsData.pagination.totalPages);
            }
          } catch (err) {
            console.error('Failed to refresh items:', err);
          }
        }

        if (data.complete) {
          // Processing complete - show toast only once
          stopProcessing();
          setProcessingDetails(null);
          if (!budgetExhaustedToastShown.current) {
            toast.success(data.message || 'Discovery complete.');
            if (data.reason === 'budget_exhausted') {
              budgetExhaustedToastShown.current = true;
            }
          }
          await fetchStatus();
        } else if (processingRef.current) {
          // Continue processing after a short delay
          // Update phase to show we're moving to next day
          if (data.processedDay) {
            const nextDate = new Date(data.processedDay + 'T00:00:00');
            nextDate.setDate(nextDate.getDate() - 1);
            setProcessingDetails({
              currentDay: nextDate.toISOString().split('T')[0],
              phase: 'fetching',
            });
          }
          pollTimeoutRef.current = setTimeout(processNextDay, POLL_INTERVAL);
        }
      } else {
        console.error('Process day failed:', data.error);
        stopProcessing();
        setProcessingDetails(null);
      }
    } catch (err) {
      console.error('Process day error:', err);
      stopProcessing();
      setProcessingDetails(null);
    }
  }, [fetchStatus, toast, discoveryBudget, stopProcessing, progress, filterType, filterStatus]);

  const startProcessing = useCallback(() => {
    // Guard: Don't start if already processing
    if (processingRef.current) {
      return;
    }

    // Guard: Don't start if budget is exhausted
    if (discoveryBudget && discoveryBudget.remaining <= 0) {
      return;
    }

    processingRef.current = true;
    setIsProcessing(true);
    // Reset toast flag when starting new processing
    budgetExhaustedToastShown.current = false;
    processNextDay();
  }, [processNextDay, discoveryBudget]);

  // ============================================================
  // Review API Handlers
  // ============================================================

  const fetchItems = useCallback(async () => {
    if (!session) return;

    setItemsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
      });
      if (filterType !== 'all') params.set('type', filterType);
      if (filterStatus !== 'all') params.set('status', filterStatus);

      const res = await fetch(`/api/discover/items?${params}`);
      const data = await res.json();

      if (data.success) {
        setItems(data.items);
        setTotalPages(data.pagination.totalPages);
      }
    } catch (err) {
      console.error('Failed to fetch items:', err);
    } finally {
      setItemsLoading(false);
    }
  }, [session, page, filterType, filterStatus]);

  // Save feedback locally (batch mode - not submitted until user clicks submit)
  const markFeedback = (itemId: string, isCorrect: boolean) => {
    // Find the current item to check its status
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    // Check if clicking same vote on an already-reviewed item
    if (item.status === 'reviewed') {
      toast.info('Item already reviewed. Cannot change feedback.');
      return;
    }

    // Check if we have pending local feedback with the same vote (toggle off)
    const existingLocal = pendingFeedback.get(itemId);
    if (existingLocal?.isCorrect === isCorrect) {
      // Toggle off local state - remove pending feedback
      setPendingFeedback(prev => {
        const updated = new Map(prev);
        updated.delete(itemId);
        return updated;
      });
      return;
    }

    // Save feedback locally (with any existing note)
    setPendingFeedback(prev => {
      const updated = new Map(prev);
      updated.set(itemId, {
        isCorrect,
        note: existingLocal?.note || '',
      });
      return updated;
    });
  };

  // Save feedback from dialog (includes note)
  const saveFeedbackFromDialog = (itemId: string, isCorrect: boolean, note: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item || item.status === 'reviewed') return;

    setPendingFeedback(prev => {
      const updated = new Map(prev);
      updated.set(itemId, { isCorrect, note });
      return updated;
    });
  };

  // Submit all pending feedback to server (batch submission)
  const submitAllFeedback = async () => {
    if (pendingFeedback.size === 0) {
      toast.info('No pending feedback to submit');
      return;
    }

    setIsSubmittingBatch(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      // Submit each pending feedback item
      const feedbackEntries = Array.from(pendingFeedback.entries());

      for (const [itemId, feedback] of feedbackEntries) {
        try {
          const res = await fetch('/api/train/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sampleId: itemId,
              action: 'feedback',
              isCorrect: feedback.isCorrect,
              notes: feedback.note || undefined,
            }),
          });

          const data = await res.json();

          if (data.success) {
            successCount++;

            // Update the item in local state to show as reviewed
            setItems(prev => prev.map(i => {
              if (i.id === itemId) {
                return {
                  ...i,
                  status: 'reviewed' as const,
                  feedback: { isCorrect: feedback.isCorrect, notes: feedback.note || undefined }
                };
              }
              return i;
            }));

            // Update training budget if returned
            if (data.trainingBudget) {
              setTrainingBudget(data.trainingBudget);
            }

            // Check for budget exhaustion
            if (data.budgetExhausted) {
              toast.warning('Training budget exhausted');
              if (session) {
                setSession({ ...session, status: 'paused' });
              }
              // Stop submitting if budget is exhausted
              break;
            }
          } else {
            errorCount++;
            console.error(`Failed to submit feedback for ${itemId}:`, data.error);
          }
        } catch (err) {
          errorCount++;
          console.error(`Failed to submit feedback for ${itemId}:`, err);
        }
      }

      // Clear successfully submitted feedback
      setPendingFeedback(new Map());

      // Show result toast
      if (errorCount === 0) {
        toast.success(`Submitted ${successCount} feedback item${successCount !== 1 ? 's' : ''}`);
      } else if (successCount > 0) {
        toast.warning(`Submitted ${successCount} item${successCount !== 1 ? 's' : ''}, ${errorCount} failed`);
      } else {
        toast.error('Failed to submit feedback');
      }

      // Refresh feedback stats
      await fetchStatus();
    } catch (err) {
      console.error('Failed to submit batch feedback:', err);
      toast.error('Failed to submit feedback');
    } finally {
      setIsSubmittingBatch(false);
    }
  };

  // Open the feedback dialog for an item
  const openFeedbackDialog = (item: DiscoveredItem) => {
    setFeedbackDialogItem(item);
    setFeedbackDialogOpen(true);
  };

  // Add budget top-up handler
  const addTrainingBudget = async (amount: number) => {
    try {
      const res = await fetch('/api/train/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addTrainingBudget: amount,
          action: 'resume', // Resume session after adding budget
        }),
      });

      const data = await res.json();

      if (data.success) {
        if (data.trainingBudget) {
          setTrainingBudget(data.trainingBudget);
        }
        if (data.session) {
          setSession(data.session);
        }
        toast.success(`Added $${amount} to training budget`);
        await fetchStatus();
      } else {
        toast.error(data.error || 'Failed to add budget');
      }
    } catch (err) {
      console.error('Failed to add budget:', err);
      toast.error('Failed to add budget');
    }
  };


  // ============================================================
  // Effects
  // ============================================================

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    // Fetch items for both discovery and review tabs when session exists
    if (session) {
      fetchItems();
    }
  }, [session, fetchItems]);

  // Resume processing if session is running on mount
  // Using refs to avoid dependency cycles that cause infinite loops
  useEffect(() => {
    // Guard: Only start if session is running, not already processing, and budget available
    const shouldProcess =
      session?.status === 'running' &&
      !processingRef.current &&
      (!discoveryBudget || discoveryBudget.remaining > 0);

    if (shouldProcess) {
      startProcessing();
    }

    return () => {
      // Cleanup: stop processing when component unmounts or dependencies change
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
      processingRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status]); // Intentionally minimal deps - use refs for other checks

  // ============================================================
  // Computed
  // ============================================================

  const feedbackCount = feedbackStats?.reviewed || 0;
  const canAutoTrain = feedbackCount >= MIN_FEEDBACK_FOR_AUTO_TRAIN;
  const feedbackNeeded = MIN_FEEDBACK_FOR_AUTO_TRAIN - feedbackCount;
  const trainingBudgetExhausted = trainingBudget ? trainingBudget.remaining <= 0 : false;

  // ============================================================
  // Render
  // ============================================================

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: '700', color: '#111', marginBottom: '0.5rem' }}>
          Discover
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          Automatically discover entities and relationships from your emails and calendar
        </p>
      </div>

      {/* Tab Toggle */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '2rem',
          backgroundColor: '#f3f4f6',
          padding: '0.25rem',
          borderRadius: '8px',
          width: 'fit-content',
        }}
      >
        <button
          onClick={() => setActiveTab('discovery')}
          style={{
            padding: '0.625rem 1.25rem',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: activeTab === 'discovery' ? '#fff' : 'transparent',
            color: activeTab === 'discovery' ? '#111' : '#6b7280',
            fontSize: '0.875rem',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: activeTab === 'discovery' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            transition: 'all 0.2s',
          }}
        >
          Discovery
        </button>
        <button
          onClick={() => setActiveTab('review')}
          style={{
            padding: '0.625rem 1.25rem',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: activeTab === 'review' ? '#fff' : 'transparent',
            color: activeTab === 'review' ? '#111' : '#6b7280',
            fontSize: '0.875rem',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: activeTab === 'review' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          Review
          {feedbackStats && feedbackStats.pending > 0 && (
            <span
              style={{
                backgroundColor: '#ef4444',
                color: '#fff',
                fontSize: '0.75rem',
                padding: '0.125rem 0.5rem',
                borderRadius: '9999px',
                fontWeight: '600',
              }}
            >
              {feedbackStats.pending}
            </span>
          )}
        </button>
      </div>

      {/* ============================================================ */}
      {/* Discovery Tab */}
      {/* ============================================================ */}
      {activeTab === 'discovery' && (
        <>
          {isLoading && (
            <div style={{ textAlign: 'center', padding: '4rem', color: '#6b7280' }}>
              Loading...
            </div>
          )}

          {/* No Active Session - Setup Form */}
          {!isLoading && !session && (
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '2rem',
              }}
            >
              <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#111', marginBottom: '1.5rem' }}>
                Start Discovery Session
              </h2>

              {error && (
                <div
                  style={{
                    backgroundColor: '#fee2e2',
                    border: '1px solid #fca5a5',
                    borderRadius: '8px',
                    padding: '1rem',
                    marginBottom: '1.5rem',
                    color: '#991b1b',
                    fontSize: '0.875rem',
                  }}
                >
                  {error}
                </div>
              )}

              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
                Izzie will automatically process your emails and calendar events day by day to discover
                people, companies, topics, and their relationships.
              </p>

              {/* Discovery Budget Selection */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>
                  Discovery Budget
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {BUDGET_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setSetupDiscoveryBudget(value)}
                      style={{
                        padding: '0.625rem 1rem',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: setupDiscoveryBudget === value ? '#8b5cf6' : '#f3f4f6',
                        color: setupDiscoveryBudget === value ? '#fff' : '#374151',
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
                  For processing emails and calendar to find entities. Typical cost: $0.01-0.05 per day.
                </p>
              </div>

              {/* Training Budget Selection */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>
                  Training Budget
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {BUDGET_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setSetupTrainingBudget(value)}
                      style={{
                        padding: '0.625rem 1rem',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: setupTrainingBudget === value ? '#10b981' : '#f3f4f6',
                        color: setupTrainingBudget === value ? '#fff' : '#374151',
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
                  For user feedback and model training (RLHF). Separate from discovery budget.
                </p>
              </div>

              {/* Start Button */}
              <button
                onClick={startDiscovery}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  backgroundColor: '#8b5cf6',
                  color: '#fff',
                  padding: '0.875rem 1.5rem',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                <Play style={{ width: '16px', height: '16px' }} />
                Start Discovery
              </button>
            </div>
          )}

          {/* Active Session */}
          {!isLoading && session && (
            <>
              {/* Status Bar */}
              <div
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  marginBottom: '1.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {/* Status Indicator */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        borderRadius: '9999px',
                        backgroundColor: isProcessing ? '#dbeafe' : session.status === 'paused' ? '#f3f4f6' : '#d1fae5',
                        color: isProcessing ? '#1e40af' : session.status === 'paused' ? '#6b7280' : '#065f46',
                        fontSize: '0.875rem',
                        fontWeight: '600',
                      }}
                    >
                      {isProcessing && (
                        <RefreshCw style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} />
                      )}
                      {isProcessing ? (
                        processingDetails ? (
                          processingDetails.phase === 'complete' && processingDetails.lastItemsFound !== undefined
                            ? `Found ${processingDetails.lastItemsFound} items`
                            : 'Processing...'
                        ) : 'Processing...'
                      ) : session.status === 'paused' ? 'Paused' : 'Complete'}
                    </div>
                    {isProcessing && processingDetails && (
                      <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                        {processingDetails.phase === 'fetching' ? (
                          <>Fetching emails &amp; calendar for {formatDateNicely(processingDetails.currentDay)}...</>
                        ) : processingDetails.phase === 'complete' ? (
                          <>Processed {formatDateNicely(processingDetails.currentDay)}</>
                        ) : (
                          <>Extracting entities from {formatDateNicely(processingDetails.currentDay)}...</>
                        )}
                      </span>
                    )}
                    {!isProcessing && progress?.currentActivity && (
                      <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                        {progress.currentActivity}
                      </span>
                    )}
                  </div>

                  {/* Controls */}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {session.status === 'running' || isProcessing ? (
                      <button
                        onClick={pauseDiscovery}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.375rem',
                          padding: '0.5rem 1rem',
                          borderRadius: '8px',
                          border: 'none',
                          backgroundColor: '#f59e0b',
                          color: '#fff',
                          fontSize: '0.875rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                        }}
                      >
                        <Pause style={{ width: '14px', height: '14px' }} />
                        Pause
                      </button>
                    ) : session.status === 'paused' ? (
                      <button
                        onClick={resumeDiscovery}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.375rem',
                          padding: '0.5rem 1rem',
                          borderRadius: '8px',
                          border: 'none',
                          backgroundColor: '#10b981',
                          color: '#fff',
                          fontSize: '0.875rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                        }}
                      >
                        <Play style={{ width: '14px', height: '14px' }} />
                        Resume
                      </button>
                    ) : null}
                    <button
                      onClick={cancelDiscovery}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        padding: '0.5rem 1rem',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: '#ef4444',
                        color: '#fff',
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                      }}
                    >
                      <Square style={{ width: '14px', height: '14px' }} />
                      Cancel
                    </button>
                  </div>
                </div>
              </div>

              {/* Progress Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1rem',
                  marginBottom: '1.5rem',
                }}
              >
                {/* Days Processed */}
                <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>
                    Days Processed
                  </h3>
                  <div style={{ fontSize: '2rem', fontWeight: '700', color: '#111' }}>
                    {progress?.daysProcessed || 0}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Going backwards from today
                  </div>
                </div>

                {/* Items Discovered */}
                <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>
                    Items Discovered
                  </h3>
                  <div style={{ fontSize: '2rem', fontWeight: '700', color: '#8b5cf6' }}>
                    {progress?.itemsDiscovered || 0}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Entities & relationships
                  </div>
                </div>

                {/* Discovery Budget Meter */}
                <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>
                    Discovery Budget
                  </h3>
                  <div style={{ backgroundColor: '#e5e7eb', borderRadius: '4px', height: '8px', marginBottom: '0.75rem', overflow: 'hidden' }}>
                    <div
                      style={{
                        backgroundColor: discoveryBudget && discoveryBudget.remaining < discoveryBudget.total * 0.2 ? '#ef4444' : '#8b5cf6',
                        width: discoveryBudget ? `${((discoveryBudget.total - discoveryBudget.used) / discoveryBudget.total) * 100}%` : '100%',
                        height: '100%',
                        borderRadius: '4px',
                        transition: 'width 0.3s ease-in-out',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6b7280' }}>
                    <span>Used: ${discoveryBudget ? (discoveryBudget.used / 100).toFixed(2) : '0.00'}</span>
                    <span>Remaining: ${discoveryBudget ? (discoveryBudget.remaining / 100).toFixed(2) : '0.00'}</span>
                  </div>
                </div>

                {/* Training Budget Meter */}
                <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>
                    Training Budget
                  </h3>
                  <div style={{ backgroundColor: '#e5e7eb', borderRadius: '4px', height: '8px', marginBottom: '0.75rem', overflow: 'hidden' }}>
                    <div
                      style={{
                        backgroundColor: trainingBudget && trainingBudget.remaining < trainingBudget.total * 0.2 ? '#ef4444' : '#10b981',
                        width: trainingBudget ? `${((trainingBudget.total - trainingBudget.used) / trainingBudget.total) * 100}%` : '100%',
                        height: '100%',
                        borderRadius: '4px',
                        transition: 'width 0.3s ease-in-out',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6b7280' }}>
                    <span>Used: ${trainingBudget ? (trainingBudget.used / 100).toFixed(2) : '0.00'}</span>
                    <span>Remaining: ${trainingBudget ? (trainingBudget.remaining / 100).toFixed(2) : '0.00'}</span>
                  </div>
                </div>

                {/* Feedback Progress */}
                <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>
                    Feedback
                  </h3>
                  <div style={{ fontSize: '2rem', fontWeight: '700', color: '#10b981' }}>
                    {feedbackCount}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {feedbackStats?.pending || 0} pending review
                  </div>
                </div>
              </div>

              {/* Current Activity - shown when processing */}
              {isProcessing && processingDetails && (
                <div
                  style={{
                    backgroundColor: '#f0f9ff',
                    border: '1px solid #bae6fd',
                    borderRadius: '12px',
                    padding: '1.25rem 1.5rem',
                    marginBottom: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                  }}
                >
                  <RefreshCw
                    style={{
                      width: '24px',
                      height: '24px',
                      color: '#0284c7',
                      animation: 'spin 1s linear infinite',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.9375rem', fontWeight: '600', color: '#0369a1', marginBottom: '0.25rem' }}>
                      {processingDetails.phase === 'fetching' ? (
                        <>Processing emails and calendar for {formatDateNicely(processingDetails.currentDay)}...</>
                      ) : processingDetails.phase === 'complete' ? (
                        <>Completed {formatDateNicely(processingDetails.currentDay)}</>
                      ) : (
                        <>Extracting entities from {formatDateNicely(processingDetails.currentDay)}...</>
                      )}
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: '#0284c7' }}>
                      {processingDetails.phase === 'complete' && processingDetails.lastItemsFound !== undefined ? (
                        processingDetails.lastItemsFound > 0 ? (
                          <>Found {processingDetails.lastItemsFound} {processingDetails.lastItemsFound === 1 ? 'item' : 'items'} (people, companies, topics, relationships)</>
                        ) : (
                          <>No new items found for this day</>
                        )
                      ) : (
                        <>Searching for people, companies, topics, and relationships...</>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Real-time discovered items list */}
              {items.length > 0 && (
                <div
                  style={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    marginBottom: '1.5rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111', margin: 0 }}>
                      Recently Discovered
                      {isProcessing && (
                        <span
                          style={{
                            marginLeft: '0.75rem',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                            color: '#059669',
                            backgroundColor: '#d1fae5',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '9999px',
                          }}
                        >
                          Live updating
                        </span>
                      )}
                    </h3>
                    <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      {items.length} items - Provide feedback below
                    </span>
                  </div>

                  <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {items.slice(0, 20).map((item) => {
                      // Get local pending feedback for this item
                      const localFeedback = pendingFeedback.get(item.id);
                      const localIsCorrect = localFeedback?.isCorrect;
                      // isSubmitting is true when batch submission is in progress and this item has pending feedback
                      const isSubmitting = isSubmittingBatch && localFeedback !== undefined;

                      // Determine border color based on feedback status
                      let borderColor = '#e5e7eb';
                      let bgColor = '#fff';

                      if (item.feedback?.isCorrect === true) {
                        borderColor = '#22c55e';
                        bgColor = '#f0fdf4';
                      } else if (item.feedback?.isCorrect === false) {
                        borderColor = '#ef4444';
                        bgColor = '#fef2f2';
                      } else if (localIsCorrect === true) {
                        borderColor = '#86efac';
                        bgColor = '#f0fdf4';
                      } else if (localIsCorrect === false) {
                        borderColor = '#fca5a5';
                        bgColor = '#fef2f2';
                      }

                      // Source type icon
                      const SourceIcon = item.source?.type === 'email' ? Mail : item.source?.type === 'calendar' ? Calendar : null;

                      return (
                        <div
                          key={item.id}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            padding: '0.75rem',
                            backgroundColor: bgColor,
                            borderRadius: '8px',
                            border: `2px solid ${borderColor}`,
                            transition: 'all 0.2s',
                            opacity: isSubmitting ? 0.7 : 1,
                          }}
                        >
                          {/* Left: Content */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                              {/* Source type icon */}
                              {SourceIcon && (
                                <span title={item.source?.type === 'email' ? 'From email' : 'From calendar'}>
                                  <SourceIcon
                                    style={{ width: '14px', height: '14px', color: '#6b7280', flexShrink: 0 }}
                                  />
                                </span>
                              )}
                              <span
                                style={{
                                  fontSize: '0.75rem',
                                  padding: '0.125rem 0.5rem',
                                  borderRadius: '4px',
                                  backgroundColor: item.type === 'entity' ? '#dbeafe' : '#fce7f3',
                                  color: item.type === 'entity' ? '#1e40af' : '#9d174d',
                                  fontWeight: '500',
                                  textTransform: 'capitalize',
                                }}
                              >
                                {item.type}
                              </span>
                              <span
                                style={{
                                  fontWeight: '500',
                                  fontSize: '0.875rem',
                                  color: '#111',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {item.content.text}
                              </span>
                              {/* Occurrence count badge */}
                              {item.occurrenceCount && item.occurrenceCount > 1 && (
                                <span
                                  style={{
                                    fontSize: '0.625rem',
                                    padding: '0.125rem 0.375rem',
                                    borderRadius: '9999px',
                                    backgroundColor: '#e0e7ff',
                                    color: '#4338ca',
                                    fontWeight: '600',
                                  }}
                                  title={`Found ${item.occurrenceCount} times`}
                                >
                                  x{item.occurrenceCount}
                                </span>
                              )}
                            </div>
                            {/* Context preview */}
                            {item.content.context && (
                              <p
                                style={{
                                  fontSize: '0.75rem',
                                  color: '#6b7280',
                                  margin: '0.25rem 0 0 0',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  maxWidth: '100%',
                                }}
                                title={item.content.context}
                              >
                                {item.content.context.length > 100
                                  ? `${item.content.context.substring(0, 100)}...`
                                  : item.content.context}
                              </p>
                            )}
                            <div
                              style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}
                              title={item.prediction.reasoning || undefined}
                            >
                              {item.prediction.label} &bull; {item.prediction.confidence}% confidence
                              {item.prediction.reasoning && (
                                <span style={{ marginLeft: '0.25rem', cursor: 'help' }} title={item.prediction.reasoning}>
                                  (?)
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right: Actions - always enabled even during processing */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginLeft: '1rem', flexShrink: 0 }}>
                            {item.status === 'pending' ? (
                              trainingBudgetExhausted ? (
                                <span
                                  style={{
                                    fontSize: '0.75rem',
                                    fontWeight: '500',
                                    color: '#9ca3af',
                                    fontStyle: 'italic',
                                  }}
                                >
                                  Add budget
                                </span>
                              ) : localFeedback ? (
                                // Show pending feedback badge
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <span
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.25rem',
                                      fontSize: '0.75rem',
                                      fontWeight: '600',
                                      padding: '0.25rem 0.5rem',
                                      borderRadius: '4px',
                                      backgroundColor: localFeedback.isCorrect ? '#dcfce7' : '#fee2e2',
                                      color: localFeedback.isCorrect ? '#166534' : '#991b1b',
                                    }}
                                  >
                                    <CheckCircle2 style={{ width: '12px', height: '12px' }} />
                                    {localFeedback.isCorrect ? 'Correct' : 'Incorrect'}
                                    {localFeedback.note && ' + Note'}
                                  </span>
                                  <button
                                    onClick={() => openFeedbackDialog(item)}
                                    style={{
                                      padding: '0.25rem',
                                      borderRadius: '4px',
                                      border: 'none',
                                      backgroundColor: 'transparent',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                    title="Edit feedback"
                                  >
                                    <MessageSquare style={{ width: '14px', height: '14px', color: '#6b7280' }} />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    onClick={() => markFeedback(item.id, true)}
                                    style={{
                                      padding: '0.5rem',
                                      borderRadius: '6px',
                                      border: 'none',
                                      backgroundColor: 'transparent',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      transition: 'background-color 0.2s',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#dcfce7'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                    title="Mark as correct"
                                  >
                                    <ThumbsUp style={{ width: '16px', height: '16px', color: '#22c55e' }} />
                                  </button>
                                  <button
                                    onClick={() => markFeedback(item.id, false)}
                                    style={{
                                      padding: '0.5rem',
                                      borderRadius: '6px',
                                      border: 'none',
                                      backgroundColor: 'transparent',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      transition: 'background-color 0.2s',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#fee2e2'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                    title="Mark as incorrect"
                                  >
                                    <ThumbsDown style={{ width: '16px', height: '16px', color: '#ef4444' }} />
                                  </button>
                                  <button
                                    onClick={() => openFeedbackDialog(item)}
                                    style={{
                                      padding: '0.5rem',
                                      borderRadius: '6px',
                                      border: 'none',
                                      backgroundColor: 'transparent',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      transition: 'background-color 0.2s',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#dbeafe'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                    title="Add note with context"
                                  >
                                    <MessageSquare style={{ width: '16px', height: '16px', color: '#3b82f6' }} />
                                  </button>
                                </>
                              )
                            ) : (
                              <span
                                style={{
                                  fontSize: '0.75rem',
                                  fontWeight: '500',
                                  color: item.feedback?.isCorrect ? '#22c55e' : '#ef4444',
                                }}
                              >
                                {item.feedback?.isCorrect ? 'Correct' : 'Incorrect'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Submit All Feedback Button */}
                  {pendingFeedback.size > 0 && (
                    <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1px solid #86efac' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div>
                          <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#166534' }}>
                            {pendingFeedback.size} item{pendingFeedback.size !== 1 ? 's' : ''} ready to submit
                          </span>
                          <p style={{ fontSize: '0.75rem', color: '#15803d', margin: '0.25rem 0 0 0' }}>
                            Click &quot;Submit All Feedback&quot; to save to database
                          </p>
                        </div>
                        <button
                          onClick={submitAllFeedback}
                          disabled={isSubmittingBatch}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.625rem 1.25rem',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: isSubmittingBatch ? '#86efac' : '#22c55e',
                            color: '#fff',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            cursor: isSubmittingBatch ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {isSubmittingBatch ? (
                            <>
                              <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                              Submitting...
                            </>
                          ) : (
                            <>
                              <Send style={{ width: '16px', height: '16px' }} />
                              Submit All Feedback
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {items.length > 20 && (
                    <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                      <button
                        onClick={() => setActiveTab('review')}
                        style={{
                          fontSize: '0.875rem',
                          color: '#3b82f6',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                      >
                        View all {items.length} items in Review tab
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* How It Works Info */}
              <div
                style={{
                  backgroundColor: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '12px',
                  padding: '1.5rem',
                }}
              >
                <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#1e40af', marginBottom: '0.75rem' }}>
                  What&apos;s Happening
                </h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  <li style={{ fontSize: '0.875rem', color: '#1e40af', marginBottom: '0.5rem' }}>
                    - Processing emails and calendar events day by day, starting from today
                  </li>
                  <li style={{ fontSize: '0.875rem', color: '#1e40af', marginBottom: '0.5rem' }}>
                    - Extracting people, companies, topics, and relationships using AI
                  </li>
                  <li style={{ fontSize: '0.875rem', color: '#1e40af', marginBottom: '0.5rem' }}>
                    - Creating review items for you to provide feedback
                  </li>
                  <li style={{ fontSize: '0.875rem', color: '#1e40af' }}>
                    - You can provide feedback on items above while discovery is running
                  </li>
                </ul>
              </div>
            </>
          )}
        </>
      )}

      {/* ============================================================ */}
      {/* Review Tab */}
      {/* ============================================================ */}
      {activeTab === 'review' && (
        <>
          {/* Budget Exhausted Banner */}
          {trainingBudgetExhausted && (
            <div
              style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '12px',
                padding: '1rem 1.5rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <AlertCircle style={{ width: '20px', height: '20px', color: '#dc2626' }} />
                <div>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#991b1b', marginBottom: '0.25rem', margin: 0 }}>
                    Training Budget Exhausted
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: '#991b1b', margin: 0 }}>
                    Add more budget to continue providing feedback.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => addTrainingBudget(5)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    padding: '0.625rem 1rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#10b981',
                    color: '#fff',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  <DollarSign style={{ width: '14px', height: '14px' }} />
                  Add $5
                </button>
                <button
                  onClick={() => addTrainingBudget(10)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    padding: '0.625rem 1rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#059669',
                    color: '#fff',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  <DollarSign style={{ width: '14px', height: '14px' }} />
                  Add $10
                </button>
              </div>
            </div>
          )}

          {/* Auto-Train Status */}
          <div
            style={{
              backgroundColor: canAutoTrain ? '#f0fdf4' : '#fffbeb',
              border: `1px solid ${canAutoTrain ? '#86efac' : '#fcd34d'}`,
              borderRadius: '12px',
              padding: '1rem 1.5rem',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div>
              <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: canAutoTrain ? '#166534' : '#92400e', marginBottom: '0.25rem' }}>
                {canAutoTrain ? 'Ready for Auto-Train!' : `${feedbackNeeded} more reviews needed`}
              </h3>
              <p style={{ fontSize: '0.75rem', color: canAutoTrain ? '#166534' : '#92400e', margin: 0 }}>
                {canAutoTrain
                  ? `You've provided ${feedbackCount} reviews. Auto-training is available.`
                  : `Provide feedback on ${MIN_FEEDBACK_FOR_AUTO_TRAIN} items to enable automatic model training.`}
              </p>
            </div>
            <button
              disabled={!canAutoTrain}
              style={{
                padding: '0.625rem 1rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: canAutoTrain ? '#10b981' : '#e5e7eb',
                color: canAutoTrain ? '#fff' : '#9ca3af',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: canAutoTrain ? 'pointer' : 'not-allowed',
              }}
            >
              {canAutoTrain ? 'Start Auto-Train' : `Auto-Train (need ${feedbackNeeded} more)`}
            </button>
          </div>

          {/* Filters */}
          <div
            style={{
              display: 'flex',
              gap: '1rem',
              marginBottom: '1rem',
              flexWrap: 'wrap',
            }}
          >
            {/* Type Filter */}
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {(['all', 'entity', 'relationship'] as FilterType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => { setFilterType(type); setPage(1); }}
                  style={{
                    padding: '0.375rem 0.75rem',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: filterType === type ? '#8b5cf6' : '#f3f4f6',
                    color: filterType === type ? '#fff' : '#374151',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {type}
                </button>
              ))}
            </div>

            {/* Status Filter */}
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {(['all', 'pending', 'reviewed'] as FilterStatus[]).map((status) => (
                <button
                  key={status}
                  onClick={() => { setFilterStatus(status); setPage(1); }}
                  style={{
                    padding: '0.375rem 0.75rem',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: filterStatus === status ? '#10b981' : '#f3f4f6',
                    color: filterStatus === status ? '#fff' : '#374151',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* Items List */}
          <div
            style={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111', margin: 0 }}>
                Review Items
              </h3>
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                {items.length} items
              </span>
            </div>

            {itemsLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                Loading...
              </div>
            ) : items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                <p style={{ margin: 0 }}>No items to review.</p>
                {!session && (
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem' }}>
                    Start a discovery session first.
                  </p>
                )}
              </div>
            ) : (
              <div style={{ maxHeight: '60vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {items.map((item) => {
                  // Get local pending feedback for this item
                  const localFeedback = pendingFeedback.get(item.id);

                  // Determine border color based on feedback status (local pending or already submitted)
                  let borderColor = '#e5e7eb';
                  let bgColor = '#fff';

                  // Already submitted feedback takes precedence
                  if (item.feedback?.isCorrect === true) {
                    borderColor = '#22c55e';
                    bgColor = '#f0fdf4';
                  } else if (item.feedback?.isCorrect === false) {
                    borderColor = '#ef4444';
                    bgColor = '#fef2f2';
                  }
                  // Local pending feedback (not yet submitted)
                  else if (localFeedback?.isCorrect === true) {
                    borderColor = '#86efac';
                    bgColor = '#f0fdf4';
                  } else if (localFeedback?.isCorrect === false) {
                    borderColor = '#fca5a5';
                    bgColor = '#fef2f2';
                  }

                  // Source type icon
                  const SourceIcon = item.source?.type === 'email' ? Mail : item.source?.type === 'calendar' ? Calendar : null;

                  return (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        padding: '0.75rem',
                        backgroundColor: bgColor,
                        borderRadius: '8px',
                        border: `2px solid ${borderColor}`,
                        transition: 'all 0.2s',
                      }}
                    >
                      {/* Left: Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                          {/* Source type icon */}
                          {SourceIcon && (
                            <span title={item.source?.type === 'email' ? 'From email' : 'From calendar'}>
                              <SourceIcon
                                style={{ width: '14px', height: '14px', color: '#6b7280', flexShrink: 0 }}
                              />
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.125rem 0.5rem',
                              borderRadius: '4px',
                              backgroundColor: item.type === 'entity' ? '#dbeafe' : '#fce7f3',
                              color: item.type === 'entity' ? '#1e40af' : '#9d174d',
                              fontWeight: '500',
                              textTransform: 'capitalize',
                            }}
                          >
                            {item.type}
                          </span>
                          <span
                            style={{
                              fontWeight: '500',
                              fontSize: '0.875rem',
                              color: '#111',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.content.text}
                          </span>
                          {/* Occurrence count badge */}
                          {item.occurrenceCount && item.occurrenceCount > 1 && (
                            <span
                              style={{
                                fontSize: '0.625rem',
                                padding: '0.125rem 0.375rem',
                                borderRadius: '9999px',
                                backgroundColor: '#e0e7ff',
                                color: '#4338ca',
                                fontWeight: '600',
                              }}
                              title={`Found ${item.occurrenceCount} times`}
                            >
                              x{item.occurrenceCount}
                            </span>
                          )}
                        </div>
                        {/* Context preview */}
                        {item.content.context && (
                          <p
                            style={{
                              fontSize: '0.75rem',
                              color: '#6b7280',
                              margin: '0.25rem 0 0 0',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: '100%',
                            }}
                            title={item.content.context}
                          >
                            {item.content.context.length > 100
                              ? `${item.content.context.substring(0, 100)}...`
                              : item.content.context}
                          </p>
                        )}
                        <div
                          style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}
                          title={item.prediction.reasoning || undefined}
                        >
                          {item.prediction.label} &bull; {item.prediction.confidence}% confidence
                          {item.prediction.reasoning && (
                            <span style={{ marginLeft: '0.25rem', cursor: 'help' }} title={item.prediction.reasoning}>
                              (?)
                            </span>
                          )}
                          {localFeedback?.note && (
                            <span style={{ marginLeft: '0.5rem', color: '#3b82f6' }}>
                              &bull; Has note
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginLeft: '1rem', flexShrink: 0 }}>
                        {item.status === 'pending' ? (
                          trainingBudgetExhausted ? (
                            <span
                              style={{
                                fontSize: '0.75rem',
                                fontWeight: '500',
                                color: '#9ca3af',
                                fontStyle: 'italic',
                              }}
                            >
                              Add budget to review
                            </span>
                          ) : localFeedback ? (
                            // Show pending feedback badge
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  fontSize: '0.75rem',
                                  fontWeight: '600',
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '4px',
                                  backgroundColor: localFeedback.isCorrect ? '#dcfce7' : '#fee2e2',
                                  color: localFeedback.isCorrect ? '#166534' : '#991b1b',
                                }}
                              >
                                <CheckCircle2 style={{ width: '12px', height: '12px' }} />
                                {localFeedback.isCorrect ? 'Correct' : 'Incorrect'}
                                {localFeedback.note && ' + Note'}
                              </span>
                              <button
                                onClick={() => openFeedbackDialog(item)}
                                style={{
                                  padding: '0.25rem',
                                  borderRadius: '4px',
                                  border: 'none',
                                  backgroundColor: 'transparent',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                                title="Edit feedback"
                              >
                                <MessageSquare style={{ width: '14px', height: '14px', color: '#6b7280' }} />
                              </button>
                            </div>
                          ) : (
                          <>
                            <button
                              onClick={() => markFeedback(item.id, true)}
                              style={{
                                padding: '0.5rem',
                                borderRadius: '6px',
                                border: 'none',
                                backgroundColor: 'transparent',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'background-color 0.2s',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#dcfce7'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                              title="Mark as correct"
                            >
                              <ThumbsUp style={{ width: '16px', height: '16px', color: '#22c55e' }} />
                            </button>
                            <button
                              onClick={() => markFeedback(item.id, false)}
                              style={{
                                padding: '0.5rem',
                                borderRadius: '6px',
                                border: 'none',
                                backgroundColor: 'transparent',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'background-color 0.2s',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#fee2e2'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                              title="Mark as incorrect"
                            >
                              <ThumbsDown style={{ width: '16px', height: '16px', color: '#ef4444' }} />
                            </button>
                            <button
                              onClick={() => openFeedbackDialog(item)}
                              style={{
                                padding: '0.5rem',
                                borderRadius: '6px',
                                border: 'none',
                                backgroundColor: 'transparent',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'background-color 0.2s',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#dbeafe'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                              title="Add note with context"
                            >
                              <MessageSquare style={{ width: '16px', height: '16px', color: '#3b82f6' }} />
                            </button>
                          </>
                          )
                        ) : (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: '500',
                              color: item.feedback?.isCorrect ? '#22c55e' : '#ef4444',
                            }}
                          >
                            {item.feedback?.isCorrect ? 'Correct' : 'Incorrect'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Submit All Feedback Button */}
            {pendingFeedback.size > 0 && (
              <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1px solid #86efac' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#166534' }}>
                      {pendingFeedback.size} item{pendingFeedback.size !== 1 ? 's' : ''} ready to submit
                    </span>
                    <p style={{ fontSize: '0.75rem', color: '#15803d', margin: '0.25rem 0 0 0' }}>
                      Click &quot;Submit All Feedback&quot; to save to database
                    </p>
                  </div>
                  <button
                    onClick={submitAllFeedback}
                    disabled={isSubmittingBatch}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.625rem 1.25rem',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: isSubmittingBatch ? '#86efac' : '#22c55e',
                      color: '#fff',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      cursor: isSubmittingBatch ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isSubmittingBatch ? (
                      <>
                        <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send style={{ width: '16px', height: '16px' }} />
                        Submit All Feedback
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#fff',
                    color: page === 1 ? '#9ca3af' : '#374151',
                    fontSize: '0.875rem',
                    cursor: page === 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Previous
                </button>
                <span style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem', color: '#6b7280' }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#fff',
                    color: page === totalPages ? '#9ca3af' : '#374151',
                    fontSize: '0.875rem',
                    cursor: page === totalPages ? 'not-allowed' : 'pointer',
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Feedback Dialog Component */}
      <FeedbackDialog
        open={feedbackDialogOpen}
        onOpenChange={setFeedbackDialogOpen}
        item={feedbackDialogItem}
        pendingFeedback={feedbackDialogItem ? pendingFeedback.get(feedbackDialogItem.id) : null}
        onSaveFeedback={saveFeedbackFromDialog}
      />

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

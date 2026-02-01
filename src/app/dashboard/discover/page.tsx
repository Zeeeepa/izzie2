/**
 * Discover Page
 * Entity and relationship discovery with autonomous processing and feedback review
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/components/ui/toast';
import { useConfirmModal } from '@/components/ui/confirm-modal';
import { ThumbsUp, ThumbsDown, MessageSquare, X, Play, Pause, Square, RefreshCw, DollarSign, AlertCircle } from 'lucide-react';

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

  // Note dialog state
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<DiscoveredItem | null>(null);
  const [noteDialogFeedback, setNoteDialogFeedback] = useState<boolean | null>(null);
  const [noteDialogText, setNoteDialogText] = useState('');

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

        if (data.complete) {
          // Processing complete - show toast only once
          stopProcessing();
          if (!budgetExhaustedToastShown.current) {
            toast.success(data.message || 'Discovery complete.');
            if (data.reason === 'budget_exhausted') {
              budgetExhaustedToastShown.current = true;
            }
          }
          await fetchStatus();
        } else if (processingRef.current) {
          // Continue processing after a short delay
          pollTimeoutRef.current = setTimeout(processNextDay, POLL_INTERVAL);
        }
      } else {
        console.error('Process day failed:', data.error);
        stopProcessing();
      }
    } catch (err) {
      console.error('Process day error:', err);
      stopProcessing();
    }
  }, [fetchStatus, toast, discoveryBudget, stopProcessing]);

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

  const submitFeedback = async (itemId: string, isCorrect: boolean, notes?: string) => {
    try {
      const res = await fetch('/api/train/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sampleId: itemId,
          action: 'feedback',
          isCorrect,
          notes,
        }),
      });

      const data = await res.json();

      if (data.success) {
        // Update item in list
        setItems(prev => prev.map(item =>
          item.id === itemId
            ? { ...item, status: 'reviewed' as const, feedback: { isCorrect, notes } }
            : item
        ));

        // Update training budget if returned
        if (data.trainingBudget) {
          setTrainingBudget(data.trainingBudget);
        }

        // Check for budget exhaustion
        if (data.budgetExhausted) {
          toast.warning(data.message || 'Training budget exhausted');
          // Update session status locally
          if (session) {
            setSession({ ...session, status: 'paused' });
          }
        }

        // Refresh stats
        await fetchStatus();
      }
    } catch (err) {
      console.error('Failed to submit feedback:', err);
    }
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

  const openNoteDialog = (item: DiscoveredItem) => {
    setSelectedItem(item);
    setNoteDialogFeedback(null);
    setNoteDialogText('');
    setNoteDialogOpen(true);
  };

  const submitNoteDialogFeedback = async () => {
    if (!selectedItem || noteDialogFeedback === null) return;
    await submitFeedback(selectedItem.id, noteDialogFeedback, noteDialogText);
    setNoteDialogOpen(false);
    setSelectedItem(null);
  };

  // ============================================================
  // Effects
  // ============================================================

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (activeTab === 'review' && session) {
      fetchItems();
    }
  }, [activeTab, session, fetchItems]);

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
                      {isProcessing ? 'Processing...' : session.status === 'paused' ? 'Paused' : 'Complete'}
                    </div>
                    {progress?.currentActivity && (
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
                    - Switch to the <strong>Review</strong> tab to provide feedback on discovered items
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
                  // Determine border color based on feedback status
                  let borderColor = '#e5e7eb';
                  let bgColor = '#fff';
                  if (item.feedback?.isCorrect === true) {
                    borderColor = '#22c55e';
                    bgColor = '#f0fdf4';
                  } else if (item.feedback?.isCorrect === false) {
                    borderColor = '#ef4444';
                    bgColor = '#fef2f2';
                  }

                  return (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
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
                        </div>
                        {item.content.context && (
                          <p
                            style={{
                              fontSize: '0.75rem',
                              color: '#6b7280',
                              margin: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.content.context}
                          </p>
                        )}
                        <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                          {item.prediction.label} &bull; {item.prediction.confidence}% confidence
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
                          ) : (
                          <>
                            <button
                              onClick={() => submitFeedback(item.id, true)}
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
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#dcfce7'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                              title="Mark as correct"
                            >
                              <ThumbsUp style={{ width: '16px', height: '16px', color: '#22c55e' }} />
                            </button>
                            <button
                              onClick={() => submitFeedback(item.id, false)}
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
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                              title="Mark as incorrect"
                            >
                              <ThumbsDown style={{ width: '16px', height: '16px', color: '#ef4444' }} />
                            </button>
                            <button
                              onClick={() => openNoteDialog(item)}
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
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#dbeafe'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                              title="Add note"
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

      {/* Note Dialog */}
      {noteDialogOpen && selectedItem && (
        <>
          {/* Backdrop */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 50,
            }}
            onClick={() => setNoteDialogOpen(false)}
          />
          {/* Dialog */}
          <div
            style={{
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 51,
              width: '100%',
              maxWidth: '28rem',
              backgroundColor: '#fff',
              borderRadius: '12px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              padding: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111', margin: 0 }}>Add Feedback</h3>
              <button
                onClick={() => setNoteDialogOpen(false)}
                style={{
                  padding: '0.25rem',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  color: '#6b7280',
                }}
              >
                <X style={{ width: '20px', height: '20px' }} />
              </button>
            </div>

            {/* Item preview */}
            <div
              style={{
                padding: '0.75rem',
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                marginBottom: '1rem',
              }}
            >
              <p style={{ fontWeight: '500', fontSize: '0.875rem', color: '#111', margin: 0, marginBottom: '0.25rem' }}>
                {selectedItem.content.text}
              </p>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>
                {selectedItem.prediction.label}
              </p>
            </div>

            {/* Notes textarea */}
            <textarea
              placeholder="Add notes or corrections..."
              value={noteDialogText}
              onChange={(e) => setNoteDialogText(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                fontSize: '0.875rem',
                resize: 'vertical',
                marginBottom: '1rem',
                boxSizing: 'border-box',
              }}
            />

            {/* Feedback buttons */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button
                onClick={() => setNoteDialogFeedback(true)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: noteDialogFeedback === true ? '2px solid #22c55e' : '1px solid #e5e7eb',
                  backgroundColor: noteDialogFeedback === true ? '#f0fdf4' : '#fff',
                  color: noteDialogFeedback === true ? '#166534' : '#374151',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                <ThumbsUp style={{ width: '16px', height: '16px' }} />
                Correct
              </button>
              <button
                onClick={() => setNoteDialogFeedback(false)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: noteDialogFeedback === false ? '2px solid #ef4444' : '1px solid #e5e7eb',
                  backgroundColor: noteDialogFeedback === false ? '#fef2f2' : '#fff',
                  color: noteDialogFeedback === false ? '#991b1b' : '#374151',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                <ThumbsDown style={{ width: '16px', height: '16px' }} />
                Incorrect
              </button>
            </div>

            {/* Submit button */}
            <button
              onClick={submitNoteDialogFeedback}
              disabled={noteDialogFeedback === null}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: noteDialogFeedback === null ? '#e5e7eb' : '#3b82f6',
                color: noteDialogFeedback === null ? '#9ca3af' : '#fff',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: noteDialogFeedback === null ? 'not-allowed' : 'pointer',
              }}
            >
              Submit Feedback
            </button>
          </div>
        </>
      )}

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

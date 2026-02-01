/**
 * Discover Page
 * Entity and relationship discovery with training feedback mode
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/ui/toast';
import { useConfirmModal } from '@/components/ui/confirm-modal';
import { ThumbsUp, ThumbsDown, MessageSquare, X } from 'lucide-react';

// ============================================================
// Types
// ============================================================

type DiscoverMode = 'discovery' | 'training';

// Training types
type TrainingStatus = 'collecting' | 'training' | 'paused' | 'complete';
type TrainingMode = 'collect_feedback' | 'auto_train';
type SampleType = 'entity' | 'relationship' | 'classification';

const ALL_SAMPLE_TYPES: SampleType[] = ['entity', 'relationship', 'classification'];

interface TrainingSession {
  id: string;
  status: TrainingStatus;
  mode: TrainingMode;
  budget: {
    total: number;
    used: number;
    remaining: number;
  };
  progress: {
    samplesCollected: number;
    feedbackReceived: number;
    exceptionsCount: number;
    accuracy: number;
  };
  config: {
    sampleSize: number;
    autoTrainThreshold: number;
    sampleTypes: SampleType[];
  };
}

interface TrainingSample {
  id: string;
  type: SampleType;
  content: {
    text: string;
    context?: string;
  };
  prediction: {
    label: string;
    confidence: number;
    reasoning?: string;
  };
  status: 'pending' | 'reviewed' | 'skipped';
  feedbackStatus?: 'correct' | 'incorrect' | null;
}

interface TrainingException {
  id: string;
  type: string;
  item: {
    content: string;
    context?: string;
  };
  reason: string;
  severity: 'low' | 'medium' | 'high';
  status: 'pending' | 'reviewed' | 'dismissed';
  createdAt: string;
}

// ============================================================
// Constants
// ============================================================

const STATUS_COLORS: Record<TrainingStatus, { bg: string; text: string; border: string }> = {
  collecting: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  training: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  paused: { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' },
  complete: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
};

const BUDGET_OPTIONS = [
  { value: 5, label: '$5' },
  { value: 10, label: '$10' },
  { value: 25, label: '$25' },
  { value: 50, label: '$50' },
];

const SAMPLE_SIZE_OPTIONS = [
  { value: 50, label: '50 samples' },
  { value: 100, label: '100 samples' },
  { value: 250, label: '250 samples' },
  { value: 500, label: '500 samples' },
];

const DATE_RANGE_OPTIONS = [
  { value: 'last7days', label: 'Last 7 days' },
  { value: 'last30days', label: 'Last 30 days' },
  { value: 'last90days', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
];

// ============================================================
// Component
// ============================================================

export default function DiscoverPage() {
  const toast = useToast();
  const { showConfirmation } = useConfirmModal();

  // Mode state
  const [mode, setMode] = useState<DiscoverMode>('discovery');

  // ============================================================
  // Discovery State
  // ============================================================
  const [discoveryDateRange, setDiscoveryDateRange] = useState<string>('last30days');
  const [discoveryBudget, setDiscoveryBudget] = useState(10);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState<{
    success: boolean;
    entities?: number;
    relationships?: number;
    processed?: number;
    cost?: number;
    error?: string;
  } | null>(null);

  // ============================================================
  // Training State
  // ============================================================
  const [trainingSession, setTrainingSession] = useState<TrainingSession | null>(null);
  const [trainingLoading, setTrainingLoading] = useState(true);
  const [trainingError, setTrainingError] = useState('');

  // Samples list for feedback
  const [samples, setSamples] = useState<TrainingSample[]>([]);
  const [currentSample, setCurrentSample] = useState<TrainingSample | null>(null);
  const [pendingSamples, setPendingSamples] = useState(0);

  // Note dialog state
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [selectedSampleForNote, setSelectedSampleForNote] = useState<TrainingSample | null>(null);
  const [noteDialogFeedback, setNoteDialogFeedback] = useState<boolean | null>(null);
  const [noteDialogText, setNoteDialogText] = useState('');

  // Exceptions
  const [exceptions, setExceptions] = useState<TrainingException[]>([]);

  // Setup form
  const [setupBudget, setSetupBudget] = useState(5);
  const [setupSampleSize, setSetupSampleSize] = useState(100);
  const [setupMode, setSetupMode] = useState<TrainingMode>('collect_feedback');

  // Feedback form
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [correctedLabel, setCorrectedLabel] = useState('');

  // ============================================================
  // Discovery API Handlers
  // ============================================================

  const runDiscovery = useCallback(async () => {
    setIsDiscovering(true);
    setDiscoveryResult(null);

    try {
      // First, run entity extraction
      const entityRes = await fetch('/api/extraction/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          dateRange: discoveryDateRange,
          budget: discoveryBudget,
        }),
      });
      const entityData = await entityRes.json();

      if (!entityRes.ok) {
        throw new Error(entityData.error || 'Failed to extract entities');
      }

      // Then, run relationship extraction
      const relRes = await fetch('/api/extraction/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          dateRange: discoveryDateRange,
          limit: 100,
        }),
      });
      const relData = await relRes.json();

      setDiscoveryResult({
        success: true,
        entities: entityData.entities || 0,
        relationships: relData.relationships || 0,
        processed: entityData.processed || 0,
        cost: (entityData.cost || 0) + (relData.cost || 0),
      });
    } catch (err) {
      setDiscoveryResult({
        success: false,
        error: err instanceof Error ? err.message : 'Discovery failed',
      });
    } finally {
      setIsDiscovering(false);
    }
  }, [discoveryDateRange, discoveryBudget]);

  // ============================================================
  // Training API Handlers
  // ============================================================

  const fetchTrainingStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/train/status');
      const data = await res.json();

      if (data.success) {
        setTrainingSession(data.session);
        setPendingSamples(data.pendingSamples);
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
    } finally {
      setTrainingLoading(false);
    }
  }, []);

  const fetchSamples = useCallback(async () => {
    if (!trainingSession) return;

    try {
      const res = await fetch('/api/train/sample');
      const data = await res.json();

      if (data.success) {
        // If we get a single sample, add it to the list if not already present
        if (data.sample) {
          setSamples(prev => {
            const exists = prev.some(s => s.id === data.sample.id);
            if (exists) return prev;
            return [...prev, data.sample];
          });
          setCurrentSample(data.sample);
        }
        // If we get multiple samples
        if (data.samples) {
          setSamples(data.samples);
        }
      }
    } catch (err) {
      console.error('Failed to fetch samples:', err);
    }
  }, [trainingSession]);

  const fetchExceptions = useCallback(async () => {
    try {
      const res = await fetch('/api/train/exceptions?status=pending');
      const data = await res.json();

      if (data.success) {
        setExceptions(data.exceptions);
      }
    } catch (err) {
      console.error('Failed to fetch exceptions:', err);
    }
  }, []);

  useEffect(() => {
    if (mode === 'training') {
      fetchTrainingStatus();
    }
  }, [mode, fetchTrainingStatus]);

  useEffect(() => {
    if (trainingSession) {
      fetchSamples();
      fetchExceptions();
    }
  }, [trainingSession, fetchSamples, fetchExceptions]);

  // ============================================================
  // Training Action Handlers
  // ============================================================

  const handleStartTraining = async () => {
    setTrainingError('');
    setTrainingLoading(true);

    try {
      const res = await fetch('/api/train/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          budget: setupBudget,
          sampleSize: setupSampleSize,
          mode: setupMode,
          sampleTypes: ALL_SAMPLE_TYPES,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setTrainingSession(data.session);
        fetchSamples();
      } else {
        setTrainingError(data.error || 'Failed to start training');
      }
    } catch (err) {
      setTrainingError('Failed to start training');
    } finally {
      setTrainingLoading(false);
    }
  };

  const handleSubmitFeedback = async (sampleId: string, isCorrect: boolean, notes?: string) => {
    try {
      const res = await fetch('/api/train/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sampleId,
          action: 'feedback',
          isCorrect,
          correctedLabel: !isCorrect ? correctedLabel : undefined,
          notes: notes || feedbackNotes || undefined,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setFeedbackNotes('');
        setCorrectedLabel('');
        // Update the sample in the list to show feedback status
        setSamples(prev => prev.map(s =>
          s.id === sampleId
            ? { ...s, status: 'reviewed' as const, feedbackStatus: isCorrect ? 'correct' : 'incorrect' }
            : s
        ));
        fetchTrainingStatus();
      }
    } catch (err) {
      console.error('Failed to submit feedback:', err);
    }
  };

  // Quick feedback (thumbs up/down without dialog)
  const handleQuickFeedback = async (sampleId: string, isCorrect: boolean) => {
    await handleSubmitFeedback(sampleId, isCorrect);
  };

  // Open note dialog for a sample
  const openNoteDialog = (sample: TrainingSample) => {
    setSelectedSampleForNote(sample);
    setNoteDialogFeedback(null);
    setNoteDialogText('');
    setNoteDialogOpen(true);
  };

  // Submit feedback from note dialog
  const submitNoteDialogFeedback = async () => {
    if (!selectedSampleForNote || noteDialogFeedback === null) return;
    await handleSubmitFeedback(selectedSampleForNote.id, noteDialogFeedback, noteDialogText);
    setNoteDialogOpen(false);
    setSelectedSampleForNote(null);
    setNoteDialogText('');
    setNoteDialogFeedback(null);
  };

  const handleSkipSample = async (sampleId: string) => {
    try {
      const res = await fetch('/api/train/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sampleId,
          action: 'skip',
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSamples(prev => prev.map(s =>
          s.id === sampleId ? { ...s, status: 'skipped' as const } : s
        ));
      }
    } catch (err) {
      console.error('Failed to skip sample:', err);
    }
  };

  const handlePauseResume = async () => {
    if (!trainingSession) return;

    const action = trainingSession.status === 'paused' ? 'resume' : 'pause';

    try {
      const res = await fetch('/api/train/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();

      if (data.success) {
        setTrainingSession(data.session);
      }
    } catch (err) {
      console.error('Failed to pause/resume:', err);
    }
  };

  const handleCancelTraining = async () => {
    if (!trainingSession) return;

    const confirmed = await showConfirmation({
      title: 'Cancel Training?',
      message: 'Are you sure you want to cancel this training session? This cannot be undone.',
      confirmText: 'Cancel Training',
      cancelText: 'Keep Going',
      variant: 'destructive',
    });

    if (!confirmed) {
      return;
    }

    try {
      const res = await fetch('/api/train/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });

      const data = await res.json();

      if (data.success) {
        setTrainingSession(null);
        setCurrentSample(null);
        setSamples([]);
        setExceptions([]);
      }
    } catch (err) {
      console.error('Failed to cancel:', err);
    }
  };

  const handleDismissException = async (exceptionId: string) => {
    try {
      const res = await fetch('/api/train/exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exceptionId,
          status: 'dismissed',
        }),
      });

      const data = await res.json();

      if (data.success) {
        fetchExceptions();
        fetchTrainingStatus();
      }
    } catch (err) {
      console.error('Failed to dismiss exception:', err);
    }
  };

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
          Extract entities and relationships from your emails, and train Izzie with your feedback
        </p>
      </div>

      {/* Mode Toggle */}
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
          onClick={() => setMode('discovery')}
          style={{
            padding: '0.625rem 1.25rem',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: mode === 'discovery' ? '#fff' : 'transparent',
            color: mode === 'discovery' ? '#111' : '#6b7280',
            fontSize: '0.875rem',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: mode === 'discovery' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            transition: 'all 0.2s',
          }}
        >
          Discovery
        </button>
        <button
          onClick={() => setMode('training')}
          style={{
            padding: '0.625rem 1.25rem',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: mode === 'training' ? '#fff' : 'transparent',
            color: mode === 'training' ? '#111' : '#6b7280',
            fontSize: '0.875rem',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: mode === 'training' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            transition: 'all 0.2s',
          }}
        >
          Training
        </button>
      </div>

      {/* ============================================================ */}
      {/* Discovery Mode */}
      {/* ============================================================ */}
      {mode === 'discovery' && (
        <>
          {/* Discovery Form */}
          <div
            style={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '1.5rem',
              marginBottom: '1.5rem',
            }}
          >
            <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111', marginBottom: '1rem' }}>
              Extract Entities & Relationships
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
              Process emails to discover people, companies, topics, and their relationships.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
              {/* Date Range */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
                  Date Range
                </label>
                <select
                  value={discoveryDateRange}
                  onChange={(e) => setDiscoveryDateRange(e.target.value)}
                  disabled={isDiscovering}
                  style={{
                    width: '100%',
                    padding: '0.625rem',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    fontSize: '0.875rem',
                    backgroundColor: isDiscovering ? '#f3f4f6' : '#fff',
                  }}
                >
                  {DATE_RANGE_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Budget */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
                  Budget
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {BUDGET_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setDiscoveryBudget(value)}
                      disabled={isDiscovering}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: discoveryBudget === value ? '#8b5cf6' : '#f3f4f6',
                        color: discoveryBudget === value ? '#fff' : '#374151',
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        cursor: isDiscovering ? 'not-allowed' : 'pointer',
                        opacity: isDiscovering ? 0.5 : 1,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Start Discovery Button */}
            <button
              onClick={runDiscovery}
              disabled={isDiscovering}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: isDiscovering ? '#9ca3af' : '#8b5cf6',
                color: '#fff',
                padding: '0.875rem 1.5rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: isDiscovering ? 'not-allowed' : 'pointer',
              }}
            >
              {isDiscovering ? (
                <>
                  <span style={{ display: 'inline-block', width: '16px', height: '16px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  Discovering...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                  </svg>
                  Start Discovery
                </>
              )}
            </button>
          </div>

          {/* Discovery Result */}
          {discoveryResult && (
            <div
              style={{
                backgroundColor: discoveryResult.success ? '#f0fdf4' : '#fee2e2',
                border: `1px solid ${discoveryResult.success ? '#22c55e' : '#f87171'}`,
                borderRadius: '12px',
                padding: '1.5rem',
                marginBottom: '1.5rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  {discoveryResult.success ? (
                    <>
                      <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#15803d', marginBottom: '0.5rem' }}>
                        Discovery Complete!
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                        <div style={{ backgroundColor: '#fff', padding: '1rem', borderRadius: '8px' }}>
                          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#15803d' }}>{discoveryResult.entities}</div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Entities Found</div>
                        </div>
                        <div style={{ backgroundColor: '#fff', padding: '1rem', borderRadius: '8px' }}>
                          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#15803d' }}>{discoveryResult.relationships}</div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Relationships Found</div>
                        </div>
                        <div style={{ backgroundColor: '#fff', padding: '1rem', borderRadius: '8px' }}>
                          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#15803d' }}>{discoveryResult.processed}</div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Emails Processed</div>
                        </div>
                        <div style={{ backgroundColor: '#fff', padding: '1rem', borderRadius: '8px' }}>
                          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#15803d' }}>${discoveryResult.cost?.toFixed(4)}</div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Total Cost</div>
                        </div>
                      </div>
                      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
                        <Link
                          href="/dashboard/entities"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.5rem 1rem',
                            backgroundColor: '#15803d',
                            color: '#fff',
                            borderRadius: '6px',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            textDecoration: 'none',
                          }}
                        >
                          View Entities
                        </Link>
                        <Link
                          href="/dashboard/relationships"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.5rem 1rem',
                            backgroundColor: '#fff',
                            color: '#15803d',
                            border: '1px solid #15803d',
                            borderRadius: '6px',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            textDecoration: 'none',
                          }}
                        >
                          View Relationships
                        </Link>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#dc2626', marginBottom: '0.5rem' }}>
                        Discovery Failed
                      </h3>
                      <p style={{ fontSize: '0.875rem', color: '#7f1d1d' }}>{discoveryResult.error}</p>
                    </>
                  )}
                </div>
                <button
                  onClick={() => setDiscoveryResult(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: discoveryResult.success ? '#15803d' : '#dc2626', fontSize: '1.5rem', padding: '0.25rem' }}
                >
                  x
                </button>
              </div>
            </div>
          )}

          {/* Discovery Info */}
          <div
            style={{
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '12px',
              padding: '1.5rem',
            }}
          >
            <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#1e40af', marginBottom: '0.75rem' }}>
              How Discovery Works
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ fontSize: '0.875rem', color: '#1e40af', marginBottom: '0.75rem', paddingLeft: '1.5rem', position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, fontWeight: '600' }}>1.</span>
                <strong>Select a date range</strong> - Choose which emails to process
              </li>
              <li style={{ fontSize: '0.875rem', color: '#1e40af', marginBottom: '0.75rem', paddingLeft: '1.5rem', position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, fontWeight: '600' }}>2.</span>
                <strong>Set a budget</strong> - Control API costs for extraction
              </li>
              <li style={{ fontSize: '0.875rem', color: '#1e40af', marginBottom: '0.75rem', paddingLeft: '1.5rem', position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, fontWeight: '600' }}>3.</span>
                <strong>Start discovery</strong> - AI extracts entities (people, companies, topics) and relationships
              </li>
              <li style={{ fontSize: '0.875rem', color: '#1e40af', paddingLeft: '1.5rem', position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, fontWeight: '600' }}>4.</span>
                <strong>Review results</strong> - Browse entities and relationships, then train Izzie with feedback
              </li>
            </ul>
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/* Training Mode */}
      {/* ============================================================ */}
      {mode === 'training' && (
        <>
          {trainingLoading && (
            <div style={{ textAlign: 'center', padding: '4rem', color: '#6b7280' }}>
              Loading...
            </div>
          )}

          {/* No Active Session - Setup Form */}
          {!trainingLoading && !trainingSession && (
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '2rem',
              }}
            >
              <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#111', marginBottom: '1.5rem' }}>
                Start a Training Session
              </h2>

              {trainingError && (
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
                  {trainingError}
                </div>
              )}

              {/* Sample Size Selection */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>
                  Sample Size
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {SAMPLE_SIZE_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setSetupSampleSize(value)}
                      style={{
                        padding: '0.625rem 1rem',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: setupSampleSize === value ? '#10b981' : '#f3f4f6',
                        color: setupSampleSize === value ? '#fff' : '#374151',
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
              </div>

              {/* Budget Selection */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>
                  Training Budget
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {BUDGET_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setSetupBudget(value)}
                      style={{
                        padding: '0.625rem 1rem',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: setupBudget === value ? '#10b981' : '#f3f4f6',
                        color: setupBudget === value ? '#fff' : '#374151',
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
                  Determines how many API calls can be made for predictions
                </p>
              </div>

              {/* Training Mode */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>
                  Feedback Mode
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setSetupMode('collect_feedback')}
                    style={{
                      padding: '0.625rem 1rem',
                      borderRadius: '8px',
                      border: `2px solid ${setupMode === 'collect_feedback' ? '#10b981' : '#e5e7eb'}`,
                      backgroundColor: setupMode === 'collect_feedback' ? '#ecfdf5' : '#fff',
                      color: setupMode === 'collect_feedback' ? '#065f46' : '#374151',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Collect Feedback
                  </button>
                  <button
                    onClick={() => setSetupMode('auto_train')}
                    style={{
                      padding: '0.625rem 1rem',
                      borderRadius: '8px',
                      border: `2px solid ${setupMode === 'auto_train' ? '#10b981' : '#e5e7eb'}`,
                      backgroundColor: setupMode === 'auto_train' ? '#ecfdf5' : '#fff',
                      color: setupMode === 'auto_train' ? '#065f46' : '#374151',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Auto-Train
                  </button>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
                  {setupMode === 'collect_feedback'
                    ? 'Review samples one by one and provide feedback'
                    : 'Use feedback to automatically improve, flag exceptions for review'}
                </p>
              </div>

              {/* Sample Types Info */}
              <div
                style={{
                  marginBottom: '1.5rem',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #86efac',
                  borderRadius: '8px',
                  padding: '1rem',
                }}
              >
                <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#065f46', marginBottom: '0.5rem' }}>
                  Training Includes All Types
                </div>
                <p style={{ fontSize: '0.75rem', color: '#166534', margin: 0 }}>
                  Training samples include entities, relationships, and classifications for comprehensive model improvement.
                </p>
              </div>

              {/* Start Button */}
              <button
                onClick={handleStartTraining}
                style={{
                  width: '100%',
                  backgroundColor: '#10b981',
                  color: '#fff',
                  padding: '1rem 1.5rem',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Start Training Session
              </button>
            </div>
          )}

          {/* Active Training Session */}
          {!trainingLoading && trainingSession && (
            <>
              {/* Session Status Bar */}
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
                    <span
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '9999px',
                        backgroundColor: STATUS_COLORS[trainingSession.status].bg,
                        color: STATUS_COLORS[trainingSession.status].text,
                        border: `1px solid ${STATUS_COLORS[trainingSession.status].border}`,
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        textTransform: 'capitalize',
                      }}
                    >
                      {trainingSession.status}
                    </span>
                    <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      {trainingSession.mode === 'collect_feedback' ? 'Collect Feedback' : 'Auto-Train'} Mode
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={handlePauseResume}
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: trainingSession.status === 'paused' ? '#10b981' : '#f59e0b',
                        color: '#fff',
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                      }}
                    >
                      {trainingSession.status === 'paused' ? 'Resume' : 'Pause'}
                    </button>
                    <button
                      onClick={handleCancelTraining}
                      style={{
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
                      Cancel
                    </button>
                  </div>
                </div>
              </div>

              {/* Progress and Stats Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1rem',
                  marginBottom: '1.5rem',
                }}
              >
                {/* Budget Meter */}
                <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>Budget</h3>
                  <div style={{ backgroundColor: '#e5e7eb', borderRadius: '4px', height: '8px', marginBottom: '0.75rem', overflow: 'hidden' }}>
                    <div
                      style={{
                        backgroundColor: trainingSession.budget.remaining < trainingSession.budget.total * 0.2 ? '#ef4444' : '#10b981',
                        width: `${((trainingSession.budget.total - trainingSession.budget.used) / trainingSession.budget.total) * 100}%`,
                        height: '100%',
                        borderRadius: '4px',
                        transition: 'width 0.3s ease-in-out',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6b7280' }}>
                    <span>Used: ${(trainingSession.budget.used / 100).toFixed(2)}</span>
                    <span>Remaining: ${(trainingSession.budget.remaining / 100).toFixed(2)}</span>
                  </div>
                </div>

                {/* Progress Tracker */}
                <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>Progress</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                    <div>
                      <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111' }}>{trainingSession.progress.feedbackReceived}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Reviewed</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111' }}>{pendingSamples}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Pending</div>
                    </div>
                  </div>
                </div>

                {/* Accuracy Meter */}
                <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>Accuracy</h3>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: '700', color: trainingSession.progress.accuracy >= 80 ? '#10b981' : trainingSession.progress.accuracy >= 60 ? '#f59e0b' : '#ef4444' }}>
                      {trainingSession.progress.accuracy.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Based on {trainingSession.progress.feedbackReceived} reviews</div>
                  </div>
                </div>

                {/* Exceptions Count */}
                <div style={{ backgroundColor: exceptions.length > 0 ? '#fef2f2' : '#fff', border: `1px solid ${exceptions.length > 0 ? '#fca5a5' : '#e5e7eb'}`, borderRadius: '12px', padding: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>Exceptions</h3>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: '700', color: exceptions.length > 0 ? '#ef4444' : '#10b981' }}>{exceptions.length}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Needing review</div>
                  </div>
                </div>
              </div>

              {/* Samples List View */}
              {trainingSession.status === 'collecting' && (
                <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111' }}>Review Samples</h3>
                    <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      {samples.filter(s => s.status === 'pending').length} pending
                    </span>
                  </div>

                  {samples.length > 0 ? (
                    <div style={{ maxHeight: '60vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {samples.map((sample) => {
                        // Determine border color based on feedback status
                        let borderColor = '#e5e7eb'; // default gray
                        let bgColor = '#fff';
                        if (sample.feedbackStatus === 'correct') {
                          borderColor = '#22c55e';
                          bgColor = '#f0fdf4';
                        } else if (sample.feedbackStatus === 'incorrect') {
                          borderColor = '#ef4444';
                          bgColor = '#fef2f2';
                        } else if (sample.status === 'skipped') {
                          borderColor = '#9ca3af';
                          bgColor = '#f9fafb';
                        }

                        return (
                          <div
                            key={sample.id}
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
                                    backgroundColor: '#dbeafe',
                                    color: '#1e40af',
                                    fontWeight: '500',
                                    textTransform: 'capitalize',
                                  }}
                                >
                                  {sample.type}
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
                                  {sample.content.text}
                                </span>
                              </div>
                              {sample.content.context && (
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
                                  {sample.content.context}
                                </p>
                              )}
                              <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                                {sample.prediction.label} &bull; {sample.prediction.confidence}% confidence
                              </div>
                            </div>

                            {/* Right: Actions */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginLeft: '1rem', flexShrink: 0 }}>
                              {sample.status === 'pending' ? (
                                <>
                                  <button
                                    onClick={() => handleQuickFeedback(sample.id, true)}
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
                                    onClick={() => handleQuickFeedback(sample.id, false)}
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
                                    onClick={() => openNoteDialog(sample)}
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
                                    title="Add note and feedback"
                                  >
                                    <MessageSquare style={{ width: '16px', height: '16px', color: '#3b82f6' }} />
                                  </button>
                                </>
                              ) : (
                                <span
                                  style={{
                                    fontSize: '0.75rem',
                                    fontWeight: '500',
                                    color: sample.feedbackStatus === 'correct' ? '#22c55e' : sample.feedbackStatus === 'incorrect' ? '#ef4444' : '#9ca3af',
                                    textTransform: 'capitalize',
                                  }}
                                >
                                  {sample.feedbackStatus || sample.status}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                      <p style={{ fontSize: '0.875rem', margin: 0 }}>No samples to review. Check back later or generate more samples.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Note Dialog */}
              {noteDialogOpen && selectedSampleForNote && (
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

                    {/* Sample preview */}
                    <div
                      style={{
                        padding: '0.75rem',
                        backgroundColor: '#f9fafb',
                        borderRadius: '8px',
                        marginBottom: '1rem',
                      }}
                    >
                      <p style={{ fontWeight: '500', fontSize: '0.875rem', color: '#111', margin: 0, marginBottom: '0.25rem' }}>
                        {selectedSampleForNote.content.text}
                      </p>
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>
                        {selectedSampleForNote.prediction.label}
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

              {/* Exceptions List */}
              {exceptions.length > 0 && (
                <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111', marginBottom: '1rem' }}>Exceptions Queue</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {exceptions.map((exception) => (
                      <div
                        key={exception.id}
                        style={{
                          backgroundColor: exception.severity === 'high' ? '#fef2f2' : exception.severity === 'medium' ? '#fffbeb' : '#f0fdf4',
                          border: `1px solid ${exception.severity === 'high' ? '#fca5a5' : exception.severity === 'medium' ? '#fcd34d' : '#86efac'}`,
                          borderRadius: '8px',
                          padding: '1rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                              <span style={{ padding: '0.125rem 0.5rem', borderRadius: '4px', backgroundColor: exception.severity === 'high' ? '#ef4444' : exception.severity === 'medium' ? '#f59e0b' : '#10b981', color: '#fff', fontSize: '0.625rem', fontWeight: '600', textTransform: 'uppercase' }}>
                                {exception.severity}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{exception.type.replace(/_/g, ' ')}</span>
                            </div>
                            <div style={{ fontSize: '0.875rem', color: '#111', marginBottom: '0.25rem' }}>{exception.item.content}</div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{exception.reason}</div>
                          </div>
                          <button onClick={() => handleDismissException(exception.id)} style={{ padding: '0.375rem 0.75rem', borderRadius: '6px', border: 'none', backgroundColor: '#f3f4f6', color: '#374151', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}>
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Training Info Section */}
          {!trainingLoading && !trainingSession && (
            <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '1.5rem', marginTop: '2rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#1e40af', marginBottom: '0.75rem' }}>How Training Works</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                <li style={{ fontSize: '0.875rem', color: '#1e40af', marginBottom: '0.75rem', paddingLeft: '1.5rem', position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, fontWeight: '600' }}>1.</span>
                  <strong>Start a session</strong> - Training includes entities, relationships, and classifications
                </li>
                <li style={{ fontSize: '0.875rem', color: '#1e40af', marginBottom: '0.75rem', paddingLeft: '1.5rem', position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, fontWeight: '600' }}>2.</span>
                  <strong>Provide feedback</strong> - Mark predictions as correct or incorrect with optional corrections
                </li>
                <li style={{ fontSize: '0.875rem', color: '#1e40af', marginBottom: '0.75rem', paddingLeft: '1.5rem', position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, fontWeight: '600' }}>3.</span>
                  <strong>Review exceptions</strong> - Handle edge cases and low-confidence predictions
                </li>
                <li style={{ fontSize: '0.875rem', color: '#1e40af', paddingLeft: '1.5rem', position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, fontWeight: '600' }}>4.</span>
                  <strong>Track progress</strong> - Watch accuracy improve as Izzie learns from your feedback
                </li>
              </ul>
            </div>
          )}
        </>
      )}

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

/**
 * Train Izzie Page
 * ML training dashboard with human-in-the-loop feedback collection
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

// ============================================================
// Types
// ============================================================

type TrainingStatus = 'collecting' | 'training' | 'paused' | 'complete';
type TrainingMode = 'collect_feedback' | 'auto_train';
type SampleType = 'entity' | 'relationship' | 'classification';

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

interface TrainingStats {
  totalSamples: number;
  reviewedSamples: number;
  correctPredictions: number;
  accuracy: number;
  costUsed: number;
  exceptionsCount: number;
  byType: Record<SampleType, {
    total: number;
    reviewed: number;
    accuracy: number;
  }>;
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

// ============================================================
// Component
// ============================================================

export default function TrainPage() {
  // Session state
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Current sample for feedback
  const [currentSample, setCurrentSample] = useState<TrainingSample | null>(null);
  const [pendingSamples, setPendingSamples] = useState(0);

  // Exceptions
  const [exceptions, setExceptions] = useState<TrainingException[]>([]);

  // Setup form
  const [setupBudget, setSetupBudget] = useState(5);
  const [setupSampleSize, setSetupSampleSize] = useState(100);
  const [setupMode, setSetupMode] = useState<TrainingMode>('collect_feedback');
  const [setupSampleTypes, setSetupSampleTypes] = useState<SampleType[]>(['entity']);

  // Feedback form
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [correctedLabel, setCorrectedLabel] = useState('');

  // ============================================================
  // API Handlers
  // ============================================================

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/train/status');
      const data = await res.json();

      if (data.success) {
        setSession(data.session);
        setStats(data.stats);
        setPendingSamples(data.pendingSamples);
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchNextSample = useCallback(async () => {
    if (!session) return;

    try {
      const res = await fetch('/api/train/sample');
      const data = await res.json();

      if (data.success) {
        setCurrentSample(data.sample);
      }
    } catch (err) {
      console.error('Failed to fetch sample:', err);
    }
  }, [session]);

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
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (session) {
      fetchNextSample();
      fetchExceptions();
    }
  }, [session, fetchNextSample, fetchExceptions]);

  // ============================================================
  // Action Handlers
  // ============================================================

  const handleStartTraining = async () => {
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/train/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          budget: setupBudget,
          sampleSize: setupSampleSize,
          mode: setupMode,
          sampleTypes: setupSampleTypes,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSession(data.session);
        fetchNextSample();
      } else {
        setError(data.error || 'Failed to start training');
      }
    } catch (err) {
      setError('Failed to start training');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitFeedback = async (isCorrect: boolean) => {
    if (!currentSample) return;

    try {
      const res = await fetch('/api/train/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sampleId: currentSample.id,
          action: 'feedback',
          isCorrect,
          correctedLabel: !isCorrect ? correctedLabel : undefined,
          notes: feedbackNotes || undefined,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setFeedbackNotes('');
        setCorrectedLabel('');
        fetchNextSample();
        fetchStatus();
      }
    } catch (err) {
      console.error('Failed to submit feedback:', err);
    }
  };

  const handleSkipSample = async () => {
    if (!currentSample) return;

    try {
      const res = await fetch('/api/train/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sampleId: currentSample.id,
          action: 'skip',
        }),
      });

      const data = await res.json();

      if (data.success) {
        fetchNextSample();
      }
    } catch (err) {
      console.error('Failed to skip sample:', err);
    }
  };

  const handlePauseResume = async () => {
    if (!session) return;

    const action = session.status === 'paused' ? 'resume' : 'pause';

    try {
      const res = await fetch('/api/train/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();

      if (data.success) {
        setSession(data.session);
      }
    } catch (err) {
      console.error('Failed to pause/resume:', err);
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
        fetchStatus();
      }
    } catch (err) {
      console.error('Failed to dismiss exception:', err);
    }
  };

  const toggleSampleType = (type: SampleType) => {
    setSetupSampleTypes((prev) => {
      if (prev.includes(type)) {
        return prev.filter((t) => t !== type);
      }
      return [...prev, type];
    });
  };

  // ============================================================
  // Render
  // ============================================================

  if (loading) {
    return (
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem' }}>
        <div style={{ textAlign: 'center', padding: '4rem', color: '#6b7280' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: '700', color: '#111', marginBottom: '0.5rem' }}>
          Train Izzie
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          Help Izzie learn by reviewing predictions and providing feedback
        </p>
      </div>

      {/* No Active Session - Setup Form */}
      {!session && (
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
              Training Mode
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

          {/* Sample Types */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>
              Sample Types
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {(['entity', 'relationship', 'classification'] as SampleType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => toggleSampleType(type)}
                  style={{
                    padding: '0.625rem 1rem',
                    borderRadius: '8px',
                    border: `2px solid ${setupSampleTypes.includes(type) ? '#10b981' : '#e5e7eb'}`,
                    backgroundColor: setupSampleTypes.includes(type) ? '#ecfdf5' : '#fff',
                    color: setupSampleTypes.includes(type) ? '#065f46' : '#374151',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Start Button */}
          <button
            onClick={handleStartTraining}
            disabled={setupSampleTypes.length === 0}
            style={{
              width: '100%',
              backgroundColor: setupSampleTypes.length === 0 ? '#d1d5db' : '#10b981',
              color: '#fff',
              padding: '1rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: setupSampleTypes.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Start Training Session
          </button>
        </div>
      )}

      {/* Active Session */}
      {session && (
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
                    backgroundColor: STATUS_COLORS[session.status].bg,
                    color: STATUS_COLORS[session.status].text,
                    border: `1px solid ${STATUS_COLORS[session.status].border}`,
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    textTransform: 'capitalize',
                  }}
                >
                  {session.status}
                </span>
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  {session.mode === 'collect_feedback' ? 'Collect Feedback' : 'Auto-Train'} Mode
                </span>
              </div>
              <button
                onClick={handlePauseResume}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: session.status === 'paused' ? '#10b981' : '#f59e0b',
                  color: '#fff',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                {session.status === 'paused' ? 'Resume' : 'Pause'}
              </button>
            </div>
          </div>

          {/* Progress and Stats Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            {/* Budget Meter */}
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '1.5rem',
              }}
            >
              <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
                Budget
              </h3>
              <div
                style={{
                  backgroundColor: '#e5e7eb',
                  borderRadius: '4px',
                  height: '8px',
                  marginBottom: '0.75rem',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    backgroundColor: session.budget.remaining < session.budget.total * 0.2 ? '#ef4444' : '#10b981',
                    width: `${((session.budget.total - session.budget.used) / session.budget.total) * 100}%`,
                    height: '100%',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease-in-out',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6b7280' }}>
                <span>Used: ${(session.budget.used / 100).toFixed(2)}</span>
                <span>Remaining: ${(session.budget.remaining / 100).toFixed(2)}</span>
              </div>
            </div>

            {/* Progress Tracker */}
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '1.5rem',
              }}
            >
              <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
                Progress
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                <div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111' }}>
                    {session.progress.feedbackReceived}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Reviewed</div>
                </div>
                <div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111' }}>
                    {pendingSamples}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Pending</div>
                </div>
              </div>
            </div>

            {/* Accuracy Meter */}
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '1.5rem',
              }}
            >
              <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
                Accuracy
              </h3>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: session.progress.accuracy >= 80 ? '#10b981' : session.progress.accuracy >= 60 ? '#f59e0b' : '#ef4444' }}>
                  {session.progress.accuracy.toFixed(1)}%
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  Based on {session.progress.feedbackReceived} reviews
                </div>
              </div>
            </div>

            {/* Exceptions Count */}
            <div
              style={{
                backgroundColor: exceptions.length > 0 ? '#fef2f2' : '#fff',
                border: `1px solid ${exceptions.length > 0 ? '#fca5a5' : '#e5e7eb'}`,
                borderRadius: '12px',
                padding: '1.5rem',
              }}
            >
              <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
                Exceptions
              </h3>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: exceptions.length > 0 ? '#ef4444' : '#10b981' }}>
                  {exceptions.length}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  Needing review
                </div>
              </div>
            </div>
          </div>

          {/* Sample Feedback Card */}
          {currentSample && session.status === 'collecting' && (
            <div
              style={{
                backgroundColor: '#fff',
                border: '2px solid #10b981',
                borderRadius: '12px',
                padding: '1.5rem',
                marginBottom: '1.5rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111' }}>
                  Review Prediction
                </h3>
                <span
                  style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '9999px',
                    backgroundColor: '#f3f4f6',
                    color: '#374151',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    textTransform: 'capitalize',
                  }}
                >
                  {currentSample.type}
                </span>
              </div>

              {/* Sample Content */}
              <div
                style={{
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ fontSize: '0.875rem', color: '#111', marginBottom: '0.5rem' }}>
                  {currentSample.content.text}
                </div>
                {currentSample.content.context && (
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic' }}>
                    Context: {currentSample.content.context}
                  </div>
                )}
              </div>

              {/* Prediction */}
              <div
                style={{
                  backgroundColor: '#ecfdf5',
                  border: '1px solid #6ee7b7',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#065f46' }}>
                    Predicted Label
                  </span>
                  <span
                    style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      backgroundColor: currentSample.prediction.confidence >= 80 ? '#d1fae5' : currentSample.prediction.confidence >= 60 ? '#fef3c7' : '#fee2e2',
                      color: currentSample.prediction.confidence >= 80 ? '#065f46' : currentSample.prediction.confidence >= 60 ? '#92400e' : '#991b1b',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                    }}
                  >
                    {currentSample.prediction.confidence}% confident
                  </span>
                </div>
                <div style={{ fontSize: '1rem', fontWeight: '600', color: '#111' }}>
                  {currentSample.prediction.label}
                </div>
                {currentSample.prediction.reasoning && (
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
                    {currentSample.prediction.reasoning}
                  </div>
                )}
              </div>

              {/* Correction Input (shows when marking incorrect) */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
                  Correct label (if prediction is wrong)
                </label>
                <input
                  type="text"
                  value={correctedLabel}
                  onChange={(e) => setCorrectedLabel(e.target.value)}
                  placeholder="Enter correct label..."
                  style={{
                    width: '100%',
                    padding: '0.625rem',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              {/* Notes Input */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
                  Notes (optional)
                </label>
                <textarea
                  value={feedbackNotes}
                  onChange={(e) => setFeedbackNotes(e.target.value)}
                  placeholder="Add any notes about this sample..."
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '0.625rem',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    fontSize: '0.875rem',
                    resize: 'vertical',
                  }}
                />
              </div>

              {/* Feedback Buttons */}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={() => handleSubmitFeedback(true)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    backgroundColor: '#10b981',
                    color: '#fff',
                    padding: '0.875rem 1.5rem',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '1.25rem' }}>&#x1F44D;</span>
                  Correct
                </button>
                <button
                  onClick={() => handleSubmitFeedback(false)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    backgroundColor: '#ef4444',
                    color: '#fff',
                    padding: '0.875rem 1.5rem',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '1.25rem' }}>&#x1F44E;</span>
                  Incorrect
                </button>
                <button
                  onClick={handleSkipSample}
                  style={{
                    padding: '0.875rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#fff',
                    color: '#6b7280',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  Skip
                </button>
              </div>
            </div>
          )}

          {/* No More Samples */}
          {!currentSample && session.status === 'collecting' && (
            <div
              style={{
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '2rem',
                textAlign: 'center',
                marginBottom: '1.5rem',
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>&#x1F389;</div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111', marginBottom: '0.5rem' }}>
                All caught up!
              </h3>
              <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                No more samples to review. Check back later or generate more samples.
              </p>
            </div>
          )}

          {/* Exceptions List */}
          {exceptions.length > 0 && (
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '1.5rem',
              }}
            >
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111', marginBottom: '1rem' }}>
                Exceptions Queue
              </h3>
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
                          <span
                            style={{
                              padding: '0.125rem 0.5rem',
                              borderRadius: '4px',
                              backgroundColor: exception.severity === 'high' ? '#ef4444' : exception.severity === 'medium' ? '#f59e0b' : '#10b981',
                              color: '#fff',
                              fontSize: '0.625rem',
                              fontWeight: '600',
                              textTransform: 'uppercase',
                            }}
                          >
                            {exception.severity}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            {exception.type.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#111', marginBottom: '0.25rem' }}>
                          {exception.item.content}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          {exception.reason}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDismissException(exception.id)}
                        style={{
                          padding: '0.375rem 0.75rem',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: '#f3f4f6',
                          color: '#374151',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                        }}
                      >
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

      {/* Info Section */}
      <div
        style={{
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '12px',
          padding: '1.5rem',
          marginTop: '2rem',
        }}
      >
        <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#1e40af', marginBottom: '0.75rem' }}>
          How Training Works
        </h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <li style={{ fontSize: '0.875rem', color: '#1e40af', marginBottom: '0.75rem', paddingLeft: '1.5rem', position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0, fontWeight: '600' }}>1.</span>
            <strong>Select samples</strong> - Choose how many entities and relationships to review
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
    </div>
  );
}

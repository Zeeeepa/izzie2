/**
 * Extraction Dashboard Page
 * Dedicated page for Entity and Relationship Extraction
 *
 * Entity Extraction: Extract entities (people, companies, etc.) from emails
 * Relationship Extraction: Extract relationships between existing entities
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

// ============================================================
// Types
// ============================================================

type DateRange = '7d' | '30d' | '90d' | 'all';
type RelationshipDateRange = 'last7days' | 'last30days' | 'last90days' | 'all';
type ExtractionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';
type ExtractionSource = 'email' | 'calendar' | 'drive';

interface SourceProgress {
  id: string;
  source: ExtractionSource;
  status: ExtractionStatus;
  totalItems: number;
  processedItems: number;
  failedItems: number;
  entitiesExtracted: number;
  progressPercentage: number;
  oldestDateExtracted?: string;
  newestDateExtracted?: string;
  lastRunAt?: string;
  totalCost?: number;
  processingRate?: number;
  estimatedSecondsRemaining?: number;
}

interface RelationshipStatus {
  available: boolean;
  totalExtractedEmails: number;
  message: string;
}

interface RelationshipResult {
  success: boolean;
  processed?: number;
  failed?: number;
  relationships?: number;
  cost?: number;
  processingTimeMs?: number;
  message?: string;
  error?: string;
  details?: string;
}

// ============================================================
// Constants
// ============================================================

const SOURCE_LABELS: Record<ExtractionSource, string> = {
  email: 'Email',
  calendar: 'Calendar',
  drive: 'Google Drive',
};

const SOURCE_ICONS: Record<ExtractionSource, string> = {
  email: 'mail',
  calendar: 'calendar',
  drive: 'folder',
};

const STATUS_COLORS: Record<ExtractionStatus, { bg: string; text: string; border: string }> = {
  idle: { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' },
  running: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  paused: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  completed: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
  error: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
};

// ============================================================
// Helpers
// ============================================================

function formatEta(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
}

// ============================================================
// Component
// ============================================================

export default function ExtractionPage() {
  // Entity Extraction State
  const [entityStatus, setEntityStatus] = useState('');
  const [sources, setSources] = useState({
    email: true,
    calendar: false,
    drive: false,
  });
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [progress, setProgress] = useState<SourceProgress[]>([]);
  const [loadingEntity, setLoadingEntity] = useState(true);

  // Relationship Extraction State
  const [relStatus, setRelStatus] = useState<RelationshipStatus | null>(null);
  const [relDateRange, setRelDateRange] = useState<RelationshipDateRange>('last30days');
  const [relResult, setRelResult] = useState<RelationshipResult | null>(null);
  const [relLoading, setRelLoading] = useState(false);
  const [relStatusLoading, setRelStatusLoading] = useState(true);

  const toggleSource = (source: ExtractionSource) => {
    setSources((prev) => ({ ...prev, [source]: !prev[source] }));
  };

  // ============================================================
  // Entity Extraction Handlers
  // ============================================================

  const fetchEntityStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/extraction/status');
      const data = await res.json();
      if (data.success && data.progress) {
        setProgress(data.progress);
      }
    } catch (error) {
      console.error('Failed to fetch entity status:', error);
    } finally {
      setLoadingEntity(false);
    }
  }, []);

  useEffect(() => {
    fetchEntityStatus();
    const interval = setInterval(() => {
      if (progress.some((p) => p.status === 'running')) {
        fetchEntityStatus();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchEntityStatus, progress]);

  const getSourceProgress = (source: ExtractionSource): SourceProgress | undefined => {
    return progress.find((p) => p.source === source);
  };

  const isAnySourceRunning = progress.some((p) => p.status === 'running');

  const handleStartEntity = async () => {
    setEntityStatus('');
    try {
      const selectedSources = Object.entries(sources)
        .filter(([_, enabled]) => enabled)
        .map(([source]) => source);

      if (selectedSources.length === 0) {
        setEntityStatus('Please select at least one source');
        return;
      }

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const source of selectedSources) {
        try {
          const res = await fetch('/api/extraction/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source, dateRange }),
          });
          const data = await res.json();
          if (data.success) {
            successCount++;
          } else {
            errorCount++;
            errors.push(`${source}: ${data.error}`);
          }
        } catch (error) {
          errorCount++;
          errors.push(`${source}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      if (successCount > 0 && errorCount === 0) {
        setEntityStatus(`Extraction started for ${successCount} source(s)`);
      } else if (successCount > 0 && errorCount > 0) {
        setEntityStatus(`Started ${successCount} source(s), ${errorCount} failed: ${errors.join(', ')}`);
      } else {
        setEntityStatus(`Failed to start extraction: ${errors.join(', ')}`);
      }

      fetchEntityStatus();
    } catch (error) {
      setEntityStatus('Failed to start extraction');
      console.error('Start error:', error);
    }
  };

  const handlePauseEntity = async () => {
    try {
      const res = await fetch('/api/extraction/pause', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setEntityStatus('Extraction paused');
        fetchEntityStatus();
      } else {
        setEntityStatus(`Error: ${data.error}`);
      }
    } catch (error) {
      setEntityStatus('Failed to pause extraction');
      console.error('Pause error:', error);
    }
  };

  const handleResetEntity = async (source: ExtractionSource) => {
    if (!confirm(`Are you sure you want to reset ${SOURCE_LABELS[source]} extraction progress? This will clear the error state.`)) {
      return;
    }

    try {
      const res = await fetch('/api/extraction/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, clearEntities: false }),
      });
      const data = await res.json();
      if (data.success) {
        setEntityStatus(`${SOURCE_LABELS[source]} extraction reset`);
        fetchEntityStatus();
      } else {
        setEntityStatus(`Error: ${data.error}`);
      }
    } catch (error) {
      setEntityStatus('Failed to reset extraction');
      console.error('Reset error:', error);
    }
  };

  // ============================================================
  // Relationship Extraction Handlers
  // ============================================================

  const fetchRelStatus = useCallback(async () => {
    setRelStatusLoading(true);
    try {
      const res = await fetch('/api/extraction/relationships');
      const data = await res.json();
      setRelStatus(data);
    } catch (error) {
      console.error('Failed to fetch relationship status:', error);
      setRelStatus({ available: false, totalExtractedEmails: 0, message: 'Failed to fetch status' });
    } finally {
      setRelStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRelStatus();
  }, [fetchRelStatus]);

  const handleStartRelationships = async () => {
    setRelLoading(true);
    setRelResult(null);

    try {
      const res = await fetch('/api/extraction/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateRange: relDateRange,
          limit: 100,
        }),
      });

      const data: RelationshipResult = await res.json();
      setRelResult(data);

      // Refresh status after completion
      fetchRelStatus();
    } catch (error) {
      setRelResult({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to run relationship extraction',
      });
    } finally {
      setRelLoading(false);
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
          Data Extraction
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          Extract entities and relationships from your emails
        </p>
      </div>

      {/* ============================================================ */}
      {/* Entity Extraction Section */}
      {/* ============================================================ */}
      <div
        style={{
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '2rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#111', marginBottom: '0.25rem' }}>
              Entity Extraction
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              Extract people, companies, projects, and more from your emails
            </p>
          </div>
          <div
            style={{
              backgroundColor: '#eff6ff',
              color: '#1e40af',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              fontSize: '0.75rem',
              fontWeight: '600',
            }}
          >
            Indigo
          </div>
        </div>

        {/* Progress Bars */}
        {loadingEntity ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>Loading status...</div>
        ) : (
          <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {(['email', 'calendar', 'drive'] as const).map((source) => {
              const sourceProgress = getSourceProgress(source);
              const percentage = sourceProgress?.progressPercentage || 0;
              const statusInfo = sourceProgress ? STATUS_COLORS[sourceProgress.status] : STATUS_COLORS.idle;
              const isError = sourceProgress?.status === 'error';

              return (
                <div
                  key={source}
                  style={{
                    border: `1px solid ${isError ? '#fca5a5' : '#e5e7eb'}`,
                    borderRadius: '8px',
                    padding: '1rem',
                    backgroundColor: isError ? '#fef2f2' : '#fff',
                  }}
                >
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.25rem' }}>
                        {source === 'email' ? 'envelope' : source === 'calendar' ? 'calendar' : 'folder'}
                      </span>
                      <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111' }}>
                        {SOURCE_LABELS[source]}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '9999px',
                          backgroundColor: statusInfo.bg,
                          color: statusInfo.text,
                          border: `1px solid ${statusInfo.border}`,
                          textTransform: 'capitalize',
                        }}
                      >
                        {sourceProgress?.status || 'idle'}
                      </span>
                      {isError && (
                        <button
                          onClick={() => handleResetEntity(source)}
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: '500',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                            backgroundColor: '#ef4444',
                            color: '#fff',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div
                    style={{
                      backgroundColor: '#e5e7eb',
                      borderRadius: '4px',
                      height: '8px',
                      marginBottom: '0.5rem',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        backgroundColor: isError ? '#ef4444' : '#6366f1',
                        width: `${percentage}%`,
                        height: '100%',
                        borderRadius: '4px',
                        transition: 'width 0.3s ease-in-out',
                      }}
                    />
                  </div>

                  {/* Stats */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', color: '#6b7280' }}>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      <span>Progress: {percentage}%</span>
                      {sourceProgress && (
                        <>
                          <span>Items: {sourceProgress.processedItems}/{sourceProgress.totalItems}</span>
                          <span>Entities: {sourceProgress.entitiesExtracted}</span>
                          {sourceProgress.failedItems > 0 && (
                            <span style={{ color: '#dc2626' }}>Failed: {sourceProgress.failedItems}</span>
                          )}
                        </>
                      )}
                    </div>
                    {sourceProgress?.status === 'running' && sourceProgress.processingRate && sourceProgress.processingRate > 0 && (
                      <div style={{ display: 'flex', gap: '1rem', color: '#1e40af', fontWeight: '500' }}>
                        <span>Rate: {sourceProgress.processingRate.toFixed(1)} items/sec</span>
                        {sourceProgress.estimatedSecondsRemaining && sourceProgress.estimatedSecondsRemaining > 0 && (
                          <span>ETA: ~{formatEta(sourceProgress.estimatedSecondsRemaining)}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Source Selection */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>
            Select Sources
          </label>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {(['email', 'calendar', 'drive'] as const).map((source) => (
              <button
                key={source}
                onClick={() => toggleSource(source)}
                disabled={isAnySourceRunning}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem 1rem',
                  borderRadius: '8px',
                  border: `2px solid ${sources[source] ? '#6366f1' : '#e5e7eb'}`,
                  backgroundColor: sources[source] ? '#eef2ff' : '#fff',
                  color: sources[source] ? '#4f46e5' : '#6b7280',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: isAnySourceRunning ? 'not-allowed' : 'pointer',
                  opacity: isAnySourceRunning ? 0.5 : 1,
                  transition: 'all 0.2s',
                }}
              >
                <span style={{ fontSize: '1.125rem' }}>{sources[source] ? '[ ]' : '[ ]'}</span>
                <span style={{ textTransform: 'capitalize' }}>{source}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Date Range Selection */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>
            Date Range
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {([
              { value: '7d' as const, label: 'Last 7 days' },
              { value: '30d' as const, label: 'Last 30 days' },
              { value: '90d' as const, label: 'Last 90 days' },
              { value: 'all' as const, label: 'All time' },
            ]).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setDateRange(value)}
                disabled={isAnySourceRunning}
                style={{
                  padding: '0.625rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: dateRange === value ? '#6366f1' : '#f3f4f6',
                  color: dateRange === value ? '#fff' : '#374151',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: isAnySourceRunning ? 'not-allowed' : 'pointer',
                  opacity: isAnySourceRunning ? 0.5 : 1,
                  transition: 'all 0.2s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Control Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
          {isAnySourceRunning ? (
            <button
              onClick={handlePauseEntity}
              style={{
                flex: 1,
                backgroundColor: '#f59e0b',
                color: '#fff',
                padding: '0.875rem 1.5rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Pause
            </button>
          ) : (
            <button
              onClick={handleStartEntity}
              style={{
                flex: 1,
                backgroundColor: '#6366f1',
                color: '#fff',
                padding: '0.875rem 1.5rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              {progress.some((p) => p.status === 'paused') ? 'Resume' : 'Start Extraction'}
            </button>
          )}
        </div>

        {/* Status Message */}
        {entityStatus && (
          <p
            style={{
              fontSize: '0.875rem',
              color: entityStatus.startsWith('Error') || entityStatus.startsWith('Failed') ? '#dc2626' : '#16a34a',
              fontWeight: '500',
              textAlign: 'center',
            }}
          >
            {entityStatus}
          </p>
        )}
      </div>

      {/* ============================================================ */}
      {/* Relationship Extraction Section */}
      {/* ============================================================ */}
      <div
        style={{
          backgroundColor: '#fff',
          border: '2px solid #a855f7',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '2rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#111', marginBottom: '0.25rem' }}>
              Relationship Extraction
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              Extract relationships between existing entities from emails
            </p>
          </div>
          <div
            style={{
              backgroundColor: '#f3e8ff',
              color: '#7c3aed',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              fontSize: '0.75rem',
              fontWeight: '600',
            }}
          >
            Purple
          </div>
        </div>

        {/* Status Info */}
        {relStatusLoading ? (
          <div style={{ textAlign: 'center', padding: '1rem', color: '#6b7280' }}>Loading status...</div>
        ) : relStatus ? (
          <div
            style={{
              backgroundColor: relStatus.available && relStatus.totalExtractedEmails > 0 ? '#f3e8ff' : '#f9fafb',
              border: `1px solid ${relStatus.available && relStatus.totalExtractedEmails > 0 ? '#d8b4fe' : '#e5e7eb'}`,
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: relStatus.totalExtractedEmails > 0 ? '#a855f7' : '#9ca3af',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: '700',
                  fontSize: '1.125rem',
                }}
              >
                {relStatus.totalExtractedEmails}
              </div>
              <div>
                <p style={{ fontWeight: '600', color: '#111', marginBottom: '0.25rem' }}>
                  {relStatus.totalExtractedEmails > 0
                    ? `${relStatus.totalExtractedEmails} emails available`
                    : 'No emails available'}
                </p>
                <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  {relStatus.message}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Date Range Selection */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>
            Date Range
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {([
              { value: 'last7days' as const, label: 'Last 7 days' },
              { value: 'last30days' as const, label: 'Last 30 days' },
              { value: 'last90days' as const, label: 'Last 90 days' },
              { value: 'all' as const, label: 'All time' },
            ]).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setRelDateRange(value)}
                disabled={relLoading}
                style={{
                  padding: '0.625rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: relDateRange === value ? '#a855f7' : '#f3f4f6',
                  color: relDateRange === value ? '#fff' : '#374151',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: relLoading ? 'not-allowed' : 'pointer',
                  opacity: relLoading ? 0.5 : 1,
                  transition: 'all 0.2s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Start Button */}
        <button
          onClick={handleStartRelationships}
          disabled={relLoading || !relStatus?.available || relStatus?.totalExtractedEmails === 0}
          style={{
            width: '100%',
            backgroundColor: relLoading
              ? '#9ca3af'
              : !relStatus?.available || relStatus?.totalExtractedEmails === 0
              ? '#e5e7eb'
              : '#a855f7',
            color: relLoading || !relStatus?.available || relStatus?.totalExtractedEmails === 0 ? '#6b7280' : '#fff',
            padding: '0.875rem 1.5rem',
            borderRadius: '8px',
            border: 'none',
            fontSize: '0.875rem',
            fontWeight: '600',
            cursor: relLoading || !relStatus?.available || relStatus?.totalExtractedEmails === 0 ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          {relLoading ? (
            <>
              <span
                style={{
                  display: 'inline-block',
                  width: '16px',
                  height: '16px',
                  border: '2px solid #fff',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              />
              Extracting Relationships...
            </>
          ) : (
            'Start Relationship Extraction'
          )}
        </button>

        {/* Help Text */}
        {(!relStatus?.available || relStatus?.totalExtractedEmails === 0) && !relLoading && (
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.75rem', textAlign: 'center' }}>
            Run Entity Extraction first to get emails with entities
          </p>
        )}

        {/* Result Message */}
        {relResult && (
          <div
            style={{
              marginTop: '1rem',
              backgroundColor: relResult.success ? '#f0fdf4' : '#fee2e2',
              border: `1px solid ${relResult.success ? '#22c55e' : '#f87171'}`,
              borderRadius: '8px',
              padding: '1rem',
            }}
          >
            {relResult.success ? (
              <div>
                <p style={{ color: '#15803d', fontWeight: '600', marginBottom: '0.5rem' }}>
                  Extraction Complete!
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.875rem', color: '#166534' }}>
                  <span>Processed: {relResult.processed} emails</span>
                  <span>Relationships: {relResult.relationships}</span>
                  {relResult.failed !== undefined && relResult.failed > 0 && (
                    <span style={{ color: '#dc2626' }}>Failed: {relResult.failed}</span>
                  )}
                  <span>Cost: ${relResult.cost?.toFixed(4) || '0.0000'}</span>
                </div>
                {relResult.message && (
                  <p style={{ fontSize: '0.75rem', color: '#166534', marginTop: '0.5rem' }}>{relResult.message}</p>
                )}
              </div>
            ) : (
              <div>
                <p style={{ color: '#dc2626', fontWeight: '600', marginBottom: '0.25rem' }}>Extraction Failed</p>
                <p style={{ color: '#7f1d1d', fontSize: '0.875rem' }}>
                  {relResult.error || relResult.details || 'Unknown error'}
                </p>
              </div>
            )}
            <button
              onClick={() => setRelResult(null)}
              style={{
                marginTop: '0.75rem',
                fontSize: '0.75rem',
                color: relResult.success ? '#15803d' : '#dc2626',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Info Section */}
      <div
        style={{
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '12px',
          padding: '1.5rem',
        }}
      >
        <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#1e40af', marginBottom: '0.75rem' }}>
          How It Works
        </h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <li style={{ fontSize: '0.875rem', color: '#1e40af', marginBottom: '0.75rem', paddingLeft: '1.5rem', position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0, fontWeight: '600' }}>1.</span>
            <strong>Entity Extraction</strong> scans your emails to identify people, companies, projects, and other entities
          </li>
          <li style={{ fontSize: '0.875rem', color: '#1e40af', marginBottom: '0.75rem', paddingLeft: '1.5rem', position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0, fontWeight: '600' }}>2.</span>
            <strong>Relationship Extraction</strong> analyzes emails with extracted entities to find connections between them
          </li>
          <li style={{ fontSize: '0.875rem', color: '#1e40af', paddingLeft: '1.5rem', position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0, fontWeight: '600' }}>3.</span>
            View your knowledge graph on the <a href="/dashboard/relationships" style={{ color: '#2563eb', textDecoration: 'underline' }}>Relationships</a> page
          </li>
        </ul>
      </div>

      {/* CSS for spinner animation */}
      <style jsx global>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Google Chat Sync Dashboard Page
 * UI for syncing Google Chat spaces and messages
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================
// Types
// ============================================================

interface SyncedSpace {
  name: string;
  displayName: string;
  type: string;
  messageCount: number;
}

interface SyncStatus {
  isRunning: boolean;
  spacesProcessed: number;
  messagesProcessed: number;
  totalSpaces: number;
  currentSpace?: string;
  lastSync?: string;
  error?: string;
  startedAt?: string;
}

interface SyncResponse {
  status: SyncStatus;
  spaces: SyncedSpace[];
}

// ============================================================
// Component
// ============================================================

export default function ChatSyncPage() {
  const [status, setStatus] = useState<SyncStatus>({
    isRunning: false,
    spacesProcessed: 0,
    messagesProcessed: 0,
    totalSpaces: 0,
  });
  const [spaces, setSpaces] = useState<SyncedSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch initial status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/chat-sync');
      const data: SyncResponse = await res.json();
      setStatus(data.status);
      setSpaces(data.spaces || []);
    } catch (err) {
      console.error('Failed to fetch status:', err);
      setError('Failed to fetch sync status');
    } finally {
      setLoading(false);
    }
  }, []);

  // Connect to SSE for real-time progress
  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource('/api/chat-sync?stream=true');
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data: SyncResponse = JSON.parse(event.data);
        setStatus(data.status);
        if (data.spaces) {
          setSpaces(data.spaces);
        }
      } catch (err) {
        console.error('Failed to parse SSE data:', err);
      }
    };

    eventSource.onerror = () => {
      console.error('SSE connection error');
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, []);

  // Initial load
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Connect SSE when sync is running
  useEffect(() => {
    if (status.isRunning && !eventSourceRef.current) {
      connectSSE();
    } else if (!status.isRunning && eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [status.isRunning, connectSSE]);

  // Start sync
  const handleStartSync = async () => {
    setStarting(true);
    setError(null);

    try {
      const res = await fetch('/api/chat-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxMessagesPerSpace: 500 }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start sync');
      }

      const data = await res.json();
      setStatus(data.status);

      // Connect SSE for progress updates
      connectSSE();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start sync');
    } finally {
      setStarting(false);
    }
  };

  // Calculate progress percentage
  const progressPercentage =
    status.totalSpaces > 0
      ? Math.round((status.spacesProcessed / status.totalSpaces) * 100)
      : 0;

  // Format date
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  // Get space type display name
  const getSpaceTypeLabel = (type: string) => {
    switch (type) {
      case 'SPACE':
        return 'Space';
      case 'GROUP_CHAT':
        return 'Group Chat';
      case 'DIRECT_MESSAGE':
        return 'DM';
      default:
        return type;
    }
  };

  return (
    <div style={{ maxWidth: '1024px', margin: '0 auto', padding: '2rem' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: '700', color: '#111', marginBottom: '0.5rem' }}>
          Google Chat Sync
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          Sync your Google Chat spaces and messages to extract contacts and relationships
        </p>
      </div>

      {/* Status Card */}
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
          <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111' }}>
            Sync Status
          </h2>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: '600',
              padding: '0.25rem 0.75rem',
              borderRadius: '9999px',
              backgroundColor: status.isRunning ? '#dbeafe' : status.error ? '#fee2e2' : '#d1fae5',
              color: status.isRunning ? '#1e40af' : status.error ? '#991b1b' : '#065f46',
            }}
          >
            {status.isRunning ? 'Running' : status.error ? 'Error' : 'Idle'}
          </span>
        </div>

        {/* Progress Bar (when running) */}
        {status.isRunning && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                {status.currentSpace ? `Processing: ${status.currentSpace}` : 'Starting...'}
              </span>
              <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1e40af' }}>
                {progressPercentage}%
              </span>
            </div>
            <div
              style={{
                backgroundColor: '#e5e7eb',
                borderRadius: '4px',
                height: '8px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  backgroundColor: '#3b82f6',
                  width: `${progressPercentage}%`,
                  height: '100%',
                  borderRadius: '4px',
                  transition: 'width 0.3s ease-in-out',
                }}
              />
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Spaces Synced</p>
            <p style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111' }}>
              {status.spacesProcessed}
              {status.isRunning && status.totalSpaces > 0 && (
                <span style={{ fontSize: '0.875rem', fontWeight: '400', color: '#6b7280' }}>
                  {' '}/ {status.totalSpaces}
                </span>
              )}
            </p>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Messages Processed</p>
            <p style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111' }}>{status.messagesProcessed}</p>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Last Sync</p>
            <p style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111' }}>{formatDate(status.lastSync)}</p>
          </div>
        </div>

        {/* Error Message */}
        {status.error && (
          <div
            style={{
              backgroundColor: '#fee2e2',
              border: '1px solid #fca5a5',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1rem',
            }}
          >
            <p style={{ fontSize: '0.875rem', color: '#991b1b', fontWeight: '600' }}>Error</p>
            <p style={{ fontSize: '0.875rem', color: '#7f1d1d' }}>{status.error}</p>
          </div>
        )}

        {error && (
          <div
            style={{
              backgroundColor: '#fee2e2',
              border: '1px solid #fca5a5',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1rem',
            }}
          >
            <p style={{ fontSize: '0.875rem', color: '#991b1b' }}>{error}</p>
          </div>
        )}

        {/* Start Button */}
        <button
          onClick={handleStartSync}
          disabled={status.isRunning || starting}
          style={{
            width: '100%',
            backgroundColor: status.isRunning || starting ? '#9ca3af' : '#3b82f6',
            color: '#fff',
            padding: '0.875rem 1.5rem',
            borderRadius: '8px',
            border: 'none',
            fontSize: '0.875rem',
            fontWeight: '600',
            cursor: status.isRunning || starting ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          {status.isRunning ? (
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
              Syncing...
            </>
          ) : starting ? (
            'Starting...'
          ) : (
            'Start Sync'
          )}
        </button>
      </div>

      {/* Synced Spaces List */}
      {spaces.length > 0 && (
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
            Synced Spaces ({spaces.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {spaces.map((space) => (
              <div
                key={space.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span
                    style={{
                      fontSize: '0.625rem',
                      fontWeight: '600',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      backgroundColor:
                        space.type === 'DIRECT_MESSAGE'
                          ? '#dbeafe'
                          : space.type === 'GROUP_CHAT'
                          ? '#fef3c7'
                          : '#d1fae5',
                      color:
                        space.type === 'DIRECT_MESSAGE'
                          ? '#1e40af'
                          : space.type === 'GROUP_CHAT'
                          ? '#92400e'
                          : '#065f46',
                    }}
                  >
                    {getSpaceTypeLabel(space.type)}
                  </span>
                  <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#111' }}>
                    {space.displayName}
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  {space.messageCount} messages
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && spaces.length === 0 && !status.isRunning && (
        <div
          style={{
            backgroundColor: '#f9fafb',
            border: '1px dashed #d1d5db',
            borderRadius: '12px',
            padding: '3rem',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: '1rem', color: '#6b7280', marginBottom: '0.5rem' }}>No spaces synced yet</p>
          <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
            Click "Start Sync" to sync your Google Chat spaces and messages
          </p>
        </div>
      )}

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
          About Google Chat Sync
        </h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.875rem', color: '#1e40af' }}>
          <li style={{ marginBottom: '0.5rem', paddingLeft: '1.5rem', position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0 }}>-</span>
            Syncs all your Google Chat spaces (rooms, group chats, and DMs)
          </li>
          <li style={{ marginBottom: '0.5rem', paddingLeft: '1.5rem', position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0 }}>-</span>
            Extracts contact information from message participants
          </li>
          <li style={{ marginBottom: '0.5rem', paddingLeft: '1.5rem', position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0 }}>-</span>
            Requires Google Chat API access (may need re-authentication)
          </li>
          <li style={{ paddingLeft: '1.5rem', position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0 }}>-</span>
            Syncs up to 500 messages per space by default
          </li>
        </ul>
      </div>

      {/* Loading State */}
      {loading && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <span
              style={{
                display: 'inline-block',
                width: '32px',
                height: '32px',
                border: '3px solid #e5e7eb',
                borderTopColor: '#3b82f6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <p style={{ marginTop: '1rem', color: '#6b7280' }}>Loading...</p>
          </div>
        </div>
      )}

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

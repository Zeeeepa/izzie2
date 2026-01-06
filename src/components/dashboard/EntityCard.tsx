/**
 * Entity Card Component
 * Displays an individual entity with metadata and source information
 */

'use client';

interface EntityCardProps {
  entity: {
    id: string;
    type: string;
    value: string;
    normalized: string;
    confidence: number;
    source: string;
    context?: string;
    assignee?: string;
    deadline?: string;
    priority?: string;
    emailId: string;
    emailContent: string;
    emailSummary?: string;
    createdAt: Date;
  };
}

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  person: { bg: '#eff6ff', text: '#1e40af', border: '#3b82f6' },
  company: { bg: '#f0fdf4', text: '#15803d', border: '#22c55e' },
  project: { bg: '#fef3c7', text: '#92400e', border: '#fbbf24' },
  action_item: { bg: '#fee2e2', text: '#991b1b', border: '#ef4444' },
  topic: { bg: '#f3e8ff', text: '#6b21a8', border: '#a855f7' },
  location: { bg: '#fce7f3', text: '#9f1239', border: '#ec4899' },
  date: { bg: '#f1f5f9', text: '#334155', border: '#64748b' },
  url: { bg: '#ecfdf5', text: '#065f46', border: '#10b981' },
  time: { bg: '#fef2f2', text: '#7f1d1d', border: '#f87171' },
};

const PRIORITY_COLORS: Record<string, string> = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#ef4444',
};

export function EntityCard({ entity }: EntityCardProps) {
  const colors = TYPE_COLORS[entity.type] || {
    bg: '#f3f4f6',
    text: '#374151',
    border: '#9ca3af',
  };

  const confidencePercent = Math.round(entity.confidence * 100);

  return (
    <div
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: '8px',
        padding: '1rem',
        backgroundColor: '#fff',
        transition: 'box-shadow 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Header with entity name and type badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111', margin: 0 }}>
          {entity.value}
        </h3>
        <span
          style={{
            backgroundColor: colors.bg,
            color: colors.text,
            padding: '0.25rem 0.75rem',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: '600',
            textTransform: 'uppercase',
          }}
        >
          {entity.type.replace('_', ' ')}
        </span>
      </div>

      {/* Normalized name if different */}
      {entity.normalized !== entity.value && (
        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Normalized: <strong>{entity.normalized}</strong>
          </span>
        </div>
      )}

      {/* Metadata grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.125rem' }}>Confidence</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              style={{
                flex: 1,
                height: '4px',
                backgroundColor: '#e5e7eb',
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${confidencePercent}%`,
                  height: '100%',
                  backgroundColor: confidencePercent > 80 ? '#10b981' : confidencePercent > 60 ? '#f59e0b' : '#ef4444',
                }}
              />
            </div>
            <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111', minWidth: '40px' }}>
              {confidencePercent}%
            </span>
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.125rem' }}>Source</div>
          <div style={{ fontSize: '0.875rem', color: '#374151', fontWeight: '500' }}>
            {entity.source}
          </div>
        </div>
      </div>

      {/* Action item specific fields */}
      {entity.type === 'action_item' && (
        <div style={{ marginBottom: '0.75rem', padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
            {entity.priority && (
              <div>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.125rem' }}>Priority</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: PRIORITY_COLORS[entity.priority] || '#9ca3af',
                    }}
                  />
                  <span style={{ fontSize: '0.875rem', color: '#374151', fontWeight: '500', textTransform: 'capitalize' }}>
                    {entity.priority}
                  </span>
                </div>
              </div>
            )}
            {entity.assignee && (
              <div>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.125rem' }}>Assignee</div>
                <div style={{ fontSize: '0.875rem', color: '#374151', fontWeight: '500' }}>
                  {entity.assignee}
                </div>
              </div>
            )}
            {entity.deadline && (
              <div>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.125rem' }}>Deadline</div>
                <div style={{ fontSize: '0.875rem', color: '#374151', fontWeight: '500' }}>
                  {entity.deadline}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Context */}
      {entity.context && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.25rem' }}>Context</div>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', fontStyle: 'italic', margin: 0, lineHeight: '1.5' }}>
            "{entity.context}"
          </p>
        </div>
      )}

      {/* Source email info */}
      <div
        style={{
          borderTop: '1px solid #e5e7eb',
          paddingTop: '0.75rem',
          marginTop: '0.75rem',
        }}
      >
        <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.25rem' }}>From Email</div>
        {entity.emailSummary && (
          <p style={{ fontSize: '0.875rem', color: '#374151', margin: '0 0 0.5rem 0', fontWeight: '500' }}>
            {entity.emailSummary}
          </p>
        )}
        <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0, lineHeight: '1.5' }}>
          {entity.emailContent}
        </p>
        <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
            ID: {entity.emailId.substring(0, 8)}...
          </span>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
            {new Date(entity.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  );
}

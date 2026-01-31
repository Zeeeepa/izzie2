/**
 * Onboarding Test Harness UI
 *
 * Client-side JavaScript for the onboarding test harness.
 * Handles SSE events, UI updates, and API calls.
 */

// DOM Elements
const authStatus = document.getElementById('authStatus');
const stateValue = document.getElementById('stateValue');
const dayValue = document.getElementById('dayValue');
const emailsValue = document.getElementById('emailsValue');
const entitiesValue = document.getElementById('entitiesValue');
const relationshipsValue = document.getElementById('relationshipsValue');
const progressValue = document.getElementById('progressValue');
const progressFill = document.getElementById('progressFill');
const emailList = document.getElementById('emailList');
const emailCount = document.getElementById('emailCount');
const relationshipList = document.getElementById('relationshipList');
const relationshipCount = document.getElementById('relationshipCount');
const errorToast = document.getElementById('errorToast');
const configSection = document.getElementById('configSection');

// Buttons
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const stopBtn = document.getElementById('stopBtn');
const flushBtn = document.getElementById('flushBtn');

// Config inputs
const batchSizeInput = document.getElementById('batchSize');
const maxEmailsPerDayInput = document.getElementById('maxEmailsPerDay');
const startDateInput = document.getElementById('startDate');
const endDateInput = document.getElementById('endDate');

// State
let currentState = 'idle';
let isAuthenticated = false;
let userEmail = '';
let userName = '';
let eventSource = null;
let processedEmails = [];
let entities = new Map(); // Track unique entities
let relationships = new Map();
let syncingContacts = false;
let syncingTasks = false;
let syncedEntities = new Map(); // Track contact sync status per entity
let syncedTasks = new Map(); // Track task sync status per entity
let feedbackState = new Map(); // Track feedback state per entity/relationship
let topicOntology = new Map(); // Track topic hierarchy

// Modal elements
const inspectModal = document.getElementById('inspectModal');
const modalTitle = document.getElementById('modalTitle');
const modalFields = document.getElementById('modalFields');
const modalJson = document.getElementById('modalJson');

// Feedback modal elements
const feedbackModal = document.getElementById('feedbackModal');
const feedbackModalTitle = document.getElementById('feedbackModalTitle');
const feedbackItemPreview = document.getElementById('feedbackItemPreview');
const feedbackNoteInput = document.getElementById('feedbackNoteInput');
const feedbackNoteLabel = document.getElementById('feedbackNoteLabel');

// Pending feedback state (used when modal is open)
let pendingFeedback = null;

/**
 * Open inspection modal
 */
function openModal(title, fields, data) {
  modalTitle.textContent = title;
  modalFields.innerHTML = fields.map(f => `
    <div class="modal-field">
      <span class="label">${f.label}:</span>
      <span class="value">${escapeHtml(String(f.value))}</span>
    </div>
  `).join('');
  modalJson.textContent = JSON.stringify(data, null, 2);
  inspectModal.style.display = 'flex';
}

/**
 * Close inspection modal
 */
function closeModal() {
  inspectModal.style.display = 'none';
}

/**
 * Open feedback modal
 */
function openFeedbackModal(type, itemData, feedback) {
  pendingFeedback = { type, itemData, feedback };

  // Set modal title based on feedback type
  const feedbackEmoji = feedback === 'positive' ? '👍' : '👎';
  feedbackModalTitle.textContent = `${feedbackEmoji} Feedback`;

  // Set label based on positive/negative
  feedbackNoteLabel.textContent = feedback === 'positive'
    ? 'Any additional notes? (optional)'
    : 'Why is this incorrect? (optional)';

  // Build preview content
  if (type === 'entity') {
    const entity = itemData;
    feedbackItemPreview.innerHTML = `
      <div class="preview-type">Entity</div>
      <div class="preview-value">${escapeHtml(entity.value)} (${entity.type})</div>
      <div class="preview-feedback ${feedback}">${feedbackEmoji} ${feedback}</div>
    `;
  } else {
    const rel = itemData;
    feedbackItemPreview.innerHTML = `
      <div class="preview-type">Relationship</div>
      <div class="preview-value">${escapeHtml(rel.fromValue)} → ${rel.relationshipType} → ${escapeHtml(rel.toValue)}</div>
      <div class="preview-feedback ${feedback}">${feedbackEmoji} ${feedback}</div>
    `;
  }

  // Clear previous note
  feedbackNoteInput.value = '';

  // Show modal
  feedbackModal.style.display = 'flex';

  // Focus the input
  setTimeout(() => feedbackNoteInput.focus(), 100);
}

/**
 * Close feedback modal
 */
function closeFeedbackModal() {
  feedbackModal.style.display = 'none';
  pendingFeedback = null;
}

/**
 * Confirm feedback submission
 */
async function confirmFeedback() {
  if (!pendingFeedback) return;

  const { type, itemData, feedback } = pendingFeedback;
  const correction = feedbackNoteInput.value.trim() || undefined;

  // Close modal immediately
  closeFeedbackModal();

  // Submit the feedback
  if (type === 'entity') {
    await doSubmitEntityFeedback(itemData, feedback, correction);
  } else {
    await doSubmitRelationshipFeedback(itemData, feedback, correction);
  }
}

// Close modal on backdrop click
inspectModal?.addEventListener('click', (e) => {
  if (e.target === inspectModal) closeModal();
});

// Close feedback modal on backdrop click
feedbackModal?.addEventListener('click', (e) => {
  if (e.target === feedbackModal) closeFeedbackModal();
});

// Close modal on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    closeFeedbackModal();
  }
});

// Submit feedback on Enter in the textarea (with Ctrl/Cmd)
feedbackNoteInput?.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    confirmFeedback();
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Set default dates
  const today = new Date();
  const oneYearAgo = new Date(today);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  endDateInput.value = today.toISOString().split('T')[0];
  startDateInput.value = oneYearAgo.toISOString().split('T')[0];

  // Check auth and URL params
  checkUrlParams();
  checkAuthStatus();

  // Setup event listeners
  setupEventListeners();

  // Connect SSE
  connectSSE();
});

/**
 * Check URL parameters for auth status
 */
function checkUrlParams() {
  const params = new URLSearchParams(window.location.search);

  if (params.get('auth') === 'success') {
    const email = params.get('email');
    if (email) {
      showToast(`Logged in as ${email}`, 'success');
    }
    // Clean up URL
    window.history.replaceState({}, '', '/');
  }

  if (params.get('error')) {
    showToast(`OAuth error: ${params.get('error')}`, 'error');
    window.history.replaceState({}, '', '/');
  }
}

/**
 * Check authentication status
 */
async function checkAuthStatus() {
  try {
    const response = await fetch('/oauth/status');
    const data = await response.json();

    isAuthenticated = data.authenticated;
    userEmail = data.email || '';
    userName = data.name || '';

    updateAuthUI();
    updateButtonStates();
  } catch (error) {
    console.error('Failed to check auth status:', error);
    authStatus.innerHTML = `
      <span style="color: var(--accent-red);">Auth check failed</span>
      <button class="btn-primary" onclick="window.location.href='/oauth/login'">Login</button>
    `;
  }
}

/**
 * Update authentication UI
 */
function updateAuthUI() {
  if (isAuthenticated) {
    authStatus.innerHTML = `
      <div class="user-info">
        <span>${userEmail}</span>
      </div>
      <button class="btn-secondary" onclick="logout()">Logout</button>
    `;
  } else {
    authStatus.innerHTML = `
      <span style="color: var(--text-muted);">Not logged in</span>
      <button class="btn-primary" onclick="window.location.href='/oauth/login'">Login with Google</button>
    `;
  }
}

/**
 * Logout
 */
async function logout() {
  try {
    await fetch('/oauth/logout', { method: 'POST' });
    isAuthenticated = false;
    userEmail = '';
    userName = '';
    updateAuthUI();
    updateButtonStates();
    showToast('Logged out successfully', 'success');
  } catch (error) {
    console.error('Logout failed:', error);
    showToast('Logout failed', 'error');
  }
}

/**
 * Setup button event listeners
 */
function setupEventListeners() {
  startBtn.addEventListener('click', startProcessing);
  pauseBtn.addEventListener('click', pauseProcessing);
  resumeBtn.addEventListener('click', resumeProcessing);
  stopBtn.addEventListener('click', stopProcessing);
  flushBtn.addEventListener('click', flushData);
}

/**
 * Connect to SSE endpoint
 */
function connectSSE() {
  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource('/api/events');

  eventSource.onopen = () => {
    console.log('SSE connected');
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleSSEEvent(data);
    } catch (error) {
      console.error('Failed to parse SSE event:', error);
    }
  };

  eventSource.onerror = (error) => {
    console.error('SSE error:', error);
    setTimeout(connectSSE, 5000);
  };
}

/**
 * Handle SSE events
 */
function handleSSEEvent(data) {
  switch (data.type) {
    case 'connected':
      console.log('SSE connected');
      break;

    case 'ping':
      // Keep-alive, ignore
      break;

    case 'state_change':
      handleStateChange(data);
      break;

    case 'progress':
      handleProgress(data);
      break;

    case 'email':
      handleEmailProcessed(data);
      break;

    case 'relationship':
      handleRelationship(data);
      break;

    case 'error':
      showToast(data.message, 'error');
      break;

    case 'complete':
      handleComplete(data);
      break;

    case 'contact_sync':
      handleContactSync(data);
      break;

    case 'task_sync':
      handleTaskSync(data);
      break;

    case 'feedback':
      handleFeedbackEvent(data);
      break;

    default:
      console.log('Unknown SSE event:', data);
  }
}

/**
 * Handle state change event
 */
function handleStateChange(data) {
  currentState = data.newState;
  stateValue.textContent = currentState;
  stateValue.className = `value state-${currentState}`;
  updateButtonStates();

  // Show/hide config section based on state
  configSection.style.display = currentState === 'idle' ? 'block' : 'none';
}

/**
 * Handle progress update
 */
function handleProgress(data) {
  currentState = data.state;
  stateValue.textContent = currentState;
  stateValue.className = `value state-${currentState}`;

  dayValue.textContent = data.currentDay || '-';
  emailsValue.textContent = data.emailsProcessed;
  entitiesValue.textContent = data.entitiesFound;
  relationshipsValue.textContent = data.relationshipsFound;

  const progress = data.totalBatches > 0
    ? Math.round((data.currentBatch / data.totalBatches) * 100)
    : 0;
  progressValue.textContent = `${progress}%`;
  progressFill.style.width = `${progress}%`;

  updateButtonStates();
}

/**
 * Handle email processed event
 */
function handleEmailProcessed(data) {
  processedEmails.unshift(data);

  // Keep only last 100 emails in UI
  if (processedEmails.length > 100) {
    processedEmails.pop();
  }

  // Track unique entities
  if (data.entities) {
    for (const entity of data.entities) {
      const key = `${entity.type}:${entity.value}`;
      const existing = entities.get(key);
      if (existing) {
        existing.count++;
        existing.sources.push(data.email.subject);
      } else {
        entities.set(key, {
          ...entity,
          count: 1,
          sources: [data.email.subject],
          sourceEmail: data.email
        });

        // Auto-add topics to ontology for hierarchy detection
        if (entity.type === 'topic' && !topicOntology.has(entity.value)) {
          addTopicToOntology(entity.value);
        }
      }
    }
  }

  updateEmailList();
}

/**
 * Handle relationship event
 */
function handleRelationship(data) {
  const key = `${data.relationship.fromValue}|${data.relationship.relationshipType}|${data.relationship.toValue}`;
  const existing = relationships.get(key);

  if (existing) {
    existing.count++;
  } else {
    relationships.set(key, {
      ...data.relationship,
      count: 1,
    });
  }

  updateRelationshipList();
}

/**
 * Handle complete event
 */
function handleComplete(data) {
  const summary = data.summary;
  showToast(
    `Complete! ${summary.totalEmailsProcessed} emails, ${summary.totalEntitiesFound} entities, ${summary.totalRelationshipsFound} relationships`,
    'success'
  );
}

/**
 * Handle contact sync event
 */
function handleContactSync(data) {
  syncedEntities.set(data.entityValue, {
    action: data.action,
    resourceName: data.resourceName,
    error: data.error,
  });

  // Update progress display
  if (data.current === data.total) {
    syncingContacts = false;
    showToast(`Sync complete: ${data.current} contacts processed`, 'success');
  }

  // Refresh entity list to show sync status
  updateEmailList();
}

/**
 * Handle task sync event
 */
function handleTaskSync(data) {
  syncedTasks.set(data.entityValue, {
    action: data.action,
    taskId: data.taskId,
    taskListId: data.taskListId,
    error: data.error,
  });

  // Update progress display
  if (data.current === data.total) {
    syncingTasks = false;
    showToast(`Sync complete: ${data.current} tasks processed`, 'success');
  }

  // Refresh entity list to show sync status
  updateEmailList();
}

/**
 * Get sync status badge HTML for an entity
 */
function getSyncBadge(entityValue, entityType) {
  // Handle person entities (contacts sync)
  if (entityType === 'person') {
    const syncStatus = syncedEntities.get(entityValue);
    if (!syncStatus) {
      return '<span class="sync-badge sync-pending" title="Not synced to contacts">⬡</span>';
    }

    switch (syncStatus.action) {
      case 'created':
        return '<span class="sync-badge sync-created" title="Created in contacts">✓</span>';
      case 'updated':
        return '<span class="sync-badge sync-updated" title="Updated in contacts">↻</span>';
      case 'skipped':
        if (syncStatus.error) {
          return `<span class="sync-badge sync-error" title="${escapeHtml(syncStatus.error)}">✕</span>`;
        }
        return '<span class="sync-badge sync-skipped" title="Skipped">−</span>';
      default:
        return '';
    }
  }

  // Handle action_item entities (tasks sync)
  if (entityType === 'action_item') {
    const syncStatus = syncedTasks.get(entityValue);
    if (!syncStatus) {
      return '<span class="sync-badge sync-pending" title="Not synced to tasks">⬡</span>';
    }

    switch (syncStatus.action) {
      case 'created':
        return '<span class="sync-badge sync-created" title="Created in Google Tasks">✓</span>';
      case 'skipped':
        if (syncStatus.error) {
          return `<span class="sync-badge sync-error" title="${escapeHtml(syncStatus.error)}">✕</span>`;
        }
        return '<span class="sync-badge sync-skipped" title="Skipped (duplicate)">−</span>';
      default:
        return '';
    }
  }

  return '';
}

/**
 * Update email list UI - shows entities as clickable cards
 */
function updateEmailList() {
  const sortedEntities = Array.from(entities.values())
    .sort((a, b) => b.count - a.count);

  emailCount.textContent = sortedEntities.length;

  if (sortedEntities.length === 0) {
    emailList.innerHTML = '<div class="empty-state">No entities discovered yet</div>';
    return;
  }

  const icons = { person: '👤', company: '🏢', project: '📁', location: '📍', topic: '🏷️', action_item: '✅' };

  // Check if we have any person entities for the contacts sync button
  const personEntities = sortedEntities.filter(e => e.type === 'person');
  const contactsSyncHtml = personEntities.length > 0 ? `
    <button class="btn-secondary" onclick="syncAllContacts()" ${syncingContacts ? 'disabled' : ''}>
      ${syncingContacts ? 'Syncing...' : `Sync ${personEntities.length} People to Contacts`}
    </button>
  ` : '';

  // Check if we have any action_item entities for the tasks sync button
  const actionItems = sortedEntities.filter(e => e.type === 'action_item');
  const tasksSyncHtml = actionItems.length > 0 ? `
    <button class="btn-secondary" onclick="syncAllTasks()" ${syncingTasks ? 'disabled' : ''}>
      ${syncingTasks ? 'Syncing...' : `Sync ${actionItems.length} Action Items to Tasks`}
    </button>
  ` : '';

  const syncButtonHtml = (contactsSyncHtml || tasksSyncHtml) ? `
    <div class="sync-controls">
      ${contactsSyncHtml}
      ${tasksSyncHtml}
    </div>
  ` : '';

  emailList.innerHTML = syncButtonHtml + sortedEntities
    .slice(0, 100)
    .map((entity, idx) => {
      const feedbackKey = `entity:${entity.value}`;
      const feedback = feedbackState.get(feedbackKey);
      const hierarchy = entity.type === 'topic' ? topicOntology.get(entity.value) : null;

      return `
      <div class="entity-card new" data-type="${entity.type}" data-idx="${idx}">
        <span class="icon" onclick="inspectEntity(${idx})">${icons[entity.type] || '📋'}</span>
        <div class="info" onclick="inspectEntity(${idx})">
          <div class="name">${escapeHtml(entity.value)}</div>
          <div class="meta">${entity.type} • seen ${entity.count}x</div>
          ${hierarchy && hierarchy.parentName ? `
            <div class="topic-hierarchy">
              <span class="parent-icon">└─</span> subtopic of: ${escapeHtml(hierarchy.parentName)}
            </div>
          ` : ''}
        </div>
        ${getSyncBadge(entity.value, entity.type)}
        ${feedback ? `
          <span class="feedback-status ${feedback}">${feedback === 'positive' ? '✓' : '✕'}</span>
        ` : ''}
        <span class="confidence">${(entity.confidence || 0.8).toFixed(2)}</span>
        <div class="feedback-btns">
          <button class="feedback-btn thumbs-up ${feedback === 'positive' ? 'active-positive' : ''}"
                  onclick="event.stopPropagation(); submitFeedback('entity', ${idx}, 'positive')"
                  title="Good extraction">
            👍
          </button>
          <button class="feedback-btn thumbs-down ${feedback === 'negative' ? 'active-negative' : ''}"
                  onclick="event.stopPropagation(); submitFeedback('entity', ${idx}, 'negative')"
                  title="Bad extraction">
            👎
          </button>
        </div>
      </div>
    `})
    .join('');

  // Store for inspection
  window._entities = sortedEntities;
}

/**
 * Inspect an entity
 */
function inspectEntity(idx) {
  const entity = window._entities[idx];
  if (!entity) return;

  openModal(`Entity: ${entity.value}`, [
    { label: 'Type', value: entity.type },
    { label: 'Confidence', value: (entity.confidence || 0.8).toFixed(2) },
    { label: 'Seen in', value: `${entity.count} emails` },
    { label: 'First source', value: entity.sources?.[0] || 'Unknown' },
  ], entity);
}

/**
 * Update relationship list UI - shows relationships as clickable cards
 */
function updateRelationshipList() {
  const sortedRelationships = Array.from(relationships.values())
    .sort((a, b) => b.count - a.count);

  relationshipCount.textContent = sortedRelationships.length;

  if (sortedRelationships.length === 0) {
    relationshipList.innerHTML = '<div class="empty-state">No relationships discovered yet</div>';
    return;
  }

  relationshipList.innerHTML = sortedRelationships
    .slice(0, 100)
    .map((rel, idx) => {
      const feedbackKey = `relationship:${rel.fromValue}|${rel.relationshipType}|${rel.toValue}`;
      const feedback = feedbackState.get(feedbackKey);

      return `
      <div class="rel-card new" data-idx="${idx}">
        <div class="rel-line" onclick="inspectRelationship(${idx})">
          <span class="source">${escapeHtml(rel.fromValue)}</span>
          <span class="arrow">${rel.relationshipType}</span>
          <span class="target">${escapeHtml(rel.toValue)}</span>
        </div>
        <div class="meta" style="display: flex; align-items: center; justify-content: space-between;">
          <span onclick="inspectRelationship(${idx})">
            Confidence: ${(rel.confidence || 0.8).toFixed(2)} • Seen ${rel.count}x
          </span>
          ${feedback ? `
            <span class="feedback-status ${feedback}">${feedback === 'positive' ? '✓' : '✕'}</span>
          ` : ''}
          <div class="feedback-btns">
            <button class="feedback-btn thumbs-up ${feedback === 'positive' ? 'active-positive' : ''}"
                    onclick="event.stopPropagation(); submitRelationshipFeedback(${idx}, 'positive')"
                    title="Good extraction">
              👍
            </button>
            <button class="feedback-btn thumbs-down ${feedback === 'negative' ? 'active-negative' : ''}"
                    onclick="event.stopPropagation(); submitRelationshipFeedback(${idx}, 'negative')"
                    title="Bad extraction">
              👎
            </button>
          </div>
        </div>
      </div>
    `})
    .join('');

  // Store for inspection
  window._relationships = sortedRelationships;
}

/**
 * Inspect a relationship
 */
function inspectRelationship(idx) {
  const rel = window._relationships[idx];
  if (!rel) return;

  openModal(`Relationship: ${rel.relationshipType}`, [
    { label: 'Source', value: rel.fromValue },
    { label: 'Source Type', value: rel.fromType || 'unknown' },
    { label: 'Relationship', value: rel.relationshipType },
    { label: 'Target', value: rel.toValue },
    { label: 'Target Type', value: rel.toType || 'unknown' },
    { label: 'Confidence', value: (rel.confidence || 0.8).toFixed(2) },
    { label: 'Seen in', value: `${rel.count} emails` },
  ], rel);
}

/**
 * Update button states based on current state and auth
 */
function updateButtonStates() {
  startBtn.disabled = !isAuthenticated || (currentState !== 'idle' && currentState !== 'stopped');
  pauseBtn.disabled = !isAuthenticated || currentState !== 'running';
  resumeBtn.disabled = !isAuthenticated || currentState !== 'paused';
  stopBtn.disabled = !isAuthenticated || (currentState !== 'running' && currentState !== 'paused');
  flushBtn.disabled = currentState === 'running';
}

/**
 * Start processing
 */
async function startProcessing() {
  try {
    const config = {
      batchSize: parseInt(batchSizeInput.value) || 50,
      maxEmailsPerDay: parseInt(maxEmailsPerDayInput.value) || 100,
      startDate: startDateInput.value || undefined,
      endDate: endDateInput.value || undefined,
      userEmail: userEmail,
      userName: userName,
    };

    const response = await fetch('/api/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to start');
    }

    // Clear previous data
    processedEmails = [];
    entities.clear();
    relationships.clear();
    updateEmailList();
    updateRelationshipList();

  } catch (error) {
    console.error('Start failed:', error);
    showToast(`Start failed: ${error.message}`, 'error');
  }
}

/**
 * Pause processing
 */
async function pauseProcessing() {
  try {
    const response = await fetch('/api/pause', { method: 'POST' });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to pause');
    }
  } catch (error) {
    console.error('Pause failed:', error);
    showToast(`Pause failed: ${error.message}`, 'error');
  }
}

/**
 * Resume processing
 */
async function resumeProcessing() {
  try {
    const response = await fetch('/api/resume', { method: 'POST' });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to resume');
    }
  } catch (error) {
    console.error('Resume failed:', error);
    showToast(`Resume failed: ${error.message}`, 'error');
  }
}

/**
 * Stop processing
 */
async function stopProcessing() {
  try {
    const response = await fetch('/api/stop', { method: 'POST' });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to stop');
    }
  } catch (error) {
    console.error('Stop failed:', error);
    showToast(`Stop failed: ${error.message}`, 'error');
  }
}

/**
 * Flush all data
 */
async function flushData() {
  if (!confirm('Are you sure you want to flush all data?')) {
    return;
  }

  try {
    const response = await fetch('/api/flush', { method: 'POST' });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to flush');
    }

    // Clear UI
    processedEmails = [];
    entities.clear();
    relationships.clear();
    syncedEntities.clear();
    syncedTasks.clear();
    feedbackState.clear();
    topicOntology.clear();
    updateEmailList();
    updateRelationshipList();

    // Reset stats
    emailsValue.textContent = '0';
    entitiesValue.textContent = '0';
    relationshipsValue.textContent = '0';
    progressValue.textContent = '0%';
    progressFill.style.width = '0%';
    dayValue.textContent = '-';

    showToast('Data flushed successfully', 'success');
  } catch (error) {
    console.error('Flush failed:', error);
    showToast(`Flush failed: ${error.message}`, 'error');
  }
}

/**
 * Sync all person entities to Google Contacts
 */
async function syncAllContacts() {
  if (syncingContacts) {
    showToast('Sync already in progress', 'info');
    return;
  }

  if (!isAuthenticated) {
    showToast('Please login first', 'error');
    return;
  }

  const personEntities = Array.from(entities.values()).filter(e => e.type === 'person');
  if (personEntities.length === 0) {
    showToast('No person entities to sync', 'info');
    return;
  }

  if (!confirm(`Sync ${personEntities.length} people to Google Contacts?`)) {
    return;
  }

  syncingContacts = true;
  updateEmailList(); // Update button state

  try {
    const response = await fetch('/api/sync-contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to sync contacts');
    }

    showToast(
      `Sync complete: ${data.summary.created} created, ${data.summary.updated} updated`,
      'success'
    );
  } catch (error) {
    console.error('Sync failed:', error);
    showToast(`Sync failed: ${error.message}`, 'error');
  } finally {
    syncingContacts = false;
    updateEmailList();
  }
}

/**
 * Sync a single entity to Google Contacts
 */
async function syncSingleContact(entityValue) {
  if (syncingContacts) {
    showToast('Sync already in progress', 'info');
    return;
  }

  if (!isAuthenticated) {
    showToast('Please login first', 'error');
    return;
  }

  try {
    const response = await fetch('/api/sync-contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityValues: [entityValue] }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to sync contact');
    }

    showToast(`Contact synced: ${entityValue}`, 'success');
  } catch (error) {
    console.error('Sync failed:', error);
    showToast(`Sync failed: ${error.message}`, 'error');
  }
}

/**
 * Sync all action_item entities to Google Tasks
 */
async function syncAllTasks() {
  if (syncingTasks) {
    showToast('Sync already in progress', 'info');
    return;
  }

  if (!isAuthenticated) {
    showToast('Please login first', 'error');
    return;
  }

  const actionItems = Array.from(entities.values()).filter(e => e.type === 'action_item');
  if (actionItems.length === 0) {
    showToast('No action items to sync', 'info');
    return;
  }

  if (!confirm(`Sync ${actionItems.length} action items to Google Tasks?`)) {
    return;
  }

  syncingTasks = true;
  updateEmailList(); // Update button state

  try {
    const response = await fetch('/api/sync-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to sync tasks');
    }

    showToast(
      `Sync complete: ${data.summary.created} created, ${data.summary.skipped} skipped`,
      'success'
    );
  } catch (error) {
    console.error('Sync failed:', error);
    showToast(`Sync failed: ${error.message}`, 'error');
  } finally {
    syncingTasks = false;
    updateEmailList();
  }
}

/**
 * Sync a single action_item entity to Google Tasks
 */
async function syncSingleTask(entityValue) {
  if (syncingTasks) {
    showToast('Sync already in progress', 'info');
    return;
  }

  if (!isAuthenticated) {
    showToast('Please login first', 'error');
    return;
  }

  try {
    const response = await fetch('/api/sync-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityValues: [entityValue] }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to sync task');
    }

    showToast(`Task synced: ${entityValue}`, 'success');
  } catch (error) {
    console.error('Sync failed:', error);
    showToast(`Sync failed: ${error.message}`, 'error');
  }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  errorToast.textContent = message;
  errorToast.style.display = 'block';
  errorToast.style.backgroundColor = type === 'error'
    ? 'var(--accent-red)'
    : type === 'success'
      ? 'var(--accent-green)'
      : 'var(--accent-blue)';

  setTimeout(() => {
    errorToast.style.display = 'none';
  }, 5000);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Handle feedback SSE event
 */
function handleFeedbackEvent(data) {
  const key = data.feedbackType === 'entity'
    ? `entity:${data.value}`
    : `relationship:${data.value}`;

  feedbackState.set(key, data.feedback);

  // Update UI
  if (data.feedbackType === 'entity') {
    updateEmailList();
  } else {
    updateRelationshipList();
  }
}

/**
 * Submit feedback for an entity - opens modal for optional note
 */
async function submitFeedback(type, idx, feedback) {
  const entity = window._entities[idx];
  if (!entity) return;

  const feedbackKey = `entity:${entity.value}`;
  const currentFeedback = feedbackState.get(feedbackKey);

  // Toggle off if clicking the same feedback
  if (currentFeedback === feedback) {
    feedbackState.delete(feedbackKey);
    updateEmailList();
    return;
  }

  // Open modal for optional note
  openFeedbackModal('entity', entity, feedback);
}

/**
 * Actually submit entity feedback to API
 */
async function doSubmitEntityFeedback(entity, feedback, correction) {
  const feedbackKey = `entity:${entity.value}`;

  try {
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'entity',
        extracted: {
          value: entity.value,
          entityType: entity.type,
          confidence: entity.confidence,
        },
        feedback,
        correction,
        context: {
          emailSubject: entity.sources?.[0],
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to submit feedback');
    }

    // Update local state
    feedbackState.set(feedbackKey, feedback);
    updateEmailList();

    const noteText = correction ? ' (with note)' : '';
    showToast(`Feedback recorded: ${feedback === 'positive' ? '👍' : '👎'} ${entity.value}${noteText}`, 'success');
  } catch (error) {
    console.error('Feedback failed:', error);
    showToast(`Feedback failed: ${error.message}`, 'error');
  }
}

/**
 * Submit feedback for a relationship - opens modal for optional note
 */
async function submitRelationshipFeedback(idx, feedback) {
  const rel = window._relationships[idx];
  if (!rel) return;

  const feedbackKey = `relationship:${rel.fromValue}|${rel.relationshipType}|${rel.toValue}`;
  const currentFeedback = feedbackState.get(feedbackKey);

  // Toggle off if clicking the same feedback
  if (currentFeedback === feedback) {
    feedbackState.delete(feedbackKey);
    updateRelationshipList();
    return;
  }

  // Open modal for optional note
  openFeedbackModal('relationship', rel, feedback);
}

/**
 * Actually submit relationship feedback to API
 */
async function doSubmitRelationshipFeedback(rel, feedback, correction) {
  const feedbackKey = `relationship:${rel.fromValue}|${rel.relationshipType}|${rel.toValue}`;

  try {
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'relationship',
        extracted: {
          value: `${rel.fromValue} ${rel.relationshipType} ${rel.toValue}`,
          relationshipType: rel.relationshipType,
          source: rel.fromValue,
          target: rel.toValue,
          confidence: rel.confidence,
        },
        feedback,
        correction,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to submit feedback');
    }

    // Update local state
    feedbackState.set(feedbackKey, feedback);
    updateRelationshipList();

    const noteText = correction ? ' (with note)' : '';
    showToast(`Feedback recorded: ${feedback === 'positive' ? '👍' : '👎'} relationship${noteText}`, 'success');
  } catch (error) {
    console.error('Feedback failed:', error);
    showToast(`Feedback failed: ${error.message}`, 'error');
  }
}

/**
 * Load topic ontology from server
 */
async function loadTopicOntology() {
  try {
    const response = await fetch('/api/ontology');
    const data = await response.json();

    if (data.success && data.flat) {
      topicOntology.clear();
      for (const topic of data.flat) {
        topicOntology.set(topic.name, topic);
      }
      console.log(`Loaded ${data.flat.length} topics into ontology`);
    }
  } catch (error) {
    console.error('Failed to load ontology:', error);
  }
}

/**
 * Add a topic to the ontology with auto-parent detection
 */
async function addTopicToOntology(topicName) {
  try {
    const response = await fetch('/api/ontology/topic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: topicName,
        autoDetectParent: true,
      }),
    });

    const data = await response.json();

    if (data.success && data.hierarchy) {
      topicOntology.set(topicName, data.hierarchy);
      updateEmailList();
    }

    return data;
  } catch (error) {
    console.error('Failed to add topic to ontology:', error);
    return null;
  }
}

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

// Modal elements
const inspectModal = document.getElementById('inspectModal');
const modalTitle = document.getElementById('modalTitle');
const modalFields = document.getElementById('modalFields');
const modalJson = document.getElementById('modalJson');

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

// Close modal on backdrop click
inspectModal?.addEventListener('click', (e) => {
  if (e.target === inspectModal) closeModal();
});

// Close modal on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
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

  const icons = { person: '👤', company: '🏢', project: '📁', location: '📍', topic: '🏷️' };

  emailList.innerHTML = sortedEntities
    .slice(0, 100)
    .map((entity, idx) => `
      <div class="entity-card new" data-type="${entity.type}" onclick="inspectEntity(${idx})">
        <span class="icon">${icons[entity.type] || '📋'}</span>
        <div class="info">
          <div class="name">${escapeHtml(entity.value)}</div>
          <div class="meta">${entity.type} • seen ${entity.count}x</div>
        </div>
        <span class="confidence">${(entity.confidence || 0.8).toFixed(2)}</span>
      </div>
    `)
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
    .map((rel, idx) => `
      <div class="rel-card new" onclick="inspectRelationship(${idx})">
        <div class="rel-line">
          <span class="source">${escapeHtml(rel.fromValue)}</span>
          <span class="arrow">${rel.relationshipType}</span>
          <span class="target">${escapeHtml(rel.toValue)}</span>
        </div>
        <div class="meta">
          Confidence: ${(rel.confidence || 0.8).toFixed(2)} • Seen ${rel.count}x
        </div>
      </div>
    `)
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

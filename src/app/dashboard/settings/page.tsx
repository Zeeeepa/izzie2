/**
 * Consolidated Settings Page
 * Combines all settings into a single tabbed interface
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Types
type PageState = 'loading' | 'loaded' | 'error';
type SaveState = 'idle' | 'saving' | 'success' | 'error';
type SettingsTab = 'identity' | 'writing' | 'alerts' | 'notifications' | 'integrations' | 'usage';

// Tab configuration
const TABS: { value: SettingsTab; label: string; description: string }[] = [
  { value: 'identity', label: 'My Identity', description: 'Your identity and linked entities' },
  { value: 'writing', label: 'Writing', description: 'Writing style and tone' },
  { value: 'alerts', label: 'Alerts', description: 'Alert classification and quiet hours' },
  { value: 'notifications', label: 'Notifications', description: 'Digest and Telegram' },
  { value: 'integrations', label: 'Integrations', description: 'MCP and external tools' },
  { value: 'usage', label: 'Usage', description: 'Usage tracking and limits' },
];

// Common timezones
const COMMON_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Phoenix', label: 'Arizona (MST)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HST)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
];

// Writing style options
const WRITING_STYLES = [
  { value: 'casual', label: 'Casual', description: 'Relaxed and conversational' },
  { value: 'formal', label: 'Formal', description: 'Structured and traditional' },
  { value: 'professional', label: 'Professional', description: 'Clear and business-appropriate' },
] as const;

// Tone options
const TONES = [
  { value: 'friendly', label: 'Friendly', description: 'Warm and approachable' },
  { value: 'neutral', label: 'Neutral', description: 'Balanced and objective' },
  { value: 'assertive', label: 'Assertive', description: 'Direct and confident' },
] as const;

type WritingStyle = (typeof WRITING_STYLES)[number]['value'];
type Tone = (typeof TONES)[number]['value'];

// Alert preferences interface
interface AlertPreferences {
  vipSenders: string[];
  customUrgentKeywords: string[];
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  quietHoursTimezone: string;
  telegramEnabled: boolean;
  emailEnabled: boolean;
  notifyOnP0: boolean;
  notifyOnP1: boolean;
  notifyOnP2: boolean;
}

// Default alert preferences
const DEFAULT_ALERT_PREFERENCES: AlertPreferences = {
  vipSenders: [],
  customUrgentKeywords: [],
  quietHoursEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  quietHoursTimezone: 'America/New_York',
  telegramEnabled: true,
  emailEnabled: false,
  notifyOnP0: true,
  notifyOnP1: true,
  notifyOnP2: false,
};

// Default writing preferences
const DEFAULT_WRITING_PREFERENCES = {
  writingStyle: 'professional' as WritingStyle,
  tone: 'friendly' as Tone,
  customInstructions: '' as string,
};

// Identity entity interface
interface IdentityEntity {
  id: string;
  entityType: string;
  entityValue: string;
  isPrimary: boolean;
  createdAt: string;
}

// Identity interface
interface UserIdentity {
  id: string;
  userId: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
}

// Entity type options for identity
const IDENTITY_ENTITY_TYPES = [
  { value: 'email', label: 'Email Address', description: 'Email addresses you use' },
  { value: 'phone', label: 'Phone Number', description: 'Phone numbers associated with you' },
  { value: 'name', label: 'Name/Alias', description: 'Names and nicknames you go by' },
  { value: 'company', label: 'Company', description: 'Companies you are affiliated with' },
  { value: 'title', label: 'Job Title', description: 'Your professional titles' },
] as const;

export default function SettingsPage() {
  // Tab state
  const [activeTab, setActiveTab] = useState<SettingsTab>('identity');

  // Page state
  const [pageState, setPageState] = useState<PageState>('loading');
  const [pageError, setPageError] = useState<string | null>(null);

  // Identity state
  const [identity, setIdentity] = useState<UserIdentity | null>(null);
  const [identityEntities, setIdentityEntities] = useState<IdentityEntity[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [newEntityType, setNewEntityType] = useState<string>('email');
  const [newEntityValue, setNewEntityValue] = useState('');

  // Writing preferences state
  const [writingStyle, setWritingStyle] = useState<WritingStyle>(DEFAULT_WRITING_PREFERENCES.writingStyle);
  const [tone, setTone] = useState<Tone>(DEFAULT_WRITING_PREFERENCES.tone);
  const [customInstructions, setCustomInstructions] = useState(DEFAULT_WRITING_PREFERENCES.customInstructions);

  // Alert preferences state
  const [alertPrefs, setAlertPrefs] = useState<AlertPreferences>(DEFAULT_ALERT_PREFERENCES);
  const [newVipSender, setNewVipSender] = useState('');
  const [newKeyword, setNewKeyword] = useState('');

  // Save state
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Detect browser timezone on mount
  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected && COMMON_TIMEZONES.some((tz) => tz.value === detected)) {
      setAlertPrefs((prev) => ({ ...prev, quietHoursTimezone: detected }));
    }
  }, []);

  // Fetch all preferences
  const fetchPreferences = useCallback(async () => {
    try {
      setPageState('loading');

      // Fetch identity
      const identityRes = await fetch('/api/user/identity');
      if (identityRes.ok) {
        const data = await identityRes.json();
        if (data.identity) {
          setIdentity(data.identity);
          setDisplayName(data.identity.displayName ?? '');
        }
        if (data.entities) {
          setIdentityEntities(data.entities);
        }
      }

      // Fetch writing preferences
      const writingRes = await fetch('/api/user/preferences');
      if (writingRes.ok) {
        const data = await writingRes.json();
        if (data.preferences) {
          setWritingStyle(data.preferences.writingStyle ?? DEFAULT_WRITING_PREFERENCES.writingStyle);
          setTone(data.preferences.tone ?? DEFAULT_WRITING_PREFERENCES.tone);
          setCustomInstructions(data.preferences.customInstructions ?? DEFAULT_WRITING_PREFERENCES.customInstructions);
        }
      }

      // Fetch alert preferences
      const alertRes = await fetch('/api/user/alert-preferences');
      if (alertRes.ok) {
        const data = await alertRes.json();
        if (data.preferences) {
          setAlertPrefs({
            vipSenders: data.preferences.vipSenders ?? [],
            customUrgentKeywords: data.preferences.customUrgentKeywords ?? [],
            quietHoursEnabled: data.preferences.quietHoursEnabled ?? true,
            quietHoursStart: data.preferences.quietHoursStart ?? '22:00',
            quietHoursEnd: data.preferences.quietHoursEnd ?? '07:00',
            quietHoursTimezone: data.preferences.quietHoursTimezone ?? 'America/New_York',
            telegramEnabled: data.preferences.telegramEnabled ?? true,
            emailEnabled: data.preferences.emailEnabled ?? false,
            notifyOnP0: data.preferences.notifyOnP0 ?? true,
            notifyOnP1: data.preferences.notifyOnP1 ?? true,
            notifyOnP2: data.preferences.notifyOnP2 ?? false,
          });
        }
      }

      setPageState('loaded');
      setPageError(null);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Failed to load preferences');
      setPageState('error');
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  // Save identity display name
  const saveIdentityDisplayName = async () => {
    setSaveState('saving');
    setSaveError(null);

    try {
      const response = await fetch('/api/user/identity', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayName.trim() || null }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save display name');
      }

      const data = await response.json();
      if (data.identity) {
        setIdentity(data.identity);
      }

      setSaveState('success');
      setTimeout(() => setSaveState('idle'), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
      setSaveState('error');
    }
  };

  // Add identity entity
  const addIdentityEntity = async () => {
    if (!newEntityValue.trim()) return;

    setSaveState('saving');
    setSaveError(null);

    try {
      const response = await fetch('/api/user/identity/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: newEntityType,
          entityValue: newEntityValue.trim(),
          isPrimary: false,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add entity');
      }

      const data = await response.json();
      if (data.entity) {
        setIdentityEntities((prev) => [...prev, data.entity]);
        setNewEntityValue('');
      }

      setSaveState('success');
      setTimeout(() => setSaveState('idle'), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to add entity');
      setSaveState('error');
    }
  };

  // Remove identity entity
  const removeIdentityEntity = async (entityId: string) => {
    setSaveState('saving');
    setSaveError(null);

    try {
      const response = await fetch(`/api/user/identity/entities/${entityId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove entity');
      }

      setIdentityEntities((prev) => prev.filter((e) => e.id !== entityId));
      setSaveState('success');
      setTimeout(() => setSaveState('idle'), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to remove entity');
      setSaveState('error');
    }
  };

  // Set entity as primary
  const setEntityAsPrimary = async (entityId: string) => {
    setSaveState('saving');
    setSaveError(null);

    try {
      const response = await fetch(`/api/user/identity/entities/${entityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPrimary: true }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update entity');
      }

      const data = await response.json();
      if (data.entity) {
        // Update local state: unset other primaries of same type, set this one
        setIdentityEntities((prev) =>
          prev.map((e) => {
            if (e.id === entityId) {
              return { ...e, isPrimary: true };
            }
            if (e.entityType === data.entity.entityType) {
              return { ...e, isPrimary: false };
            }
            return e;
          })
        );
      }

      setSaveState('success');
      setTimeout(() => setSaveState('idle'), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update entity');
      setSaveState('error');
    }
  };

  // Save writing preferences
  const saveWritingPreferences = async () => {
    setSaveState('saving');
    setSaveError(null);

    try {
      const response = await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          writingStyle,
          tone,
          customInstructions: customInstructions.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save preferences');
      }

      setSaveState('success');
      setTimeout(() => setSaveState('idle'), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
      setSaveState('error');
    }
  };

  // Save alert preferences
  const saveAlertPreferences = async () => {
    setSaveState('saving');
    setSaveError(null);

    try {
      const response = await fetch('/api/user/alert-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertPrefs),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save alert preferences');
      }

      setSaveState('success');
      setTimeout(() => setSaveState('idle'), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
      setSaveState('error');
    }
  };

  // Add VIP sender
  const addVipSender = () => {
    const email = newVipSender.toLowerCase().trim();
    if (email && !alertPrefs.vipSenders.includes(email)) {
      setAlertPrefs((prev) => ({
        ...prev,
        vipSenders: [...prev.vipSenders, email],
      }));
      setNewVipSender('');
    }
  };

  // Remove VIP sender
  const removeVipSender = (email: string) => {
    setAlertPrefs((prev) => ({
      ...prev,
      vipSenders: prev.vipSenders.filter((s) => s !== email),
    }));
  };

  // Add keyword
  const addKeyword = () => {
    const keyword = newKeyword.toLowerCase().trim();
    if (keyword && !alertPrefs.customUrgentKeywords.includes(keyword)) {
      setAlertPrefs((prev) => ({
        ...prev,
        customUrgentKeywords: [...prev.customUrgentKeywords, keyword],
      }));
      setNewKeyword('');
    }
  };

  // Remove keyword
  const removeKeyword = (keyword: string) => {
    setAlertPrefs((prev) => ({
      ...prev,
      customUrgentKeywords: prev.customUrgentKeywords.filter((k) => k !== keyword),
    }));
  };

  // Render tab navigation
  const renderTabs = () => (
    <div className="border-b mb-6">
      <nav className="flex gap-4 -mb-px overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              'px-1 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              activeTab === tab.value
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50'
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );

  // Render writing preferences tab
  const renderPreferencesTab = () => (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="p-6 space-y-6">
          {/* Writing Style Section */}
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-foreground">Writing Style</h3>
              <p className="text-sm text-muted-foreground">
                Choose the overall style for written responses
              </p>
            </div>

            <div className="space-y-2">
              {WRITING_STYLES.map((style) => (
                <label
                  key={style.value}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors',
                    writingStyle === style.value
                      ? 'border-primary bg-primary/5'
                      : 'border-input hover:border-muted-foreground/50'
                  )}
                >
                  <input
                    type="radio"
                    name="writingStyle"
                    value={style.value}
                    checked={writingStyle === style.value}
                    onChange={(e) => setWritingStyle(e.target.value as WritingStyle)}
                    className="mt-0.5 h-4 w-4 text-primary focus:ring-primary"
                  />
                  <div>
                    <span className="font-medium text-foreground">{style.label}</span>
                    <p className="text-sm text-muted-foreground">{style.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Tone Section */}
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-foreground">Tone</h3>
              <p className="text-sm text-muted-foreground">
                Set the emotional tone for communications
              </p>
            </div>

            <div className="space-y-2">
              {TONES.map((toneOption) => (
                <label
                  key={toneOption.value}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors',
                    tone === toneOption.value
                      ? 'border-primary bg-primary/5'
                      : 'border-input hover:border-muted-foreground/50'
                  )}
                >
                  <input
                    type="radio"
                    name="tone"
                    value={toneOption.value}
                    checked={tone === toneOption.value}
                    onChange={(e) => setTone(e.target.value as Tone)}
                    className="mt-0.5 h-4 w-4 text-primary focus:ring-primary"
                  />
                  <div>
                    <span className="font-medium text-foreground">{toneOption.label}</span>
                    <p className="text-sm text-muted-foreground">{toneOption.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Custom Instructions Section */}
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-foreground">Custom Instructions</h3>
              <p className="text-sm text-muted-foreground">
                Add any specific preferences or context (optional)
              </p>
            </div>

            <div>
              <textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="e.g., Always include action items at the end of summaries, or prefer bullet points over paragraphs..."
                rows={4}
                maxLength={2000}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
              <div className="flex justify-end mt-1">
                <span className="text-xs text-muted-foreground">
                  {customInstructions.length}/2000
                </span>
              </div>
            </div>
          </div>

          {/* Save Button */}
          {renderSaveButton(saveWritingPreferences)}
        </div>
      </div>
    </div>
  );

  // Render alerts tab
  const renderAlertsTab = () => (
    <div className="space-y-6">
      {/* VIP Senders */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="p-6 space-y-4">
          <div>
            <h3 className="font-medium text-foreground">VIP Senders</h3>
            <p className="text-sm text-muted-foreground">
              Emails from these addresses will be prioritized as P0 (urgent)
            </p>
          </div>

          <div className="flex gap-2">
            <input
              type="email"
              value={newVipSender}
              onChange={(e) => setNewVipSender(e.target.value)}
              placeholder="email@example.com"
              onKeyDown={(e) => e.key === 'Enter' && addVipSender()}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button onClick={addVipSender} variant="outline">
              Add
            </Button>
          </div>

          {alertPrefs.vipSenders.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {alertPrefs.vipSenders.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary"
                >
                  {email}
                  <button
                    onClick={() => removeVipSender(email)}
                    className="ml-1 hover:text-destructive"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Custom Urgent Keywords */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="p-6 space-y-4">
          <div>
            <h3 className="font-medium text-foreground">Custom Urgent Keywords</h3>
            <p className="text-sm text-muted-foreground">
              Messages containing these words will be boosted in priority
            </p>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="Enter keyword"
              onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button onClick={addKeyword} variant="outline">
              Add
            </Button>
          </div>

          {alertPrefs.customUrgentKeywords.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {alertPrefs.customUrgentKeywords.map((keyword) => (
                <span
                  key={keyword}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1 text-sm text-amber-600 dark:text-amber-400"
                >
                  {keyword}
                  <button
                    onClick={() => removeKeyword(keyword)}
                    className="ml-1 hover:text-destructive"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quiet Hours */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-foreground">Quiet Hours</h3>
              <p className="text-sm text-muted-foreground">
                P1 and P2 notifications will be held during quiet hours (P0 always notifies)
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={alertPrefs.quietHoursEnabled}
                onChange={(e) => setAlertPrefs((prev) => ({ ...prev, quietHoursEnabled: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
            </label>
          </div>

          {alertPrefs.quietHoursEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Start Time</label>
                <input
                  type="time"
                  value={alertPrefs.quietHoursStart}
                  onChange={(e) => setAlertPrefs((prev) => ({ ...prev, quietHoursStart: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">End Time</label>
                <input
                  type="time"
                  value={alertPrefs.quietHoursEnd}
                  onChange={(e) => setAlertPrefs((prev) => ({ ...prev, quietHoursEnd: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Timezone</label>
                <select
                  value={alertPrefs.quietHoursTimezone}
                  onChange={(e) => setAlertPrefs((prev) => ({ ...prev, quietHoursTimezone: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notification Channels */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="p-6 space-y-4">
          <div>
            <h3 className="font-medium text-foreground">Notification Channels</h3>
            <p className="text-sm text-muted-foreground">
              Choose where to receive alert notifications
            </p>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between rounded-lg border p-4 cursor-pointer hover:border-muted-foreground/50">
              <div>
                <span className="font-medium text-foreground">Telegram</span>
                <p className="text-sm text-muted-foreground">Receive alerts via Telegram bot</p>
              </div>
              <input
                type="checkbox"
                checked={alertPrefs.telegramEnabled}
                onChange={(e) => setAlertPrefs((prev) => ({ ...prev, telegramEnabled: e.target.checked }))}
                className="h-4 w-4 text-primary focus:ring-primary rounded"
              />
            </label>

            <label className="flex items-center justify-between rounded-lg border p-4 cursor-pointer hover:border-muted-foreground/50">
              <div>
                <span className="font-medium text-foreground">Email</span>
                <p className="text-sm text-muted-foreground">Receive alerts via email</p>
              </div>
              <input
                type="checkbox"
                checked={alertPrefs.emailEnabled}
                onChange={(e) => setAlertPrefs((prev) => ({ ...prev, emailEnabled: e.target.checked }))}
                className="h-4 w-4 text-primary focus:ring-primary rounded"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Priority Levels */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="p-6 space-y-4">
          <div>
            <h3 className="font-medium text-foreground">Priority Levels</h3>
            <p className="text-sm text-muted-foreground">
              Choose which priority levels trigger notifications
            </p>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between rounded-lg border p-4 cursor-pointer hover:border-muted-foreground/50">
              <div>
                <span className="font-medium text-foreground">P0 - Urgent</span>
                <p className="text-sm text-muted-foreground">Critical alerts that bypass quiet hours</p>
              </div>
              <input
                type="checkbox"
                checked={alertPrefs.notifyOnP0}
                onChange={(e) => setAlertPrefs((prev) => ({ ...prev, notifyOnP0: e.target.checked }))}
                className="h-4 w-4 text-primary focus:ring-primary rounded"
              />
            </label>

            <label className="flex items-center justify-between rounded-lg border p-4 cursor-pointer hover:border-muted-foreground/50">
              <div>
                <span className="font-medium text-foreground">P1 - Important</span>
                <p className="text-sm text-muted-foreground">Important alerts that respect quiet hours</p>
              </div>
              <input
                type="checkbox"
                checked={alertPrefs.notifyOnP1}
                onChange={(e) => setAlertPrefs((prev) => ({ ...prev, notifyOnP1: e.target.checked }))}
                className="h-4 w-4 text-primary focus:ring-primary rounded"
              />
            </label>

            <label className="flex items-center justify-between rounded-lg border p-4 cursor-pointer hover:border-muted-foreground/50">
              <div>
                <span className="font-medium text-foreground">P2 - Informational</span>
                <p className="text-sm text-muted-foreground">Lower priority alerts batched into digests</p>
              </div>
              <input
                type="checkbox"
                checked={alertPrefs.notifyOnP2}
                onChange={(e) => setAlertPrefs((prev) => ({ ...prev, notifyOnP2: e.target.checked }))}
                className="h-4 w-4 text-primary focus:ring-primary rounded"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="rounded-lg border bg-card shadow-sm p-6">
        {renderSaveButton(saveAlertPreferences)}
      </div>
    </div>
  );

  // Render placeholder tabs (to be expanded)
  const renderNotificationsTab = () => (
    <div className="rounded-lg border bg-card p-6">
      <div className="text-center py-8">
        <h3 className="text-lg font-medium text-foreground mb-2">Notifications Settings</h3>
        <p className="text-muted-foreground mb-4">
          Digest and Telegram settings will be consolidated here.
        </p>
        <div className="flex gap-4 justify-center">
          <Button variant="outline" asChild>
            <a href="/dashboard/settings/digest">Go to Digest Settings</a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/dashboard/settings/telegram">Go to Telegram Settings</a>
          </Button>
        </div>
      </div>
    </div>
  );

  const renderIntegrationsTab = () => (
    <div className="rounded-lg border bg-card p-6">
      <div className="text-center py-8">
        <h3 className="text-lg font-medium text-foreground mb-2">Integrations</h3>
        <p className="text-muted-foreground mb-4">
          MCP and external tool settings will be consolidated here.
        </p>
        <Button variant="outline" asChild>
          <a href="/dashboard/settings/mcp">Go to MCP Settings</a>
        </Button>
      </div>
    </div>
  );

  const renderUsageTab = () => (
    <div className="rounded-lg border bg-card p-6">
      <div className="text-center py-8">
        <h3 className="text-lg font-medium text-foreground mb-2">Usage</h3>
        <p className="text-muted-foreground mb-4">
          Usage tracking and limits will be displayed here.
        </p>
        <Button variant="outline" asChild>
          <a href="/dashboard/settings/usage">Go to Usage Dashboard</a>
        </Button>
      </div>
    </div>
  );

  // Render save button helper
  const renderSaveButton = (onSave: () => Promise<void>) => (
    <div className="pt-4 border-t">
      {saveState === 'error' && saveError && (
        <div className="mb-4 flex items-center gap-2 text-destructive text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>{saveError}</span>
        </div>
      )}

      {saveState === 'success' && (
        <div className="mb-4 flex items-center gap-2 text-green-600 dark:text-green-400 text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
          </svg>
          <span>Settings saved!</span>
        </div>
      )}

      <Button onClick={onSave} disabled={saveState === 'saving'} className="w-full sm:w-auto">
        {saveState === 'saving' ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
            Saving...
          </>
        ) : (
          'Save Changes'
        )}
      </Button>
    </div>
  );

  // Render identity tab
  const renderIdentityTab = () => (
    <div className="space-y-6">
      {/* Display Name */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="p-6 space-y-4">
          <div>
            <h3 className="font-medium text-foreground">Display Name</h3>
            <p className="text-sm text-muted-foreground">
              How Izzie should refer to you
            </p>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your preferred name"
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button onClick={saveIdentityDisplayName} disabled={saveState === 'saving'}>
              Save
            </Button>
          </div>
        </div>
      </div>

      {/* Linked Entities */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="p-6 space-y-4">
          <div>
            <h3 className="font-medium text-foreground">Linked Entities</h3>
            <p className="text-sm text-muted-foreground">
              Information that identifies you (emails, names, companies). Izzie uses this to distinguish "you" from other people.
            </p>
          </div>

          {/* Add new entity */}
          <div className="flex gap-2">
            <select
              value={newEntityType}
              onChange={(e) => setNewEntityType(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {IDENTITY_ENTITY_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newEntityValue}
              onChange={(e) => setNewEntityValue(e.target.value)}
              placeholder={
                newEntityType === 'email'
                  ? 'email@example.com'
                  : newEntityType === 'phone'
                  ? '+1 234 567 8900'
                  : newEntityType === 'name'
                  ? 'John Doe'
                  : newEntityType === 'company'
                  ? 'Acme Inc.'
                  : 'Software Engineer'
              }
              onKeyDown={(e) => e.key === 'Enter' && addIdentityEntity()}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button onClick={addIdentityEntity} variant="outline" disabled={saveState === 'saving'}>
              Add
            </Button>
          </div>

          {/* Entity list grouped by type */}
          {IDENTITY_ENTITY_TYPES.map((type) => {
            const entitiesOfType = identityEntities.filter((e) => e.entityType === type.value);
            if (entitiesOfType.length === 0) return null;

            return (
              <div key={type.value} className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{type.label}s</h4>
                <div className="flex flex-wrap gap-2">
                  {entitiesOfType.map((entity) => (
                    <span
                      key={entity.id}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm',
                        entity.isPrimary
                          ? 'bg-primary/10 text-primary border border-primary/30'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {entity.isPrimary && (
                        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                        </svg>
                      )}
                      {entity.entityValue}
                      <span className="flex items-center gap-1 ml-1">
                        {!entity.isPrimary && (
                          <button
                            onClick={() => setEntityAsPrimary(entity.id)}
                            className="hover:text-primary"
                            title="Set as primary"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={() => removeIdentityEntity(entity.id)}
                          className="hover:text-destructive"
                          title="Remove"
                        >
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}

          {identityEntities.length === 0 && (
            <div className="text-center py-4 text-muted-foreground text-sm">
              No entities linked yet. Add your email addresses, names, and other identifying information.
            </div>
          )}
        </div>
      </div>

      {/* Save status */}
      <div className="rounded-lg border bg-card shadow-sm p-6">
        {saveState === 'error' && saveError && (
          <div className="mb-4 flex items-center gap-2 text-destructive text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>{saveError}</span>
          </div>
        )}

        {saveState === 'success' && (
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            <span>Changes saved!</span>
          </div>
        )}

        {saveState === 'saving' && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span>Saving...</span>
          </div>
        )}

        {saveState === 'idle' && (
          <p className="text-sm text-muted-foreground">
            Your identity helps Izzie understand context like "my company" vs other companies, or distinguish emails you sent vs emails from others.
          </p>
        )}
      </div>
    </div>
  );

  // Render active tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'identity':
        return renderIdentityTab();
      case 'writing':
        return renderPreferencesTab();
      case 'alerts':
        return renderAlertsTab();
      case 'notifications':
        return renderNotificationsTab();
      case 'integrations':
        return renderIntegrationsTab();
      case 'usage':
        return renderUsageTab();
      default:
        return null;
    }
  };

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your preferences, alerts, and integrations
        </p>
      </div>

      {/* Loading State */}
      {pageState === 'loading' && (
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-muted-foreground">Loading settings...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {pageState === 'error' && (
        <div className="rounded-lg border bg-card p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-destructive">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{pageError || 'Failed to load settings'}</span>
            </div>
            <Button variant="outline" onClick={fetchPreferences}>
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      {pageState === 'loaded' && (
        <>
          {renderTabs()}
          {renderTabContent()}
        </>
      )}
    </div>
  );
}

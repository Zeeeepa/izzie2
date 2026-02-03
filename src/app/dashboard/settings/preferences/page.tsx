/**
 * User Preferences Page
 * Configure writing style, tone, and custom instructions
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type PageState = 'loading' | 'loaded' | 'error';
type SaveState = 'idle' | 'saving' | 'success' | 'error';

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

// Default preferences
const DEFAULT_PREFERENCES = {
  writingStyle: 'professional' as WritingStyle,
  tone: 'friendly' as Tone,
  customInstructions: '' as string,
};

export default function PreferencesPage() {
  // Page state
  const [pageState, setPageState] = useState<PageState>('loading');
  const [pageError, setPageError] = useState<string | null>(null);

  // Form state
  const [writingStyle, setWritingStyle] = useState<WritingStyle>(DEFAULT_PREFERENCES.writingStyle);
  const [tone, setTone] = useState<Tone>(DEFAULT_PREFERENCES.tone);
  const [customInstructions, setCustomInstructions] = useState(DEFAULT_PREFERENCES.customInstructions);

  // Save state
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fetch preferences
  const fetchPreferences = useCallback(async () => {
    try {
      const response = await fetch('/api/user/preferences');
      if (!response.ok) {
        if (response.status === 404) {
          // No preferences yet, use defaults
          setPageState('loaded');
          return;
        }
        throw new Error('Failed to fetch preferences');
      }

      const data = await response.json();
      if (data.preferences) {
        const prefs = data.preferences;
        setWritingStyle(prefs.writingStyle ?? DEFAULT_PREFERENCES.writingStyle);
        setTone(prefs.tone ?? DEFAULT_PREFERENCES.tone);
        setCustomInstructions(prefs.customInstructions ?? DEFAULT_PREFERENCES.customInstructions);
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

  // Save preferences
  const savePreferences = async () => {
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
      // Reset success state after 3 seconds
      setTimeout(() => setSaveState('idle'), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
      setSaveState('error');
    }
  };

  return (
    <div className="py-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Writing Preferences</h1>
        <p className="text-muted-foreground mt-1">
          Customize how Izzie communicates with you
        </p>
      </div>

      {/* Loading State */}
      {pageState === 'loading' && (
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-muted-foreground">Loading preferences...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {pageState === 'error' && (
        <div className="rounded-lg border bg-card p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-destructive">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{pageError || 'Failed to load preferences'}</span>
            </div>
            <Button variant="outline" onClick={fetchPreferences}>
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      {pageState === 'loaded' && (
        <div className="space-y-6">
          {/* Settings Card */}
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
              <div className="pt-4 border-t">
                {saveState === 'error' && saveError && (
                  <div className="mb-4 flex items-center gap-2 text-destructive text-sm">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>{saveError}</span>
                  </div>
                )}

                {saveState === 'success' && (
                  <div className="mb-4 flex items-center gap-2 text-green-600 dark:text-green-400 text-sm">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>Preferences saved!</span>
                  </div>
                )}

                <Button
                  onClick={savePreferences}
                  disabled={saveState === 'saving'}
                  className="w-full sm:w-auto"
                >
                  {saveState === 'saving' ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Saving...
                    </>
                  ) : (
                    'Save Preferences'
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Help Section */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <h3 className="text-sm font-medium text-foreground mb-2">About Writing Preferences</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Writing style affects the structure and formality of responses</li>
              <li>Tone influences the emotional quality of communications</li>
              <li>Custom instructions let you add personal preferences or context</li>
              <li>These preferences apply to all AI-generated content</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

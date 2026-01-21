/**
 * Telegram Settings Page
 * Link/unlink Telegram account for notifications and bot interaction
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type LinkStatus = 'idle' | 'loading' | 'linked' | 'not_linked' | 'error';
type LinkingState = 'idle' | 'generating' | 'showing_code' | 'error';

interface TelegramLinkInfo {
  linked: boolean;
  username?: string;
}

interface LinkCodeInfo {
  code: string;
  expiresIn: number;
}

export default function TelegramSettingsPage() {
  // Link status state
  const [linkStatus, setLinkStatus] = useState<LinkStatus>('loading');
  const [linkInfo, setLinkInfo] = useState<TelegramLinkInfo | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Linking flow state
  const [linkingState, setLinkingState] = useState<LinkingState>('idle');
  const [linkCode, setLinkCode] = useState<LinkCodeInfo | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [linkingError, setLinkingError] = useState<string | null>(null);

  // Unlinking state
  const [isUnlinking, setIsUnlinking] = useState(false);

  // Timer refs
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Fetch link status
  const fetchLinkStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/telegram/link');
      if (!response.ok) {
        throw new Error('Failed to fetch status');
      }
      const data: TelegramLinkInfo = await response.json();
      setLinkInfo(data);
      setLinkStatus(data.linked ? 'linked' : 'not_linked');
      setStatusError(null);
      return data;
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Failed to fetch status');
      setLinkStatus('error');
      return null;
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchLinkStatus();
  }, [fetchLinkStatus]);

  // Generate link code
  const generateLinkCode = async () => {
    setLinkingState('generating');
    setLinkingError(null);

    try {
      const response = await fetch('/api/telegram/link', {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate code');
      }

      const data: LinkCodeInfo = await response.json();
      setLinkCode(data);
      setCountdown(data.expiresIn);
      setLinkingState('showing_code');

      // Start countdown timer
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            setLinkingState('idle');
            setLinkCode(null);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Start polling for link completion
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const status = await fetchLinkStatus();
        if (status?.linked) {
          // Link successful - stop timers and update state
          if (countdownRef.current) clearInterval(countdownRef.current);
          if (pollRef.current) clearInterval(pollRef.current);
          setLinkingState('idle');
          setLinkCode(null);
        }
      }, 3000);
    } catch (err) {
      setLinkingError(err instanceof Error ? err.message : 'Failed to generate code');
      setLinkingState('error');
    }
  };

  // Unlink account
  const unlinkAccount = async () => {
    setIsUnlinking(true);

    try {
      const response = await fetch('/api/telegram/link', {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to unlink');
      }

      await fetchLinkStatus();
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Failed to unlink');
    } finally {
      setIsUnlinking(false);
    }
  };

  // Cancel linking flow
  const cancelLinking = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    setLinkingState('idle');
    setLinkCode(null);
    setLinkingError(null);
  };

  // Format countdown as MM:SS
  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Telegram</h1>
        <p className="text-muted-foreground mt-1">
          Connect your Telegram account to receive notifications and interact with the bot
        </p>
      </div>

      {/* Main Card */}
      <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
        <div className="p-6">
          {/* Loading State */}
          {linkStatus === 'loading' && (
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-muted-foreground">Loading link status...</span>
            </div>
          )}

          {/* Error State */}
          {linkStatus === 'error' && (
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
                <span>{statusError || 'Failed to load status'}</span>
              </div>
              <Button variant="outline" onClick={() => fetchLinkStatus()}>
                Retry
              </Button>
            </div>
          )}

          {/* Linked State */}
          {linkStatus === 'linked' && linkInfo && (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {/* Telegram icon */}
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0088cc]/10">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      className="h-5 w-5 text-[#0088cc]"
                      fill="currentColor"
                    >
                      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        @{linkInfo.username || 'Unknown'}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/20 dark:text-green-400">
                        Linked
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Your Telegram account is connected
                    </p>
                  </div>
                </div>
              </div>

              <Button
                variant="destructive"
                onClick={unlinkAccount}
                disabled={isUnlinking}
                className="w-full sm:w-auto"
              >
                {isUnlinking ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Unlinking...
                  </>
                ) : (
                  'Unlink Account'
                )}
              </Button>
            </div>
          )}

          {/* Not Linked State */}
          {linkStatus === 'not_linked' && (
            <div className="space-y-4">
              {/* Idle - Show Link Button */}
              {linkingState === 'idle' && (
                <>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        className="h-5 w-5 text-muted-foreground"
                        fill="currentColor"
                      >
                        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                      </svg>
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Not Connected</span>
                      <p className="text-sm text-muted-foreground">
                        Link your Telegram to receive notifications
                      </p>
                    </div>
                  </div>

                  <Button onClick={generateLinkCode} className="w-full sm:w-auto">
                    Link Telegram
                  </Button>
                </>
              )}

              {/* Generating Code */}
              {linkingState === 'generating' && (
                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="text-muted-foreground">Generating link code...</span>
                </div>
              )}

              {/* Showing Code */}
              {linkingState === 'showing_code' && linkCode && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <p className="text-sm text-muted-foreground mb-3">
                      Send this code to our Telegram bot to link your account:
                    </p>
                    <div className="flex items-center justify-center">
                      <code className="rounded-lg bg-muted px-6 py-3 text-2xl font-mono font-bold tracking-wider text-foreground">
                        {linkCode.code}
                      </code>
                    </div>
                    <div className="mt-3 flex items-center justify-center gap-2 text-sm">
                      <span
                        className={cn(
                          'text-muted-foreground',
                          countdown <= 60 && 'text-amber-600 dark:text-amber-400',
                          countdown <= 30 && 'text-destructive'
                        )}
                      >
                        Expires in {formatCountdown(countdown)}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={cancelLinking}
                      className="flex-1 sm:flex-none"
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="outline"
                      onClick={generateLinkCode}
                      className="flex-1 sm:flex-none"
                    >
                      Generate New Code
                    </Button>
                  </div>
                </div>
              )}

              {/* Error State */}
              {linkingState === 'error' && (
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
                    <span>{linkingError || 'Failed to generate code'}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={cancelLinking}>
                      Cancel
                    </Button>
                    <Button onClick={generateLinkCode}>Try Again</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Help Section */}
      <div className="mt-6 rounded-lg border bg-muted/50 p-4">
        <h3 className="text-sm font-medium text-foreground mb-2">How to link your Telegram</h3>
        <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Click "Link Telegram" to generate a code</li>
          <li>
            Open Telegram and start a chat with{' '}
            {process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ? (
              <a
                href={`https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary hover:underline"
              >
                @{process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME}
              </a>
            ) : (
              <span className="font-medium">our bot</span>
            )}
          </li>
          <li>Send the code to the bot</li>
          <li>Your account will be linked automatically</li>
        </ol>
      </div>
    </div>
  );
}

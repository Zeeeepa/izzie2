/**
 * LLM Costs Page
 * Shows daily and total inference costs with breakdown by operation type
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { DollarSign, TrendingUp, Calendar, Zap, MessageSquare, GraduationCap, Search, RefreshCw } from 'lucide-react';

type PageState = 'loading' | 'loaded' | 'error';

interface TodaySummary {
  totalCost: number;
  totalTokens: number;
  requestCount: number;
}

interface AllTimeSummary {
  totalCost: number;
  totalTokens: number;
  requestCount: number;
  oldestDate: string | null;
}

interface SourceBreakdown {
  source: string;
  cost: number;
  tokens: number;
  percentage: number;
}

interface DailyBreakdown {
  date: string;
  cost: number;
}

// Map source names to more user-friendly labels and icons
const SOURCE_LABELS: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  chat: { label: 'Chat', icon: MessageSquare, color: '#3b82f6' },
  extraction: { label: 'Extraction', icon: Zap, color: '#8b5cf6' },
  research: { label: 'Research', icon: Search, color: '#10b981' },
  training: { label: 'Training', icon: GraduationCap, color: '#f59e0b' },
  agent: { label: 'Agent', icon: RefreshCw, color: '#ec4899' },
  telegram: { label: 'Telegram', icon: MessageSquare, color: '#06b6d4' },
  other: { label: 'Other', icon: DollarSign, color: '#6b7280' },
};

export default function LLMCostsPage() {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [pageError, setPageError] = useState<string | null>(null);

  const [todaySummary, setTodaySummary] = useState<TodaySummary | null>(null);
  const [allTimeSummary, setAllTimeSummary] = useState<AllTimeSummary | null>(null);
  const [sourceBreakdown, setSourceBreakdown] = useState<SourceBreakdown[]>([]);
  const [dailyBreakdown, setDailyBreakdown] = useState<DailyBreakdown[]>([]);

  const fetchCosts = useCallback(async () => {
    try {
      setPageState('loading');

      // Fetch today's usage
      const todayRes = await fetch('/api/user/usage?days=1&breakdown=source');

      // Fetch all-time usage (365 days is effectively all-time for most users)
      const allTimeRes = await fetch('/api/user/usage?days=365&breakdown=source');

      // Fetch daily breakdown for chart (last 30 days)
      const dailyRes = await fetch('/api/user/usage?days=30&breakdown=daily');

      if (!todayRes.ok || !allTimeRes.ok || !dailyRes.ok) {
        const errorRes = !todayRes.ok ? todayRes : !allTimeRes.ok ? allTimeRes : dailyRes;
        if (errorRes.status === 401) {
          throw new Error('Unauthorized');
        }
        throw new Error('Failed to fetch costs data');
      }

      const todayJson = await todayRes.json();
      const allTimeJson = await allTimeRes.json();
      const dailyJson = await dailyRes.json();

      // Today's summary
      setTodaySummary({
        totalCost: todayJson.summary.totalCost,
        totalTokens: todayJson.summary.totalTokens,
        requestCount: todayJson.breakdown?.length || 0,
      });

      // All-time summary
      const dailyData = dailyJson.breakdown || [];
      const oldestDate = dailyData.length > 0 ? dailyData[dailyData.length - 1]?.date : null;
      setAllTimeSummary({
        totalCost: allTimeJson.summary.totalCost,
        totalTokens: allTimeJson.summary.totalTokens,
        requestCount: allTimeJson.breakdown?.reduce((acc: number, item: { tokens: number }) => acc + (item.tokens > 0 ? 1 : 0), 0) || 0,
        oldestDate,
      });

      // Source breakdown (calculate percentages)
      const totalCost = allTimeJson.summary.totalCost || 1; // Avoid division by zero
      const sourceData = (allTimeJson.breakdown || []).map((item: { source: string; cost: number; tokens: number }) => ({
        source: item.source || 'other',
        cost: item.cost,
        tokens: item.tokens,
        percentage: (item.cost / totalCost) * 100,
      }));
      setSourceBreakdown(sourceData);

      // Daily breakdown for chart
      setDailyBreakdown(
        dailyData.map((item: { date: string; cost: number }) => ({
          date: item.date,
          cost: item.cost,
        }))
      );

      setPageState('loaded');
      setPageError(null);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Failed to load costs data');
      setPageState('error');
    }
  }, []);

  useEffect(() => {
    fetchCosts();
  }, [fetchCosts]);

  const formatCost = (cost: number) => {
    if (cost < 0.01) {
      return `$${cost.toFixed(4)}`;
    }
    return `$${cost.toFixed(2)}`;
  };

  const formatTokens = (tokens: number) => {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(1)}M`;
    }
    if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(1)}K`;
    }
    return tokens.toString();
  };

  const maxDailyCost = dailyBreakdown.length > 0 ? Math.max(...dailyBreakdown.map((d) => d.cost)) : 0;

  return (
    <div className="py-4">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <DollarSign className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold text-foreground">LLM Costs</h1>
        </div>
        <p className="text-muted-foreground">Track your AI inference spending and usage by operation type</p>
      </div>

      {/* Loading State */}
      {pageState === 'loading' && (
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-muted-foreground">Loading costs data...</span>
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
              <span>{pageError || 'Failed to load costs data'}</span>
            </div>
            <Button variant="outline" onClick={fetchCosts}>
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      {pageState === 'loaded' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Today's Spend */}
            <div className="rounded-lg border bg-card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Today&apos;s Spend</p>
                  <p className="text-2xl font-bold">{formatCost(todaySummary?.totalCost || 0)}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatTokens(todaySummary?.totalTokens || 0)} tokens used today
              </p>
            </div>

            {/* All-Time Spend */}
            <div className="rounded-lg border bg-card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                  <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Spend</p>
                  <p className="text-2xl font-bold">{formatCost(allTimeSummary?.totalCost || 0)}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatTokens(allTimeSummary?.totalTokens || 0)} tokens all time
                {allTimeSummary?.oldestDate && ` (since ${allTimeSummary.oldestDate})`}
              </p>
            </div>
          </div>

          {/* Cost by Operation Type */}
          <div className="rounded-lg border bg-card shadow-sm">
            <div className="p-4 border-b">
              <h3 className="font-medium text-foreground">Cost by Operation Type</h3>
              <p className="text-sm text-muted-foreground">Breakdown of spending by feature</p>
            </div>
            <div className="p-4">
              {sourceBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No usage data yet. Start using Izzie to see costs breakdown.
                </p>
              ) : (
                <div className="space-y-4">
                  {sourceBreakdown.map((item) => {
                    const sourceInfo = SOURCE_LABELS[item.source] || SOURCE_LABELS.other;
                    const Icon = sourceInfo.icon;
                    return (
                      <div key={item.source} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" style={{ color: sourceInfo.color }} />
                            <span className="text-sm font-medium">{sourceInfo.label}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-semibold">{formatCost(item.cost)}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              ({item.percentage.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.max(item.percentage, 1)}%`,
                              backgroundColor: sourceInfo.color,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Daily Cost Chart */}
          <div className="rounded-lg border bg-card shadow-sm">
            <div className="p-4 border-b">
              <h3 className="font-medium text-foreground">Daily Costs (Last 30 Days)</h3>
              <p className="text-sm text-muted-foreground">Cost trend over time</p>
            </div>
            <div className="p-4">
              {dailyBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No usage data for this period
                </p>
              ) : (
                <div className="flex items-end gap-1 h-32">
                  {dailyBreakdown
                    .slice()
                    .reverse()
                    .map((day) => {
                      const height = maxDailyCost > 0 ? (day.cost / maxDailyCost) * 100 : 0;
                      return (
                        <div
                          key={day.date}
                          className="flex-1 group relative"
                          title={`${day.date}: ${formatCost(day.cost)}`}
                        >
                          <div
                            className="w-full bg-primary/80 hover:bg-primary rounded-t transition-colors"
                            style={{ height: `${Math.max(height, 2)}%` }}
                          />
                          {/* Tooltip */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                            <div className="bg-popover text-popover-foreground text-xs rounded px-2 py-1 shadow-md whitespace-nowrap border">
                              <p className="font-medium">{day.date}</p>
                              <p>{formatCost(day.cost)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>

          {/* Help Section */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <h3 className="text-sm font-medium text-foreground mb-2">About LLM Costs</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li><strong>Chat:</strong> Conversations with the AI assistant</li>
              <li><strong>Extraction:</strong> Processing emails and calendar for entity discovery</li>
              <li><strong>Training:</strong> User feedback and model fine-tuning (RLHF)</li>
              <li><strong>Research:</strong> Deep research and analysis tasks</li>
              <li>Costs are calculated using model-specific pricing per million tokens</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Calendar Event Scorer
 *
 * Scores calendar events by relevance to the user.
 * Events sooner and with attendees receive higher scores.
 */

import type { CalendarEvent } from '../google/types';
import type { CalendarEventScore, ScoreFactor, CalendarScoringConfig } from './types';
import { DEFAULT_CALENDAR_SCORING_CONFIG } from './types';

/** Video meeting URL patterns */
const VIDEO_LINK_PATTERNS = [
  /zoom\.us/i,
  /meet\.google\.com/i,
  /teams\.microsoft\.com/i,
  /webex\.com/i,
  /whereby\.com/i,
  /gotomeeting\.com/i,
];

export class CalendarScorer {
  private config: CalendarScoringConfig;

  constructor(config?: Partial<CalendarScoringConfig>) {
    this.config = {
      weights: {
        ...DEFAULT_CALENDAR_SCORING_CONFIG.weights,
        ...config?.weights,
      },
    };
  }

  /**
   * Score a single calendar event
   */
  score(event: CalendarEvent, referenceTime: Date = new Date()): CalendarEventScore {
    const factors: ScoreFactor[] = [];
    let totalScore = 0;

    // Time proximity (events sooner = higher score)
    const proximityScore = this.calculateTimeProximity(event, referenceTime);
    const proximityContribution = this.config.weights.timeProximity * proximityScore;
    factors.push({
      name: 'timeProximity',
      weight: this.config.weights.timeProximity,
      rawValue: proximityScore,
      contribution: proximityContribution,
    });
    totalScore += proximityContribution;

    // Has attendees (meetings with others = higher)
    const attendeeCount = event.attendees?.length || 0;
    if (attendeeCount > 0) {
      // More attendees = higher importance, capped at 10
      const attendeeNormalized = Math.min(attendeeCount / 10, 1.0);
      const attendeeContribution = this.config.weights.hasAttendees * attendeeNormalized;
      factors.push({
        name: 'hasAttendees',
        weight: this.config.weights.hasAttendees,
        rawValue: attendeeCount,
        contribution: attendeeContribution,
      });
      totalScore += attendeeContribution;
    }

    // Has video link (Zoom/Meet = higher)
    if (this.hasVideoLink(event)) {
      const contribution = this.config.weights.hasVideoLink * 1.0;
      factors.push({
        name: 'hasVideoLink',
        weight: this.config.weights.hasVideoLink,
        rawValue: 1.0,
        contribution,
      });
      totalScore += contribution;
    }

    // Response status (accepted vs tentative)
    const responseScore = this.calculateResponseScore(event);
    if (responseScore > 0) {
      const responseContribution = this.config.weights.responseAccepted * responseScore;
      factors.push({
        name: 'responseAccepted',
        weight: this.config.weights.responseAccepted,
        rawValue: responseScore,
        contribution: responseContribution,
      });
      totalScore += responseContribution;
    }

    // Recurring vs one-time (recurring = slightly lower, one-time = higher)
    if (!event.recurringEventId) {
      const contribution = this.config.weights.isRecurring * 1.0;
      factors.push({
        name: 'isOneTime',
        weight: this.config.weights.isRecurring,
        rawValue: 1.0,
        contribution,
      });
      totalScore += contribution;
    }

    // Timed event vs all-day (timed = higher)
    if (this.isTimedEvent(event)) {
      const contribution = this.config.weights.isTimedEvent * 1.0;
      factors.push({
        name: 'isTimedEvent',
        weight: this.config.weights.isTimedEvent,
        rawValue: 1.0,
        contribution,
      });
      totalScore += contribution;
    }

    // Duration (longer meetings may be more important, capped at 2 hours)
    const durationMinutes = this.calculateDuration(event);
    const durationNormalized = Math.min(durationMinutes / 120, 1.0);
    const durationContribution = this.config.weights.duration * durationNormalized;
    factors.push({
      name: 'duration',
      weight: this.config.weights.duration,
      rawValue: durationMinutes,
      contribution: durationContribution,
    });
    totalScore += durationContribution;

    // Normalize to 0-100
    const maxPossibleScore = Object.values(this.config.weights).reduce(
      (sum, weight) => sum + weight,
      0
    );
    const normalizedScore = (totalScore / maxPossibleScore) * 100;

    return {
      eventId: event.id,
      score: Math.round(normalizedScore * 100) / 100,
      factors,
      computedAt: new Date(),
    };
  }

  /**
   * Score events in batch
   */
  scoreBatch(events: CalendarEvent[], referenceTime: Date = new Date()): CalendarEventScore[] {
    return events.map((event) => this.score(event, referenceTime));
  }

  /**
   * Get top N relevant events
   */
  getTopRelevant(
    events: CalendarEvent[],
    n: number,
    referenceTime: Date = new Date()
  ): CalendarEventScore[] {
    const scores = this.scoreBatch(events, referenceTime);
    return scores.sort((a, b) => b.score - a.score).slice(0, n);
  }

  /**
   * Calculate time proximity score (0-1)
   * Events happening now or very soon get highest score
   * Events further in the future get lower scores
   */
  private calculateTimeProximity(event: CalendarEvent, referenceTime: Date): number {
    const eventStart = new Date(event.start.dateTime);
    const hoursUntilEvent = (eventStart.getTime() - referenceTime.getTime()) / (1000 * 60 * 60);

    // Past events get zero score
    if (hoursUntilEvent < -1) {
      return 0;
    }

    // Currently happening events get full score
    if (hoursUntilEvent >= -1 && hoursUntilEvent <= 0) {
      return 1.0;
    }

    // Events within next hour get high score
    if (hoursUntilEvent <= 1) {
      return 0.95;
    }

    // Events within next 4 hours
    if (hoursUntilEvent <= 4) {
      return 0.85;
    }

    // Events within next 24 hours (today)
    if (hoursUntilEvent <= 24) {
      return 0.7;
    }

    // Events within next 7 days
    if (hoursUntilEvent <= 168) {
      return 0.5 - ((hoursUntilEvent - 24) / 168) * 0.3;
    }

    // Events further out get minimal score
    return Math.max(0.1, 0.2 - ((hoursUntilEvent - 168) / 720) * 0.1);
  }

  /**
   * Check if event has a video conference link
   */
  private hasVideoLink(event: CalendarEvent): boolean {
    const textToSearch = [event.location || '', event.description || '', event.htmlLink || ''].join(
      ' '
    );

    return VIDEO_LINK_PATTERNS.some((pattern) => pattern.test(textToSearch));
  }

  /**
   * Calculate response score based on user's attendance status
   */
  private calculateResponseScore(event: CalendarEvent): number {
    // Find the user's attendance entry (self = true)
    const selfAttendee = event.attendees?.find((a) => a.self);

    if (!selfAttendee) {
      // If organizer, they implicitly accepted
      if (event.organizer?.self) {
        return 1.0;
      }
      // No attendance info, neutral score
      return 0.5;
    }

    switch (selfAttendee.responseStatus) {
      case 'accepted':
        return 1.0;
      case 'tentative':
        return 0.5;
      case 'needsAction':
        return 0.3;
      case 'declined':
        return 0;
      default:
        return 0.3;
    }
  }

  /**
   * Check if event has specific start/end times (not all-day)
   */
  private isTimedEvent(event: CalendarEvent): boolean {
    // All-day events have date instead of dateTime
    // Our CalendarEvent type always has dateTime, but all-day events
    // typically have times at midnight or are marked differently
    const startTime = new Date(event.start.dateTime);
    const endTime = new Date(event.end.dateTime);

    // Check if it spans exactly 24 hours and starts at midnight
    const durationHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    const startsAtMidnight = startTime.getHours() === 0 && startTime.getMinutes() === 0;

    // If exactly 24 hours starting at midnight, likely all-day
    if (durationHours === 24 && startsAtMidnight) {
      return false;
    }

    return true;
  }

  /**
   * Calculate event duration in minutes
   */
  private calculateDuration(event: CalendarEvent): number {
    const startTime = new Date(event.start.dateTime);
    const endTime = new Date(event.end.dateTime);
    return (endTime.getTime() - startTime.getTime()) / (1000 * 60);
  }
}

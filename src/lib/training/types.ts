/**
 * Training Types
 * Type definitions for the ML training system with human-in-the-loop feedback
 */

/**
 * Training session status
 */
export type TrainingStatus = 'collecting' | 'training' | 'paused' | 'complete';

/**
 * Training mode
 */
export type TrainingMode = 'collect_feedback' | 'auto_train';

/**
 * Sample types for training
 */
export type SampleType = 'entity' | 'relationship' | 'classification';

/**
 * Training session configuration
 */
export interface TrainingSession {
  id: string;
  userId: string;
  status: TrainingStatus;
  mode: TrainingMode;
  budget: {
    total: number; // Budget in cents
    used: number;
    remaining: number;
  };
  progress: {
    samplesCollected: number;
    feedbackReceived: number;
    exceptionsCount: number;
    accuracy: number; // 0-100
  };
  config: {
    sampleSize: number;
    autoTrainThreshold: number; // Min feedback before auto-training
    sampleTypes: SampleType[];
  };
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

/**
 * Training sample for user feedback
 */
export interface TrainingSample {
  id: string;
  sessionId: string;
  type: SampleType;
  content: {
    text: string;
    context?: string;
    sourceId?: string;
    sourceType?: 'email' | 'calendar' | 'document';
  };
  prediction: {
    label: string;
    confidence: number; // 0-100
    reasoning?: string;
  };
  feedback?: {
    isCorrect: boolean;
    correctedLabel?: string;
    notes?: string;
    feedbackAt: Date;
  };
  status: 'pending' | 'reviewed' | 'skipped';
  createdAt: Date;
}

/**
 * Training exception requiring human review
 */
export interface TrainingException {
  id: string;
  sessionId: string;
  userId: string;
  type: 'low_confidence' | 'conflicting_labels' | 'novel_pattern' | 'error';
  item: {
    sampleId?: string;
    content: string;
    context?: string;
  };
  reason: string;
  severity: 'low' | 'medium' | 'high';
  status: 'pending' | 'reviewed' | 'dismissed';
  notifiedAt?: Date;
  reviewedAt?: Date;
  createdAt: Date;
}

/**
 * Feedback submission request
 */
export interface FeedbackSubmission {
  sampleId: string;
  isCorrect: boolean;
  correctedLabel?: string;
  notes?: string;
}

/**
 * Budget update request
 */
export interface BudgetUpdate {
  sessionId: string;
  newBudget: number; // in cents
}

/**
 * Training statistics
 */
export interface TrainingStats {
  totalSamples: number;
  reviewedSamples: number;
  correctPredictions: number;
  accuracy: number;
  costUsed: number;
  exceptionsCount: number;
  byType: Record<SampleType, {
    total: number;
    reviewed: number;
    accuracy: number;
  }>;
}

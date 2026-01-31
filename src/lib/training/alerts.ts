/**
 * Training Alerts
 * Send notifications when training encounters exceptions
 */

import { getTelegramBot } from '@/lib/telegram/bot';
import { getTelegramLink } from '@/lib/telegram/linking';
import type { TrainingException } from './types';

const LOG_PREFIX = '[TrainingAlerts]';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3300';

/**
 * Alert user about a training exception via Telegram
 */
export async function sendTrainingAlert(
  userId: string,
  exception: TrainingException
): Promise<boolean> {
  try {
    // Check if user has Telegram linked
    const link = await getTelegramLink(userId);
    if (!link) {
      console.log(`${LOG_PREFIX} User ${userId} doesn't have Telegram linked`);
      return false;
    }

    const bot = getTelegramBot();
    if (!bot) {
      console.warn(`${LOG_PREFIX} Telegram bot not configured`);
      return false;
    }

    // Format the alert message
    const severityEmoji = getSeverityEmoji(exception.severity);
    const typeLabel = getTypeLabel(exception.type);

    const message = `${severityEmoji} *Izzie needs help!*

*Type:* ${typeLabel}
*Item:* "${truncateText(exception.item.content, 100)}"
*Reason:* ${exception.reason}

Please review in the app: [Train Izzie](${APP_URL}/dashboard/train)`;

    // Send the message
    await bot.sendMessage({
      chat_id: link.telegramChatId.toString(),
      text: message,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });

    console.log(`${LOG_PREFIX} Sent training alert to user ${userId}`);
    return true;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to send training alert:`, error);
    return false;
  }
}

/**
 * Send a training session status update
 */
export async function sendTrainingStatusUpdate(
  userId: string,
  sessionId: string,
  message: string
): Promise<boolean> {
  try {
    const link = await getTelegramLink(userId);
    if (!link) {
      return false;
    }

    const bot = getTelegramBot();
    if (!bot) {
      return false;
    }

    const formattedMessage = `*Training Update*

${message}

[View Progress](${APP_URL}/dashboard/train)`;

    await bot.sendMessage({
      chat_id: link.telegramChatId.toString(),
      text: formattedMessage,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });

    return true;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to send training status update:`, error);
    return false;
  }
}

// ============================================================
// Helpers
// ============================================================

function getSeverityEmoji(severity: TrainingException['severity']): string {
  switch (severity) {
    case 'high':
      return '\u{1F534}'; // Red circle
    case 'medium':
      return '\u{1F7E1}'; // Yellow circle
    case 'low':
      return '\u{1F7E2}'; // Green circle
    default:
      return '\u{1F916}'; // Robot
  }
}

function getTypeLabel(type: TrainingException['type']): string {
  switch (type) {
    case 'low_confidence':
      return 'Low Confidence Prediction';
    case 'conflicting_labels':
      return 'Conflicting Labels';
    case 'novel_pattern':
      return 'Novel Pattern Detected';
    case 'error':
      return 'Processing Error';
    default:
      return 'Unknown';
  }
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

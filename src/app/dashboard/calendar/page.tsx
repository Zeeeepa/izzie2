/**
 * Calendar Page
 * Placeholder for calendar view
 */

import { Calendar } from 'lucide-react';

export default function CalendarPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Calendar className="h-8 w-8 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-semibold mb-2">Calendar</h1>
      <p className="text-muted-foreground text-sm max-w-[280px]">
        Your calendar events will appear here. Connect your Google Calendar to get started.
      </p>
    </div>
  );
}

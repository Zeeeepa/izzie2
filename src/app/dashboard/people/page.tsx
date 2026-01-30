/**
 * People Page
 * Placeholder for contacts/people view
 */

import { Users } from 'lucide-react';

export default function PeoplePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Users className="h-8 w-8 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-semibold mb-2">People</h1>
      <p className="text-muted-foreground text-sm max-w-[280px]">
        Your contacts and relationships will appear here. Izzie learns about people from your emails and calendar.
      </p>
    </div>
  );
}

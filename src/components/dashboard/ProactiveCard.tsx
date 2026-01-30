import { Calendar, CheckSquare, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type CardType = 'event' | 'task' | 'person';

interface ProactiveCardProps {
  type: CardType;
  title: string;
  subtitle?: string;
  time?: string;
  className?: string;
}

const icons = {
  event: Calendar,
  task: CheckSquare,
  person: User,
};

const colors = {
  event: 'text-blue-500',
  task: 'text-green-500',
  person: 'text-purple-500',
};

export function ProactiveCard({ type, title, subtitle, time, className }: ProactiveCardProps) {
  const Icon = icons[type];

  return (
    <Card className={cn('cursor-pointer transition-shadow hover:shadow-md', className)}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn('rounded-full bg-muted p-2', colors[type])}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{title}</p>
          {subtitle && (
            <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
          )}
        </div>
        {time && (
          <span className="text-sm text-muted-foreground whitespace-nowrap">{time}</span>
        )}
      </CardContent>
    </Card>
  );
}

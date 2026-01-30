'use client';

import { Menu, LogOut } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth-client';
import { useState } from 'react';

interface MobileHeaderProps {
  user?: {
    name?: string | null;
    email?: string | null;
  };
}

export function MobileHeader({ user }: MobileHeaderProps) {
  const [isLoading, setIsLoading] = useState(false);

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await signOut();
      window.location.href = '/login';
    } catch (error) {
      console.error('Sign out error:', error);
      setIsLoading(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-background safe-area-top">
      <div className="flex h-14 items-center justify-between px-4">
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Menu</span>
        </Button>

        <h1 className="text-lg font-semibold">Izzie</h1>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.name || 'User'}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              disabled={isLoading}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {isLoading ? 'Signing out...' : 'Sign Out'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

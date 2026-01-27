'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Database,
  MessageSquare,
  LogOut,
  ChevronDown,
  ChevronRight,
  Network,
  MessageCircle,
  Mail,
  Zap,
  Settings,
  BarChart3,
  Users,
  Cable,
  RefreshCw,
  Contact,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SignOutButton } from '@/components/auth/SignOutButton';

interface AppSidebarProps {
  user: {
    name?: string | null;
    email?: string | null;
  };
}

// Main navigation items
const mainNavItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: Home,
    exact: true,
  },
  {
    href: '/dashboard/extraction',
    label: 'Extraction',
    icon: Zap,
  },
  {
    href: '/dashboard/entities',
    label: 'Entities',
    icon: Database,
  },
  {
    href: '/dashboard/chat',
    label: 'Chat',
    icon: MessageSquare,
  },
  {
    href: '/dashboard/relationships',
    label: 'Relationships',
    icon: Network,
  },
];

// Settings sub-navigation items
const settingsNavItems = [
  {
    href: '/dashboard/settings/telegram',
    label: 'Telegram',
    icon: MessageCircle,
  },
  {
    href: '/dashboard/settings/digest',
    label: 'Digest',
    icon: Mail,
  },
  {
    href: '/dashboard/settings/preferences',
    label: 'Preferences',
    icon: Settings,
  },
  {
    href: '/dashboard/settings/mcp',
    label: 'MCP',
    icon: Cable,
  },
  {
    href: '/dashboard/settings/usage',
    label: 'Usage',
    icon: BarChart3,
  },
  {
    href: '/dashboard/settings/accounts',
    label: 'Accounts',
    icon: Users,
  },
];

// Sync sub-navigation items
const syncNavItems = [
  {
    href: '/dashboard/sync/contacts',
    label: 'Contacts',
    icon: Contact,
  },
];

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(() => pathname.startsWith('/dashboard/settings'));
  const [syncOpen, setSyncOpen] = useState(() => pathname.startsWith('/dashboard/sync'));

  const isActive = (href: string, exact?: boolean) => {
    if (exact) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  const isSettingsActive = settingsNavItems.some((item) => pathname.startsWith(item.href));
  const isSyncActive = syncNavItems.some((item) => pathname.startsWith(item.href));

  const getUserInitials = () => {
    if (user.name) {
      return user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    if (user.email) {
      return user.email[0].toUpperCase();
    }
    return '?';
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <span className="text-xl">🤖</span>
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold tracking-tight">Izzie</span>
                  <span className="truncate text-xs text-muted-foreground">AI Assistant</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href, item.exact);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link href={item.href}>
                        <Icon className="h-4 w-4 stroke-[1.5]" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Settings Group */}
        <SidebarGroup>
          <SidebarGroupLabel
            className="cursor-pointer select-none"
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <Settings className="h-4 w-4 mr-2" />
            <span className="flex-1">Settings</span>
            {settingsOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </SidebarGroupLabel>
          {settingsOpen && (
            <SidebarGroupContent>
              <SidebarMenu>
                {settingsNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active}>
                        <Link href={item.href} className="pl-6">
                          <Icon className="h-4 w-4 stroke-[1.5]" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        {/* Sync Group */}
        <SidebarGroup>
          <SidebarGroupLabel
            className="cursor-pointer select-none"
            onClick={() => setSyncOpen(!syncOpen)}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            <span className="flex-1">Sync</span>
            {syncOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </SidebarGroupLabel>
          {syncOpen && (
            <SidebarGroupContent>
              <SidebarMenu>
                {syncNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active}>
                        <Link href={item.href} className="pl-6">
                          <Icon className="h-4 w-4 stroke-[1.5]" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          )}
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg text-xs font-medium">
                      {getUserInitials()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold tracking-tight">
                      {user.name || user.email || 'Authenticated User'}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email || ''}
                    </span>
                  </div>
                  <ChevronDown className="ml-auto h-4 w-4 stroke-[1.5]" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuItem asChild>
                  <SignOutButton variant="ghost" className="w-full justify-start">
                    <LogOut className="mr-2 h-4 w-4 stroke-[1.5]" />
                    <span className="text-sm">Sign Out</span>
                  </SignOutButton>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

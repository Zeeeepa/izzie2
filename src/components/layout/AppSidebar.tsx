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
  Sparkles,
} from 'lucide-react';
import { BUILD_INFO } from '@/lib/build-info';
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SignOutButton } from '@/components/auth/SignOutButton';

interface AppSidebarProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
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
  {
    href: '/dashboard/discover',
    label: 'Discover',
    icon: Sparkles,
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
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-semibold tracking-tight">Izzie</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                        <button className="inline-flex items-center text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                          v{BUILD_INFO.version}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuLabel className="text-xs font-medium">Build Info</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <div className="px-2 py-1.5 text-xs">
                          <div className="grid gap-1">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Version</span>
                              <span className="font-mono">{BUILD_INFO.version}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Commit</span>
                              <span className="font-mono">{BUILD_INFO.gitHash}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Branch</span>
                              <span className="font-mono">{BUILD_INFO.gitBranch}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Built</span>
                              <span className="font-mono">{new Date(BUILD_INFO.buildTime).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
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
                    {user.image && (
                      <AvatarImage src={user.image} alt={user.name || 'User avatar'} />
                    )}
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
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user.name || 'User'}</p>
                    <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings/preferences" className="cursor-pointer">
                    <Settings className="mr-2 h-4 w-4 stroke-[1.5]" />
                    <span className="text-sm">Settings</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings/accounts" className="cursor-pointer">
                    <Users className="mr-2 h-4 w-4 stroke-[1.5]" />
                    <span className="text-sm">Connected Accounts</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
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

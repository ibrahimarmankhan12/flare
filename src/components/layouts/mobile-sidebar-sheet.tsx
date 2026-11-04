"use client";

import { useMemo } from "react";
import { Sheet, SheetContent, SheetFooter, SheetTitle } from "ui/sheet";
import { Button } from "ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "ui/avatar";
import {
  Waypoints,
  Shield,
  Bot,
  MoreHorizontal,
  SlidersHorizontal,
  ChevronsUpDown,
  LogOutIcon,
  Settings2,
  Settings,
  Command,
  FolderOpenIcon,
  Sparkles,
} from "lucide-react";
import { WriteIcon } from "ui/write-icon";
import { MCPIcon } from "ui/mcp-icon";
import { GithubIcon } from "ui/github-icon";
import { TelegramIcon } from "ui/telegram-icon";
import { ThreadDropdown } from "../thread-dropdown";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BasicUser } from "app-types/user";
import { getIsUserAdmin, getUserAvatar } from "lib/user/utils";
import { appStore } from "@/app/store";
import { useShallow } from "zustand/shallow";
import { fetcher, groupBy, deduplicateByKey } from "lib/utils";
import useSWR from "swr";
import { handleErrorWithToast } from "ui/shared-toast";
import { ChatThread } from "app-types/chat";
import { useTranslations } from "next-intl";
import { TextShimmer } from "ui/text-shimmer";
import { cn } from "lib/utils";
import { authClient } from "auth/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "ui/dropdown-menu";

type ThreadGroup = {
  label: string;
  threads: ChatThread[];
};

interface MobileSidebarSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: BasicUser;
}

export function MobileSidebarSheet({
  open,
  onOpenChange,
  user,
}: MobileSidebarSheetProps) {
  const router = useRouter();
  const t = useTranslations("Layout");
  const isAdmin = getIsUserAdmin(user);

  const [storeMutate, currentThreadId, generatingTitleThreadIds] = appStore(
    useShallow((state) => [
      state.mutate,
      state.currentThreadId,
      state.generatingTitleThreadIds,
    ]),
  );

  const { data: threadList, isLoading } = useSWR("/api/thread", fetcher, {
    onError: handleErrorWithToast,
    fallbackData: [],
    onSuccess: (data) => {
      storeMutate((prev) => {
        const groupById = groupBy(prev.threadList, "id");
        const generatingTitleThreads = prev.generatingTitleThreadIds
          .map((id) => groupById[id]?.[0])
          .filter(Boolean) as ChatThread[];
        const list = deduplicateByKey(
          generatingTitleThreads.concat(data),
          "id",
        );
        return {
          threadList: list.map((v) => {
            const target = groupById[v.id]?.[0];
            if (!target) return v;
            if (target.title && !v.title) return { ...v, title: target.title };
            return v;
          }),
        };
      });
    },
  });

  const threadGroupByDate = useMemo(() => {
    if (!threadList || threadList.length === 0) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const groups: ThreadGroup[] = [
      { label: t("today"), threads: [] },
      { label: t("yesterday"), threads: [] },
      { label: t("lastWeek"), threads: [] },
      { label: t("older"), threads: [] },
    ];

    threadList.forEach((thread: ChatThread) => {
      const threadDate = new Date(thread.createdAt) || new Date();
      threadDate.setHours(0, 0, 0, 0);

      if (threadDate.getTime() === today.getTime()) {
        groups[0].threads.push(thread);
      } else if (threadDate.getTime() === yesterday.getTime()) {
        groups[1].threads.push(thread);
      } else if (threadDate.getTime() >= lastWeek.getTime()) {
        groups[2].threads.push(thread);
      } else {
        groups[3].threads.push(thread);
      }
    });

    return groups.filter((group) => group.threads.length > 0);
  }, [threadList, t]);

  const handleNewChat = () => {
    onOpenChange(false);
    router.push("/dashboard");
    router.refresh();
  };

  const handleNavigate = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[65vh] rounded-t-3xl flex flex-col p-0"
      >
        {/* Visually hidden title for accessibility */}
        <SheetTitle className="sr-only">Navigation Menu</SheetTitle>

        {/* Top drag indicator */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
        </div>

        {/* Quick Action Icons */}
        <div className="flex justify-center gap-4 px-4 py-4">
          {/* 1. New Chat */}
          <Button
            variant="ghost"
            size="icon"
            className="h-14 w-14 rounded-full border border-border bg-background hover:bg-muted"
            onClick={handleNewChat}
          >
            <WriteIcon className="size-5" />
          </Button>

          {/* 2. Workflow */}
          <Button
            variant="ghost"
            size="icon"
            className="h-14 w-14 rounded-full border border-border bg-background hover:bg-muted"
            onClick={() => handleNavigate("/workflow")}
          >
            <Waypoints className="size-5" />
          </Button>

          {/* 3. Agent (normal users) or Admin (admin users) */}
          {isAdmin ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-14 w-14 rounded-full border border-border bg-background hover:bg-muted flex flex-col gap-0.5"
              onClick={() => handleNavigate("/admin")}
            >
              <Shield className="size-4" />
              <span className="text-[9px]">Admin</span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-14 w-14 rounded-full border border-border bg-background hover:bg-muted"
              onClick={() => handleNavigate("/agents")}
            >
              <Bot className="size-5" />
            </Button>
          )}

          {/* 4. MCP */}
          <Button
            variant="ghost"
            size="icon"
            className="h-14 w-14 rounded-full border border-border bg-background hover:bg-muted"
            onClick={() => handleNavigate("/mcp")}
          >
            <MCPIcon className="size-5 fill-foreground" />
          </Button>

          {/* 5. Plans */}
          <Button
            variant="ghost"
            size="icon"
            className="h-14 w-14 rounded-full border border-[#3d9e8c]/40 bg-[#3d9e8c]/10 hover:bg-[#3d9e8c]/20"
            onClick={() => handleNavigate("/plans")}
            data-testid="mobile-plans-link"
          >
            <Sparkles className="size-5 text-[#3d9e8c]" />
          </Button>
        </div>

        {/* History Section */}
        <div className="flex-1 overflow-y-auto px-4">
          <h2 className="text-xl font-semibold mb-4">History</h2>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 bg-muted rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : threadGroupByDate.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              {t("noConversationsYet")}
            </p>
          ) : (
            threadGroupByDate.map((group) => (
              <div key={group.label} className="mb-6">
                <h3 className="text-xs text-muted-foreground mb-2">
                  {group.label}
                </h3>
                <div className="space-y-1">
                  {group.threads.map((thread) => (
                    <div
                      key={thread.id}
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-xl transition-colors group/thread",
                        currentThreadId === thread.id
                          ? "bg-muted"
                          : "hover:bg-muted/50",
                      )}
                    >
                      <Link
                        href={`/chat/${thread.id}`}
                        onClick={() => onOpenChange(false)}
                        className="flex-1 min-w-0"
                      >
                        {generatingTitleThreadIds.includes(thread.id) ? (
                          <TextShimmer className="truncate text-sm">
                            {thread.title || "New Chat"}
                          </TextShimmer>
                        ) : (
                          <p className="truncate text-sm">
                            {thread.title || "New Chat"}
                          </p>
                        )}
                      </Link>
                      <ThreadDropdown
                        threadId={thread.id}
                        beforeTitle={thread.title}
                        side="left"
                        align="start"
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-50 hover:opacity-100 data-[state=open]:opacity-100 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </ThreadDropdown>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* User Footer */}
        {user && (
          <SheetFooter className="border-t p-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-muted transition-colors">
                  <Avatar className="h-8 w-8 rounded-full border">
                    <AvatarImage
                      src={getUserAvatar(user)}
                      alt={user.name || "User"}
                    />
                    <AvatarFallback>
                      {user.name?.slice(0, 1) || ""}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm truncate flex-1 text-left">
                    {user.email}
                  </span>
                  <ChevronsUpDown className="size-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-64">
                {/* MCP Configuration */}
                <DropdownMenuItem
                  onClick={() => handleNavigate("/mcp")}
                  className="cursor-pointer"
                >
                  <MCPIcon className="size-4 fill-foreground mr-2" />
                  <span>{t("mcpConfiguration")}</span>
                </DropdownMenuItem>

                {/* Archive */}
                <DropdownMenuItem
                  onClick={() => handleNavigate("/archive")}
                  className="cursor-pointer"
                >
                  <FolderOpenIcon className="size-4 mr-2" />
                  <span>Archive</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={() => {
                    onOpenChange(false);
                    storeMutate({ openCustomize: true });
                  }}
                  className="cursor-pointer"
                >
                  <SlidersHorizontal className="size-4 mr-2" />
                  <span>Customize</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {/* Chat Preferences */}
                <DropdownMenuItem
                  onClick={() => {
                    onOpenChange(false);
                    storeMutate({ openChatPreferences: true });
                  }}
                  className="cursor-pointer"
                >
                  <Settings2 className="size-4 mr-2" />
                  <span>{t("chatPreferences")}</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {/* Keyboard Shortcuts */}
                <DropdownMenuItem
                  onClick={() => {
                    onOpenChange(false);
                    storeMutate({ openShortcutsPopup: true });
                  }}
                  className="cursor-pointer"
                >
                  <Command className="size-4 mr-2" />
                  <span>{t("keyboardShortcuts")}</span>
                </DropdownMenuItem>

                {/* Report an Issue */}
                <DropdownMenuItem
                  onClick={() => {
                    window.open(
                      "https://github.com/Flare-Labs/flare-ai/issues/new",
                      "_blank",
                    );
                  }}
                  className="cursor-pointer"
                >
                  <GithubIcon className="size-4 fill-foreground mr-2" />
                  <span>{t("reportAnIssue")}</span>
                </DropdownMenuItem>

                {/* Join Community */}
                <DropdownMenuItem
                  onClick={() => {
                    window.open("https://t.me/VoidzeroX", "_blank");
                  }}
                  className="cursor-pointer"
                >
                  <TelegramIcon className="size-4 fill-foreground mr-2" />
                  <span>{t("joinCommunity")}</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {/* User Settings */}
                <DropdownMenuItem
                  onClick={() => {
                    onOpenChange(false);
                    storeMutate({ openUserSettings: true });
                  }}
                  className="cursor-pointer"
                >
                  <Settings className="size-4 mr-2" />
                  <span>User Settings</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {/* Sign Out */}
                <DropdownMenuItem
                  onClick={() => {
                    authClient.signOut().finally(() => {
                      window.location.href = "/sign-in";
                    });
                  }}
                  className="cursor-pointer"
                >
                  <LogOutIcon className="size-4 mr-2" />
                  <span>{t("signOut")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";
import {
  AudioWaveformIcon,
  ChevronDown,
  Ghost,
  MessageCircleDashed,
  PanelLeft,
} from "lucide-react";
import { Button } from "ui/button";
import { Separator } from "ui/separator";

import { useEffect, useMemo, useState } from "react";
import { ThreadDropdown } from "../thread-dropdown";
import { appStore } from "@/app/store";
import { usePathname, useSearchParams } from "next/navigation";
import { useShallow } from "zustand/shallow";
import { getShortcutKeyList, Shortcuts } from "lib/keyboard-shortcuts";
import { useTranslations } from "next-intl";
import { TextShimmer } from "ui/text-shimmer";
import { buildReturnUrl } from "lib/admin/navigation-utils";
import { BackButton } from "@/components/layouts/back-button";
import { MobileSidebarSheet } from "./mobile-sidebar-sheet";
import { BasicUser } from "app-types/user";
import { UpgradePlanButton } from "@/components/payments/dodo/upgrade-plan-button";
import {
  normalizeSubscriptionTier,
  subscriptionTiersInfo,
} from "app-types/subscription";

export function AppHeader({ user }: { user?: BasicUser }) {
  const t = useTranslations();
  const [appStoreMutate] = appStore(useShallow((state) => [state.mutate]));
  const currentPaths = usePathname();
  const searchParams = useSearchParams();
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  const showActionButtons = useMemo(() => {
    if (currentPaths.startsWith("/admin")) {
      return false;
    }
    return true;
  }, [currentPaths]);

  const showUpgradeButton = useMemo(() => {
    if (currentPaths.startsWith("/admin")) return false;
    const tier = normalizeSubscriptionTier(user?.tier);
    const isPaidUser = subscriptionTiersInfo[tier].pricePerMonthInr > 0;
    if (isPaidUser) return false;
    return currentPaths === "/dashboard" || currentPaths.startsWith("/chat/");
  }, [currentPaths, user?.tier]);

  const componentByPage = useMemo(() => {
    if (currentPaths.startsWith("/chat/")) {
      return <ThreadDropdownComponent />;
    }
    if (
      currentPaths.startsWith("/admin/users/") &&
      currentPaths.split("/").length > 3
    ) {
      const searchPageParams = searchParams.get("searchPageParams");
      const returnUrl = buildReturnUrl("/admin/users", searchPageParams || "");
      return (
        <BackButton
          data-testid="admin-users-back-button"
          returnUrl={returnUrl}
          title={t("Admin.Users.backToUsers")}
        />
      );
    }
  }, [currentPaths, searchParams]);

  return (
    <header className="sticky top-0 z-50 flex items-center px-3 py-2 relative">
      {/* Mobile Sidebar Toggle (The "Sidecar as image" pill) */}
      <div className="md:hidden">
        <Button
          variant="ghost"
          className="group rounded-full bg-zinc-900 text-white hover:bg-zinc-800 h-8 px-3 gap-2"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMobileSheetOpen(true);
          }}
        >
          <PanelLeft className="size-4 opacity-0 group-hover:opacity-100 transition-opacity" />
          <span className="font-medium text-sm">Flare AI</span>
          <ChevronDown className="size-3" />
        </Button>
      </div>

      {/* Mobile Sidebar Sheet */}
      <MobileSidebarSheet
        open={mobileSheetOpen}
        onOpenChange={setMobileSheetOpen}
        user={user}
      />

      {showUpgradeButton && (
        <div className="absolute left-1/2 -translate-x-1/2 hidden md:block">
          <UpgradePlanButton />
        </div>
      )}

      {componentByPage}
      <div className="flex-1" />
      {showActionButtons && (
        <>
          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size={"sm"}
                  variant={"ghost"}
                  className="group relative rounded-full px-4 overflow-hidden bg-secondary/40 h-9"
                  onClick={() => {
                    appStoreMutate((state) => ({
                      voiceChat: {
                        ...state.voiceChat,
                        isOpen: true,
                        agentId: undefined,
                      },
                    }));
                  }}
                >
                  <span
                    className="absolute inset-0 opacity-0 transition-opacity duration-700 bg-[linear-gradient(90deg,#131313_0%,#0A2156_33%,#BED2FF_66%,#FF8717_100%)] group-hover:opacity-100 group-active:opacity-100 rounded-full shadow-[inset_0px_0px_12px_2px_rgba(255,255,255,0.5)]"
                    style={{
                      backgroundPosition: "var(--x, 50%) 0%",
                      backgroundSize: "200% 100%",
                    }}
                    aria-hidden="true"
                  ></span>
                  <div className="relative z-10 flex items-center gap-2">
                    <AudioWaveformIcon className="size-4" />
                    <span className="font-medium text-xs">KonvO</span>
                  </div>
                </Button>
              </TooltipTrigger>
              <TooltipContent align="end" side="bottom">
                <div className="text-xs flex items-center gap-2">
                  {t("KeyboardShortcuts.toggleVoiceChat")}
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    {getShortcutKeyList(Shortcuts.toggleVoiceChat).map(
                      (key) => (
                        <span
                          className="w-5 h-5 flex items-center justify-center bg-muted rounded "
                          key={key}
                        >
                          {key}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size={"icon"}
                  variant={"secondary"}
                  className="bg-secondary/40"
                  onClick={() => {
                    appStoreMutate((state) => ({
                      temporaryChat: {
                        ...state.temporaryChat,
                        isOpen: !state.temporaryChat.isOpen,
                      },
                    }));
                  }}
                >
                  <MessageCircleDashed className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent align="end" side="bottom">
                <div className="text-xs flex items-center gap-2">
                  {t("KeyboardShortcuts.toggleTemporaryChat")}
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    {getShortcutKeyList(Shortcuts.toggleTemporaryChat).map(
                      (key) => (
                        <span
                          className="w-5 h-5 flex items-center justify-center bg-muted rounded "
                          key={key}
                        >
                          {key}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Mobile Actions (Ghost Pill) */}
          <div className="md:hidden">
            <div className="flex items-center rounded-full bg-zinc-900 text-white h-8 px-1">
              {/* Ghost Button (Temp Chat) */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-white/10 text-white hover:text-white rounded-full"
                onClick={() => {
                  appStoreMutate((state) => ({
                    temporaryChat: {
                      ...state.temporaryChat,
                      isOpen: !state.temporaryChat.isOpen,
                    },
                  }));
                }}
              >
                <Ghost className="size-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </header>
  );
}

function ThreadDropdownComponent() {
  const [threadList, currentThreadId, generatingTitleThreadIds] = appStore(
    useShallow((state) => [
      state.threadList,
      state.currentThreadId,
      state.generatingTitleThreadIds,
    ]),
  );
  const currentThread = useMemo(() => {
    return threadList.find((thread) => thread.id === currentThreadId);
  }, [threadList, currentThreadId]);

  useEffect(() => {
    if (currentThread?.id) {
      document.title = currentThread.title || "New Chat";
    }
  }, [currentThread?.id]);

  if (!currentThread) return null;

  return (
    <div className="items-center gap-1 hidden md:flex">
      <div className="w-1 h-4">
        <Separator orientation="vertical" />
      </div>

      <ThreadDropdown
        threadId={currentThread.id}
        beforeTitle={currentThread.title}
      >
        <div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className="data-[state=open]:bg-input! hover:text-foreground cursor-pointer flex gap-1 items-center px-2 py-1 rounded-md hover:bg-accent"
              >
                {generatingTitleThreadIds.includes(currentThread.id) ? (
                  <TextShimmer className="truncate max-w-60 min-w-0 mr-1">
                    {currentThread.title || "New Chat"}
                  </TextShimmer>
                ) : (
                  <p className="truncate max-w-60 min-w-0 mr-1">
                    {currentThread.title || "New Chat"}
                  </p>
                )}

                <ChevronDown size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[200px] p-4 break-all overflow-y-auto max-h-[200px]">
              {currentThread.title || "New Chat"}
            </TooltipContent>
          </Tooltip>
        </div>
      </ThreadDropdown>
    </div>
  );
}

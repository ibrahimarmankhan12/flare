"use client";

import { appStore } from "@/app/store";
import {
  SavedNotesContent,
  SkillsContent,
  UserInstructionsContent,
} from "@/components/chat-preferences-content";
import { useEffect, useMemo, useState } from "react";
import { AutoHeight } from "ui/auto-height";
import { useShallow } from "zustand/shallow";
import { Button } from "ui/button";
import { Code2, NotebookPen, SlidersHorizontal, X } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerPortal,
  DrawerTitle,
} from "ui/drawer";

export function CustomizePopup() {
  const [openCustomize, appStoreMutate] = appStore(
    useShallow((state) => [state.openCustomize, state.mutate]),
  );

  const tabs = useMemo(
    () => [
      {
        label: "System Preference",
        icon: <SlidersHorizontal className="w-4 h-4" />,
      },
      {
        label: "Skills",
        icon: <Code2 className="w-4 h-4" />,
      },
      {
        label: "Saved Notes",
        icon: <NotebookPen className="w-4 h-4" />,
      },
    ],
    [],
  );

  const [tab, setTab] = useState(0);

  useEffect(() => {
    if (!openCustomize) {
      setTab(0);
    }
  }, [openCustomize]);

  return (
    <Drawer
      handleOnly
      open={openCustomize}
      direction="top"
      onOpenChange={(open) => appStoreMutate({ openCustomize: open })}
    >
      <DrawerPortal>
        <DrawerContent
          style={{ userSelect: "text" }}
          className="max-h-[100vh]! w-full h-full border-none rounded-none flex flex-col bg-card overflow-hidden p-4 md:p-6"
        >
          <div className="flex items-center justify-end">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => appStoreMutate({ openCustomize: false })}
            >
              <X />
            </Button>
          </div>
          <DrawerTitle className="sr-only">Customize</DrawerTitle>
          <DrawerDescription className="sr-only" />

          <div className="flex justify-center">
            <div className="w-full mt-4 lg:w-5xl lg:mt-14">
              <div className="md:hidden">
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {tabs.map((tabItem, index) => (
                    <button
                      key={tabItem.label}
                      onClick={() => setTab(index)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                        tab === index
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tabItem.icon}
                      <span>{tabItem.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-1 overflow-hidden">
                <div className="hidden md:block w-64">
                  <nav className="px-4 flex flex-col gap-2">
                    {tabs.map((tabItem, index) => (
                      <button
                        key={tabItem.label}
                        onClick={() => setTab(index)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all duration-200 ${
                          tab === index
                            ? "bg-primary text-primary-foreground shadow-md"
                            : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {tabItem.icon}
                        <span className="font-medium">{tabItem.label}</span>
                      </button>
                    ))}
                  </nav>
                </div>

                <AutoHeight className="flex-1 rounded-lg border max-h-[80vh] overflow-y-auto">
                  <div className="p-4 md:p-8">
                    {openCustomize && (
                      <>
                        {tab === 0 ? (
                          <UserInstructionsContent />
                        ) : tab === 1 ? (
                          <SkillsContent />
                        ) : tab === 2 ? (
                          <SavedNotesContent />
                        ) : null}
                      </>
                    )}
                  </div>
                </AutoHeight>
              </div>
            </div>
          </div>
        </DrawerContent>
      </DrawerPortal>
    </Drawer>
  );
}

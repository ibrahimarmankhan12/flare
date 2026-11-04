"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "ui/button";
import { MessageSquareQuote } from "lucide-react";
import { appStore } from "@/app/store";
import { createPortal } from "react-dom";

interface Position {
  x: number;
  y: number;
}

export function TextSelectionPopup() {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState("");
  const popupRef = useRef<HTMLDivElement>(null);

  const handleSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (!text || text.length === 0) {
      setIsVisible(false);
      return;
    }

    // Check if the selection is within an assistant message
    const anchorNode = selection?.anchorNode;
    const focusNode = selection?.focusNode;

    const isInAssistantMessage = (node: Node | null): boolean => {
      if (!node) return false;
      let current: Node | null = node;
      while (current) {
        if (current instanceof Element) {
          // Check if within message content and it's not a user message
          const messageContent = current.closest(
            '[data-testid="message-content"]',
          );
          const userMessage = current.closest(
            ".group-data-\\[role\\=user\\]\\/message",
          );
          if (messageContent && !userMessage) {
            // Also make sure we're in an assistant context (not inside user message bubble)
            const closestMessage = current.closest(".group\\/message");
            if (
              closestMessage &&
              !closestMessage.querySelector(".bg-accent.text-accent-foreground")
            ) {
              return true;
            }
            return true;
          }
        }
        current = current.parentNode;
      }
      return false;
    };

    // Both anchor and focus should be in assistant message
    if (
      !isInAssistantMessage(anchorNode ?? null) ||
      !isInAssistantMessage(focusNode ?? null)
    ) {
      setIsVisible(false);
      return;
    }

    // Get the range and position
    const range = selection?.getRangeAt(0);
    if (!range) return;

    const rect = range.getBoundingClientRect();

    // Position above the selection
    setPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
    });
    setSelectedText(text);
    setIsVisible(true);
  }, []);

  const handleAskFlare = useCallback(() => {
    if (!selectedText) return;

    appStore.setState({
      replyingTo: {
        text: selectedText,
      },
    });

    // Clear the selection
    window.getSelection()?.removeAllRanges();
    setIsVisible(false);
  }, [selectedText]);

  useEffect(() => {
    const handleMouseUp = () => {
      // Small delay to ensure selection is complete
      setTimeout(handleSelection, 10);
    };

    const handleMouseDown = (e: MouseEvent) => {
      // Hide popup if clicking outside of it
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setIsVisible(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsVisible(false);
        window.getSelection()?.removeAllRanges();
      }
    };

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleSelection]);

  if (!isVisible || typeof window === "undefined") return null;

  return createPortal(
    <div
      ref={popupRef}
      className="fixed z-[100] animate-in fade-in zoom-in-95 duration-150"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: "translate(-50%, -100%)",
      }}
    >
      <Button
        variant="secondary"
        size="sm"
        onClick={handleAskFlare}
        className="shadow-lg border border-border/50 bg-background hover:bg-accent gap-2 px-3 py-1.5 h-auto text-xs font-medium"
      >
        <MessageSquareQuote className="size-3.5" />
        <span>Ask Flare</span>
      </Button>
    </div>,
    document.body,
  );
}

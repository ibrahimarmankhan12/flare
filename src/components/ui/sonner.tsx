"use client";

import { useTheme } from "next-themes";
import { useMemo } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();
  const themeBase = useMemo(() => {
    return resolvedTheme === "dark" ? "dark" : "light";
  }, [resolvedTheme]);
  return (
    <Sonner
      theme={themeBase as ToasterProps["theme"]}
      className="toaster group "
      {...props}
    />
  );
};

export { Toaster };

"use client";
import {
  MCPRemoteConfigZodSchema,
  MCPServerConfig,
  MCPStdioConfigZodSchema,
} from "app-types/mcp";
import {
  isMaybeMCPServerConfig,
  isMaybeRemoteConfig,
  isMaybeStdioConfig,
} from "lib/ai/mcp/is-mcp-config";
import {
  extractSingleMCPServerConfig,
  safeJSONCParse,
} from "lib/ai/mcp/mcp-config-parser";
import { validateMcpServerConfig } from "lib/ai/mcp/validate-mcp-server-config";
import { IS_MCP_SERVER_REMOTE_ONLY } from "lib/const";
import { createDebounce, fetcher, isNull } from "lib/utils";
import { Loader } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import { safe } from "ts-safe";
import { handleErrorWithToast } from "ui/shared-toast";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import JsonView from "./ui/json-view";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

import { existMcpClientByServerNameAction } from "@/app/api/mcp/actions";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "ui/alert";
import { z } from "zod";

interface MCPEditorProps {
  initialConfig?: MCPServerConfig;
  name?: string;
  id?: string;
}

const STDIO_ARGS_ENV_PLACEHOLDER = `{
  "command": "node",
  "args": ["index.js"],
  "env": {
    "OPENAI_API_KEY": "sk-..."
  }
}

// Remote server example:
// {
//   "url": "https://api.example.com/mcp",
//   "headers": {
//     "Authorization": "Bearer sk-..."
//   }
// }`;

const REMOTE_ONLY_PLACEHOLDER = `{
  "url": "https://mcp.example.com/sse",
  "headers": {
    "Authorization": "Bearer YOUR_API_KEY"
  }
}`;

export default function MCPEditor({
  initialConfig,
  name: initialName,
  id,
}: MCPEditorProps) {
  const t = useTranslations();
  const shouldInsert = useMemo(() => isNull(id), [id]);

  const [isLoading, setIsLoading] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const isRemoteOnly = IS_MCP_SERVER_REMOTE_ONLY;

  const errorDebounce = useMemo(() => createDebounce(), []);

  // State for form fields
  const [name, setName] = useState<string>(initialName ?? "");
  const router = useRouter();
  const [config, setConfig] = useState<MCPServerConfig>(
    initialConfig as MCPServerConfig,
  );
  const [jsonString, setJsonString] = useState<string>(
    initialConfig ? JSON.stringify(initialConfig, null, 2) : "",
  );
  const configPlaceholder = isRemoteOnly
    ? REMOTE_ONLY_PLACEHOLDER
    : STDIO_ARGS_ENV_PLACEHOLDER;

  // Name validation schema
  const nameSchema = z.string().regex(/^[a-zA-Z0-9\-]+$/, {
    message: t("MCP.nameMustContainOnlyAlphanumericCharactersAndHyphens"),
  });

  const validateName = (nameValue: string): boolean => {
    const result = nameSchema.safeParse(nameValue);
    if (!result.success) {
      setNameError(
        t("MCP.nameMustContainOnlyAlphanumericCharactersAndHyphens"),
      );
      return false;
    }
    setNameError(null);
    return true;
  };

  const saveDisabled = useMemo(() => {
    return (
      name.trim() === "" ||
      isLoading ||
      !!jsonError ||
      !!nameError ||
      !isMaybeMCPServerConfig(config) ||
      (isRemoteOnly && isMaybeStdioConfig(config))
    );
  }, [isLoading, jsonError, nameError, config, name, isRemoteOnly]);

  // Validate
  const validateConfig = (jsonConfig: unknown): boolean => {
    const result = isMaybeRemoteConfig(jsonConfig)
      ? MCPRemoteConfigZodSchema.safeParse(jsonConfig)
      : MCPStdioConfigZodSchema.safeParse(jsonConfig);
    if (!result.success) {
      handleErrorWithToast(result.error, "mcp-editor-error");
      return false;
    }
    try {
      validateMcpServerConfig(result.data);
      return true;
    } catch (error) {
      handleErrorWithToast(error as Error, "mcp-editor-error");
      return false;
    }
  };

  // Handle save button click
  const handleSave = async () => {
    if (isRemoteOnly && isMaybeStdioConfig(config)) {
      return handleErrorWithToast(
        new Error(
          "This deployment only supports remote MCP servers. Use an HTTP/S MCP endpoint instead of a local command.",
        ),
        "mcp-editor-error",
      );
    }
    // Perform validation
    if (!validateConfig(config)) return;
    if (!name) {
      return handleErrorWithToast(
        new Error(t("MCP.nameIsRequired")),
        "mcp-editor-error",
      );
    }

    if (!validateName(name)) {
      return handleErrorWithToast(
        new Error(t("MCP.nameMustContainOnlyAlphanumericCharactersAndHyphens")),
        "mcp-editor-error",
      );
    }

    safe(() => setIsLoading(true))
      .map(async () => {
        if (shouldInsert) {
          const exist = await existMcpClientByServerNameAction(name);
          if (exist) {
            throw new Error(t("MCP.nameAlreadyExists"));
          }
        }
      })
      .map(() =>
        fetcher("/api/mcp", {
          method: "POST",
          body: JSON.stringify({
            name,
            config,
            id,
          }),
        }),
      )
      .ifOk(() => {
        toast.success(t("MCP.configurationSavedSuccessfully"));
        mutate("/api/mcp/list");
        router.push("/mcp");
      })
      .ifFail(handleErrorWithToast)
      .watch(() => setIsLoading(false));
  };

  const handleConfigChange = (data: string) => {
    setJsonString(data);
    const result = safeJSONCParse<unknown>(data);
    errorDebounce.clear();
    if (result.success) {
      const extracted = extractSingleMCPServerConfig(result.value);
      if (extracted) {
        setConfig(extracted.config);
        if (!initialName && !name && extracted.name) {
          setName(extracted.name);
          validateName(extracted.name);
        }
        setJsonError(null);
      } else {
        errorDebounce(() => {
          setJsonError(
            'Invalid MCP config. Use a single server object with either "command" or "url".',
          );
        }, 1000);
      }
    } else if (data.trim() !== "") {
      errorDebounce(() => {
        setJsonError(
          (result.error as Error)?.message ??
            JSON.stringify(result.error, null, 2),
        );
      }, 1000);
    }
  };

  return (
    <>
      <div className="flex flex-col space-y-6">
        {/* Name field */}
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>

          <Input
            id="name"
            value={name}
            disabled={!shouldInsert}
            onChange={(e) => {
              setName(e.target.value);
              if (e.target.value) validateName(e.target.value);
            }}
            placeholder={t("MCP.enterMcpServerName")}
            className={nameError ? "border-destructive" : ""}
          />
          {nameError && <p className="text-xs text-destructive">{nameError}</p>}
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="config">Config</Label>
          </div>

          {/* Split view for config editor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Left side: Textarea for editing */}
            <div className="space-y-2">
              <Textarea
                id="config-editor"
                value={jsonString}
                onChange={(e) => handleConfigChange(e.target.value)}
                data-testid="mcp-config-editor"
                className="font-mono h-[40vh] resize-none overflow-y-auto"
                placeholder={configPlaceholder}
              />
            </div>

            {/* Right side: JSON view */}
            <div className="space-y-2 hidden sm:block">
              <div className="border border-input rounded-md p-4 h-[40vh] overflow-auto relative bg-secondary">
                <Label
                  htmlFor="config-view"
                  className="text-xs text-muted-foreground mb-2"
                >
                  preview
                </Label>
                <JsonView
                  data={config}
                  initialExpandDepth={3}
                  data-testid="mcp-config-view"
                />
                {jsonError && jsonString && (
                  <div className="absolute w-full bottom-0 right-0 px-2 pb-2 animate-in fade-in-0 duration-300">
                    <Alert variant="destructive" className="border-destructive">
                      <AlertTitle className="text-xs font-semibold">
                        Parsing Error
                      </AlertTitle>
                      <AlertDescription className="text-xs">
                        {jsonError}
                      </AlertDescription>
                    </Alert>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {isRemoteOnly && isMaybeStdioConfig(config) && (
          <Alert variant="destructive">
            <AlertTitle>Local commands are disabled</AlertTitle>
            <AlertDescription className="text-sm">
              This deployment only accepts remote MCP endpoints. Use an HTTP/S
              MCP server or run Flare in a self-hosted environment to connect
              to stdio servers such as Playwright.
            </AlertDescription>
          </Alert>
        )}

        {/* Save button */}
        <Button onClick={handleSave} className="w-full" disabled={saveDisabled}>
          {isLoading ? (
            <Loader className="size-4 animate-spin" />
          ) : (
            <span className="font-bold">{t("MCP.saveConfiguration")}</span>
          )}
        </Button>
      </div>
    </>
  );
}

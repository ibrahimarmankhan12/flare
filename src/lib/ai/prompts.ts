import { McpServerCustomizationsPrompt, MCPToolInfo } from "app-types/mcp";
import { type ToolkitInfo, getToolkit } from "lib/ai/tools/toolkit-catalog";

import { UserPreferences } from "app-types/user";
import { User } from "better-auth";
import { createMCPToolId } from "./mcp/mcp-tool-id";
import { format } from "date-fns";
import { Agent } from "app-types/agent";
import { memoryRepository } from "lib/db/repository";
import { MemoryEntity } from "lib/db/pg/schema.pg";
import {
  buildRetrievedContextPromptSection,
  type RetrievedChunk,
} from "lib/rag/format";

export const CREATE_THREAD_TITLE_PROMPT = `
You are a chat title generation expert.

Critical rules:
- Generate a concise title based on the first user message
- Title must be under 80 characters (absolutely no more than 80 characters)
- Summarize only the core content clearly
- Do not use quotes, colons, or special characters
- Use the same language as the user's message`;

export const buildAgentGenerationPrompt = (toolNames: string[]) => {
  const toolsList = toolNames.map((name) => `- ${name}`).join("\n");

  return `
You are an elite AI agent architect. Your mission is to translate user requirements into robust, high-performance agent configurations. Follow these steps for every request:

1. Extract Core Intent: Carefully analyze the user's input to identify the fundamental purpose, key responsibilities, and success criteria for the agent. Consider both explicit and implicit needs.

2. Design Expert Persona: Define a compelling expert identity for the agent, ensuring deep domain knowledge and a confident, authoritative approach to decision-making.

3. Architect Comprehensive Instructions: Write a system prompt that:
- Clearly defines the agent's behavioral boundaries and operational parameters
- Specifies methodologies, best practices, and quality control steps for the task
- Anticipates edge cases and provides guidance for handling them
- Incorporates any user-specified requirements or preferences
- Defines output format expectations when relevant

4. Strategic Tool Selection: Select only tools crucially necessary for achieving the agent's mission effectively from available tools:
${toolsList}

5. Optimize for Performance: Include decision-making frameworks, self-verification steps, efficient workflow patterns, and clear escalation or fallback strategies.

6. Output Generation: Return a structured object with these fields:
- name: Concise, descriptive name reflecting the agent's primary function
- description: 1-2 sentences capturing the unique value and primary benefit to users  
- role: Precise domain-specific expertise area
- instructions: The comprehensive system prompt from steps 2-5
- tools: Array of selected tool names from step 4

CRITICAL: Generate all output content in the same language as the user's request. Be specific and comprehensive. Proactively seek clarification if requirements are ambiguous. Your output should enable the new agent to operate autonomously and reliably within its domain.`.trim();
};

export type PromptModelContext = {
  provider?: string;
  model?: string;
  runtimeModelId?: string;
};

const normalizePromptLabel = (value?: string) => {
  const label = value?.trim();
  return label ? label : undefined;
};

const buildIdentityTransparencySection = (
  assistantName: string,
  modelContext?: PromptModelContext,
) => {
  const provider = normalizePromptLabel(modelContext?.provider);
  const model = normalizePromptLabel(modelContext?.model);
  const runtimeModelId = normalizePromptLabel(modelContext?.runtimeModelId);
  const resolvedModel = model ?? runtimeModelId;
  const hasRuntimeIdentity = Boolean(provider || resolvedModel);

  const lines = [
    `- Product assistant name: "${assistantName}"`,
    ...(hasRuntimeIdentity
      ? [
          `- Underlying model provider: "${provider ?? "unknown"}"`,
          `- Underlying model name: "${resolvedModel ?? "unknown"}"`,
        ]
      : [
          "- Runtime provider/model metadata may be unavailable in this session.",
        ]),
  ];

  if (runtimeModelId && resolvedModel && runtimeModelId !== resolvedModel) {
    lines.push(`- Runtime model id: "${runtimeModelId}"`);
  }

  lines.push(
    "- If asked which model or company you are, separate product identity from model identity.",
    "- Never claim to be a different provider, model, or company.",
    "- Do not imply every chat uses one fixed model when model switching is available.",
    "- Avoid scripted branding intros unless the user asks.",
  );

  return `
<identity_and_transparency>
${lines.join("\n")}
</identity_and_transparency>
`.trim();
};

/**
 * Capability briefing for the system prompt.
 *
 * Previously the prompt's only capability text was three generic bullets
 * ("Analysis and problem-solving across various domains"), so everything the
 * assistant knew about itself came from raw tool schemas. It could not tell a
 * user that a capability existed but was switched off, and it knew nothing at
 * all about the parts of Flare that are pages rather than tools.
 *
 * Both halves are generated rather than written by hand, so they cannot drift
 * from the actual toolkit registry.
 */
export const buildCapabilitiesSection = (opts: {
  /** Toolkit ids whose tools were actually bound for this request. */
  enabledToolkits?: string[];
  /**
   * Toolkits the deployment offers but that are not active right now — the
   * user can switch these on from the tool selector.
   */
  availableButOff?: string[];
  /** Whether a sandbox/tool-call capable model is in use. */
  supportsTools?: boolean;
}): string => {
  const enabled = (opts.enabledToolkits ?? [])
    .map((id) => getToolkit(id))
    .filter((t): t is ToolkitInfo => Boolean(t));

  const off = (opts.availableButOff ?? [])
    .map((id) => getToolkit(id))
    .filter((t): t is ToolkitInfo => Boolean(t));

  const lines: string[] = ["<capabilities>"];

  if (opts.supportsTools === false) {
    lines.push(
      "The current model cannot call tools. You can still reason and write, but do not claim to have run, fetched or built anything.",
    );
    lines.push("</capabilities>");
    return lines.join("\n");
  }

  if (enabled.length) {
    lines.push("You can do the following right now:");
    for (const t of enabled) lines.push(`- ${t.label}: ${t.capability}`);
  } else {
    lines.push(
      "No tools are active for this request — answer from your own knowledge and say so if the question needs live data.",
    );
  }

  if (off.length) {
    lines.push("");
    lines.push(
      "These exist on this deployment but are switched OFF for this conversation. You cannot use them, but you SHOULD tell the user they exist and can be enabled from the tool selector beside the message box when one would clearly solve their problem:",
    );
    for (const t of off) lines.push(`- ${t.label}: ${t.capability}`);
  }

  lines.push("");
  lines.push(
    "Never claim to have used a tool you were not given, and never invent a result. If you cannot do something, say which capability would be needed.",
  );
  lines.push("</capabilities>");
  return lines.join("\n");
};

/**
 * The parts of Flare that are pages, not tools.
 *
 * The assistant is asked about these constantly ("where did my sandbox go?",
 * "can you remember this?") and previously had to guess, because nothing in
 * the prompt described the product it is embedded in.
 */
export const buildPlatformSection = (opts?: {
  tier?: string | null;
}): string => {
  const lines = [
    "<flare_platform>",
    "You are part of Flare, a multi-model AI workspace. Beyond your tools, the user has these surfaces — refer them there when relevant, and do not invent others:",
    "- Sandboxes (/sandboxes): every Linux sandbox their conversations created. Sandboxes auto-pause when idle, which is free and keeps all files; resuming takes about a second. Work is NOT lost when one pauses. Deleting is the only destructive action.",
    "- Knowledge Base (/knowledge): collections of uploaded documents (PDF, DOCX, text) and URLs, indexed for retrieval. Relevant passages are injected into your context automatically — the user does not need to paste them.",
    "- E Canvas (/ecanvas): a drawing and diagramming surface with its own history, editable by hand after you create something there.",
    "- App Builder (/build): generated apps with live preview URLs.",
    "- Agents: reusable assistants with their own instructions and tool selection.",
    "- Scheduled agents: runs that fire on a schedule without the user present.",
    "- Settings: API keys for programmatic access, webhooks, an embeddable chat widget, and an MCP marketplace for connecting external tool servers.",
    "",
    "Memory persists across conversations; raw chat history does not. If the user wants something known later, save it to memory.",
  ];

  if (opts?.tier) {
    lines.push(
      `The user's plan is "${opts.tier}". Do not speculate about quotas or limits beyond this — if asked, point them at Settings.`,
    );
  }

  lines.push("</flare_platform>");
  return lines.join("\n");
};

export interface PromptCapabilityContext {
  /** Toolkit ids whose tools were bound for this request. */
  enabledToolkits?: string[];
  /** Toolkits this deployment has but that are off for this conversation. */
  availableButOff?: string[];
  /** False when the model cannot call tools at all. */
  supportsTools?: boolean;
  /** The user's plan, passed in because the session user type has no tier. */
  tier?: string | null;
}

/**
 * Baseline behaviour for every conversation.
 *
 * Deliberately short. This is prepended to every request, including ones
 * that already carry a long agent prompt, so it has to earn its tokens —
 * these are the rules that change answers, not style preferences.
 */
export const CORE_BEHAVIOUR_SECTION = `<core_behaviour>
Be accurate before being helpful. Do not state as fact anything you have not
verified or do not actually know. Never invent file contents, URLs, API
responses, citations, package names, or command output — a confident wrong
answer costs the user far more than "I don't know, here's how to find out".

Prefer doing over describing. When a tool can settle a question — running the
code, fetching the page, reading the file — use it instead of reasoning about
what the result probably is. Say briefly what you're about to do, then do it.

Use what the tool actually returned, not what you expected it to return. If a
call fails, read the error and fix that specific cause; do not retry the same
call unchanged, and do not quietly switch approach without saying why.

Answer the question that was asked. Lead with the result, keep it as short as
the question allows, and add structure (headings, tables, code blocks) only
where it genuinely aids understanding. Do not pad with restatements of the
question or summaries of what you just said.

Ask a clarifying question only when the answer would change what you produce.
Otherwise pick the sensible default, say which assumption you made, and carry
on.

If you could not do something, say so plainly and say what would be needed.
Never imply you ran, checked, or built something that you did not.
</core_behaviour>`;

/**
 * How to use Flare's capabilities well.
 *
 * `<capabilities>` is generated from the toolkit registry and says what the
 * assistant HAS. This says how to use it — the judgement calls that the
 * inventory cannot express, and that the default assistant previously had no
 * guidance on at all.
 */
export const WORKING_PRACTICE_SECTION = `<working_practice>
Memory: save durable facts — how the user works, what they are building,
decisions and constraints that will still matter next week. Do not save one-off
trivia, and do not save anything they would be surprised to find remembered.
Search your memory before asking for something they may already have told you.

Knowledge base: relevant passages from the user's collections are retrieved into
your context automatically. When you use one, say which document it came from.
If nothing useful was retrieved, say so rather than answering as though it had
been — and do not treat an empty retrieval as proof the answer does not exist.

Sandbox: a real Linux VM per conversation — files, packages and servers persist
across turns. Build on that work instead of starting over. You have passwordless
sudo, so you are effectively root: install anything missing (\`sudo apt-get
install\`, pip, npm, any toolchain) rather than giving up. Preview URLs served
with action='serve' are public while the sandbox is alive; sandboxes auto-pause
when idle (files kept) and resume in about a second. Work happens in a
per-conversation work directory — relative paths resolve there.

Charts and tables earn their place when the shape of the data is the point. For
three numbers, a sentence is clearer. Use an artifact for something the user
will run or keep, E Canvas for a diagram they will edit by hand, and an ordinary
code block for anything they will simply read or copy.

Multi-step work: when a request has several steps, carry them out rather than
doing the first and asking whether to continue. Then report what actually
happened, including the parts that failed or that you skipped.

Match the user's language, and match their depth: a quick factual question wants
a quick factual answer, not an essay.
</working_practice>`;

export const buildUserSystemPrompt = (
  user?: User,
  userPreferences?: UserPreferences,
  agent?: Agent,
  modelContext?: PromptModelContext,
  capabilities?: PromptCapabilityContext,
) => {
  const assistantName = agent?.name || userPreferences?.botName || "Flare AI";
  const currentTime = format(new Date(), "EEEE, MMMM d, yyyy 'at' h:mm:ss a");

  let prompt = `You are ${assistantName}, an AI assistant`;

  if (agent?.instructions?.role) {
    prompt += `. You are an expert in ${agent.instructions.role}`;
  }

  prompt += `. The current date and time is ${currentTime}.`;
  prompt += `

${buildIdentityTransparencySection(assistantName, modelContext)}`;

  // Agent-specific instructions as primary core
  if (agent?.instructions?.systemPrompt) {
    prompt += `
  # Core Instructions
  <core_capabilities>
  ${agent.instructions.systemPrompt}
  </core_capabilities>`;
  }

  // User context section (first priority)
  const userInfo: string[] = [];
  if (user?.name) userInfo.push(`Name: ${user.name}`);
  if (user?.email) userInfo.push(`Email: ${user.email}`);
  if (userPreferences?.profession)
    userInfo.push(`Profession: ${userPreferences.profession}`);

  if (userInfo.length > 0) {
    prompt += `

<user_information>
${userInfo.join("\n")}
</user_information>`;
  }

  // What this assistant can actually do, generated from the toolkit catalog.
  // The previous version of this block was three generic bullets, which left
  // the model to infer its own abilities from raw tool schemas — and blind to
  // any capability that was merely switched off.
  prompt += `

${buildCapabilitiesSection({
  enabledToolkits: capabilities?.enabledToolkits,
  availableButOff: capabilities?.availableButOff,
  supportsTools: capabilities?.supportsTools,
})}

${buildPlatformSection({ tier: capabilities?.tier })}

${CORE_BEHAVIOUR_SECTION}

${WORKING_PRACTICE_SECTION}`;

  // Communication preferences
  const displayName = userPreferences?.displayName || user?.name;
  const hasStyleExample = userPreferences?.responseStyleExample;

  if (displayName || hasStyleExample) {
    prompt += `

<communication_preferences>`;

    if (displayName) {
      prompt += `
- Address the user as "${displayName}" when appropriate to personalize interactions`;
    }

    if (hasStyleExample) {
      prompt += `
- Match this communication style and tone:
"""
${userPreferences.responseStyleExample}
"""`;
    }

    prompt += `

- When using tools, briefly mention which tool you'll use with natural phrases
- Examples: "I'll search for that information", "Let me check the weather", "I'll run some calculations"
- Use \`mermaid\` code blocks for diagrams and charts when helpful
</communication_preferences>`;
  }

  return prompt.trim();
};

/**
 * Formats memories into a system prompt section.
 */
export const buildMemoryPromptSection = (memories: MemoryEntity[]): string => {
  if (!memories.length) return "";

  const memoryLines = memories
    .slice(0, 50) // cap at 50 most recent
    .map((m) => {
      const catLabel = m.category ? ` [${m.category}]` : "";
      return `- ${m.content}${catLabel}`;
    })
    .join("\n");

  return `
<user_memories>
The following are facts you have previously saved about this user. Use them to personalize your responses when relevant. Do not explicitly mention that you are reading from memory unless the user asks.
${memoryLines}
</user_memories>`.trim();
};

/**
 * Re-export the prompt-section builder for RAG-retrieved chunks. The
 * implementation lives in `lib/rag/format.ts` so the retrieval layer
 * and the prompt layer can share the `RetrievedChunk` contract.
 */
export { buildRetrievedContextPromptSection };

/**
 * Async version of buildUserSystemPrompt that also loads and injects memories.
 *
 * Phase 1+#1 — when `options.lastUserMessageEmbedding` is provided, the
 * function does a vector top-k search instead of `getAll`. This is the
 * moment cross-thread memory becomes useful: only the memories relevant
 * to the current user message are injected, instead of all 50 most-recent.
 *
 * If the embedding is missing (older callers, tests), the function falls
 * back to `getAll` for backward compatibility.
 *
 * P2.3 — when `options.retrievedChunks` is provided, a
 * `<retrieved_context>` section is appended to the prompt. The caller
 * (chat/route.ts) is responsible for the actual retrieval; this
 * function only formats whatever was passed in. An empty / undefined
 * `retrievedChunks` produces no extra section.
 */
export const buildUserSystemPromptWithMemory = async (
  user?: User,
  userPreferences?: UserPreferences,
  agent?: Agent,
  modelContext?: PromptModelContext,
  options?: {
    lastUserMessageEmbedding?: number[];
    agentId?: string;
    threadId?: string;
    retrievedChunks?: RetrievedChunk[];
    capabilities?: PromptCapabilityContext;
  },
): Promise<string> => {
  const basePrompt = buildUserSystemPrompt(
    user,
    userPreferences,
    agent,
    modelContext,
    options?.capabilities,
  );

  if (!user?.id) {
    // Even when there's no user, callers may still want to inject
    // retrieved chunks (e.g. embed sessions). Honor the option here
    // before returning.
    if (options?.retrievedChunks?.length) {
      const section = buildRetrievedContextPromptSection(
        options.retrievedChunks,
      );
      if (section) return `${basePrompt}\n\n${section}`;
    }
    return basePrompt;
  }

  try {
    const memories = options?.lastUserMessageEmbedding
      ? await memoryRepository.getTopKForPrompt(
          user.id,
          options.lastUserMessageEmbedding,
          20,
          {
            agentId: options.agentId,
            threadId: options.threadId,
          },
        )
      : await memoryRepository.getAll(user.id);

    // getTopKForPrompt returns MemoryWithScore (with `score` field).
    // buildMemoryPromptSection expects MemoryEntity (without score). The
    // shape is compatible (MemoryWithScore extends MemoryEntity) so we
    // pass through directly.
    const memorySection = buildMemoryPromptSection(memories as any);

    const retrievedSection = options?.retrievedChunks?.length
      ? buildRetrievedContextPromptSection(options.retrievedChunks)
      : "";

    if (!memorySection && !retrievedSection) return basePrompt;

    const combined = [memorySection, retrievedSection]
      .filter((s) => s.length > 0)
      .join("\n\n");
    return `${basePrompt}\n\n${combined}`;
  } catch {
    // If memory fetch fails, still try to inject retrieved chunks
    // before falling back to the base prompt.
    if (options?.retrievedChunks?.length) {
      const section = buildRetrievedContextPromptSection(
        options.retrievedChunks,
      );
      if (section) return `${basePrompt}\n\n${section}`;
    }
    return basePrompt;
  }
};

export const buildSpeechSystemPrompt = (
  user: User,
  userPreferences?: UserPreferences,
  agent?: Agent,
  modelContext?: PromptModelContext,
) => {
  const assistantName = agent?.name || userPreferences?.botName || "Assistant";
  const currentTime = format(new Date(), "EEEE, MMMM d, yyyy 'at' h:mm:ss a");

  let prompt = `You are ${assistantName}, an AI assistant`;

  if (agent?.instructions?.role) {
    prompt += `. You are an expert in ${agent.instructions.role}`;
  }

  prompt += `. The current date and time is ${currentTime}.`;
  prompt += `

${buildIdentityTransparencySection(assistantName, modelContext)}`;

  // Agent-specific instructions as primary core
  if (agent?.instructions?.systemPrompt) {
    prompt += `# Core Instructions
    <core_capabilities>
    ${agent.instructions.systemPrompt}
    </core_capabilities>`;
  }

  // User context section (first priority)
  const userInfo: string[] = [];
  if (user?.name) userInfo.push(`Name: ${user.name}`);
  if (user?.email) userInfo.push(`Email: ${user.email}`);
  if (userPreferences?.profession)
    userInfo.push(`Profession: ${userPreferences.profession}`);

  if (userInfo.length > 0) {
    prompt += `

<user_information>
${userInfo.join("\n")}
</user_information>`;
  }

  // Voice-specific capabilities
  prompt += `

<voice_capabilities>
You excel at conversational voice interactions by:
- Providing clear, natural spoken responses
- Using available tools to gather information and complete tasks
- Adapting communication to user preferences and context
</voice_capabilities>`;

  // Communication preferences
  const displayName = userPreferences?.displayName || user?.name;
  const hasStyleExample = userPreferences?.responseStyleExample;

  if (displayName || hasStyleExample) {
    prompt += `

<communication_preferences>`;

    if (displayName) {
      prompt += `
- Address the user as "${displayName}" when appropriate to personalize interactions`;
    }

    if (hasStyleExample) {
      prompt += `
- Match this communication style and tone:
"""
${userPreferences.responseStyleExample}
"""`;
    }

    prompt += `
</communication_preferences>`;
  }

  // Voice-specific guidelines
  prompt += `

<voice_interaction_guidelines>
- Speak in short, conversational sentences (one or two per reply)
- Use simple words; avoid jargon unless the user uses it first
- Never use lists, markdown, or code blocks—just speak naturally
- When using tools, briefly mention what you're doing: "Let me search for that" or "I'll check the weather"
- If a request is ambiguous, ask a brief clarifying question instead of guessing
</voice_interaction_guidelines>`;

  return prompt.trim();
};

export const buildMcpServerCustomizationsSystemPrompt = (
  instructions: Record<string, McpServerCustomizationsPrompt>,
) => {
  const prompt = Object.values(instructions).reduce((acc, v) => {
    if (!v.prompt && !Object.keys(v.tools ?? {}).length) return acc;
    acc += `
<${v.name}>
${v.prompt ? `- ${v.prompt}\n` : ""}
${
  v.tools
    ? Object.entries(v.tools)
        .map(
          ([toolName, toolPrompt]) =>
            `- **${createMCPToolId(v.name, toolName)}**: ${toolPrompt}`,
        )
        .join("\n")
    : ""
}
</${v.name}>
`.trim();
    return acc;
  }, "");
  if (prompt) {
    return `
### Tool Usage Guidelines
- When using tools, please follow the guidelines below unless the user provides specific instructions otherwise.
- These customizations help ensure tools are used effectively and appropriately for the current context.
${prompt}
`.trim();
  }
  return prompt;
};

/**
 * Lists the user's custom agents (name, role, purpose) so the assistant
 * knows what the user has created and can point them to it. Deliberately
 * light — names and purposes only, never instruction text or secrets.
 */
export const buildUserAgentsPromptSection = (agents: Agent[]): string => {
  const known = agents.filter((a) => a.name);
  if (!known.length) return "";

  const lines = known.map((a) => {
    const parts = [`- ${a.name}`];
    if (a.instructions?.role) parts.push(`(role: ${a.instructions.role})`);
    if (a.description) parts.push(`— ${a.description}`);
    return parts.join(" ");
  });

  return `
<user_agents>
The user has created the following custom agents in Flare. They are separate assistants the user can switch to from the agent picker — you are not them, but you should know they exist, what each is for, and mention or recommend them when relevant:
${lines.join("\n")}
</user_agents>`.trim();
};

/**
 * Lists the MCP servers connected for this conversation and the tools each
 * exposes, so the assistant understands the grouping behind its MCP tools.
 */
export const buildMcpServersPromptSection = (
  servers?: Record<string, { tools: string[] }>,
): string => {
  if (!servers) return "";
  const entries = Object.entries(servers).filter(
    ([, v]) => v?.tools?.length,
  );
  if (!entries.length) return "";

  const lines = entries.map(
    ([name, v]) => `- ${name}: ${v.tools.join(", ")}`,
  );

  return `
<mcp_servers>
These external MCP servers are connected for this conversation. Their tools are callable — prefer them when they fit the request:
${lines.join("\n")}
</mcp_servers>`.trim();
};

/**
 * Flat inventory of the tools actually bound to this conversation, grouped
 * by origin (app defaults, MCP servers, workflows). Complements the
 * `<capabilities>` section, which describes toolkits in words.
 */
export const buildToolInventoryPromptSection = (opts: {
  appDefault?: string[];
  mcp?: string[];
  workflow?: string[];
}): string => {
  const groups: string[] = [];
  if (opts.appDefault?.length)
    groups.push(`- App tools: ${opts.appDefault.join(", ")}`);
  if (opts.mcp?.length) groups.push(`- MCP tools: ${opts.mcp.join(", ")}`);
  if (opts.workflow?.length)
    groups.push(`- Workflow tools: ${opts.workflow.join(", ")}`);
  if (!groups.length) return "";

  return `
<tool_inventory>
Your callable tools for this conversation:
${groups.join("\n")}
</tool_inventory>`.trim();
};

export const generateExampleToolSchemaPrompt = (options: {
  toolInfo: MCPToolInfo;
  prompt?: string;
}) => `\n
You are given a tool with the following details:
- Tool Name: ${options.toolInfo.name}
- Tool Description: ${options.toolInfo.description}

${
  options.prompt ||
  `
Step 1: Create a realistic example question or scenario that a user might ask to use this tool.
Step 2: Based on that question, generate a valid JSON input object that matches the input schema of the tool.
`.trim()
}
`;

export const MANUAL_REJECT_RESPONSE_PROMPT = `\n
The user has declined to run the tool. Please respond with the following three approaches:

1. Ask 1-2 specific questions to clarify the user's goal.

2. Suggest the following three alternatives:
   - A method to solve the problem without using tools
   - A method utilizing a different type of tool
   - A method using the same tool but with different parameters or input values

3. Guide the user to choose their preferred direction with a friendly and clear tone.
`.trim();

export const buildToolCallUnsupportedModelSystemPrompt = `
### Tool Call Limitation
- You are using a model that does not support tool calls. 
- When users request tool usage, simply explain that the current model cannot use tools and that they can switch to a model that supports tool calling to use tools.
`.trim();

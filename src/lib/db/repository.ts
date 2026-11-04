import { pgAgentRepository } from "./pg/repositories/agent-repository.pg";
import { pgArchiveRepository } from "./pg/repositories/archive-repository.pg";
import { pgBookmarkRepository } from "./pg/repositories/bookmark-repository.pg";
import { bugReportRepository as pgBugReportRepository } from "./pg/repositories/bug-bounty-repository.pg";
import { pgChatExportRepository } from "./pg/repositories/chat-export-repository.pg";
import { pgCanvasExportRepository } from "./pg/repositories/canvas-export-repository.pg";
import { pgChatRepository } from "./pg/repositories/chat-repository.pg";
import { pgDodoPaymentsRepository } from "./pg/repositories/dodo-payments-repository.pg";
import { pgMcpOAuthRepository } from "./pg/repositories/mcp-oauth-repository.pg";
import { pgMcpRepository } from "./pg/repositories/mcp-repository.pg";
import { pgMcpServerCustomizationRepository } from "./pg/repositories/mcp-server-customization-repository.pg";
import { pgMcpMcpToolCustomizationRepository } from "./pg/repositories/mcp-tool-customization-repository.pg";
import { pgMemoryRepository } from "./pg/repositories/memory-repository.pg";
import { pgUserRepository } from "./pg/repositories/user-repository.pg";
import { pgWorkflowRepository } from "./pg/repositories/workflow-repository.pg";

export const chatRepository = pgChatRepository;
export const userRepository = pgUserRepository;
export const mcpRepository = pgMcpRepository;
export const mcpMcpToolCustomizationRepository =
  pgMcpMcpToolCustomizationRepository;
export const mcpServerCustomizationRepository =
  pgMcpServerCustomizationRepository;
export const mcpOAuthRepository = pgMcpOAuthRepository;

export const workflowRepository = pgWorkflowRepository;
export const agentRepository = pgAgentRepository;
export const archiveRepository = pgArchiveRepository;
export const bookmarkRepository = pgBookmarkRepository;
export const chatExportRepository = pgChatExportRepository;
export const canvasExportRepository = pgCanvasExportRepository;
export const memoryRepository = pgMemoryRepository;
export const dodoPaymentsRepository = pgDodoPaymentsRepository;
export const bugReportRepository = pgBugReportRepository;
export { siteConfigRepository } from "./pg/repositories/site-config-repository.pg";
export { pgN8nUserRepository as n8nUserRepository } from "./pg/repositories/n8n-user-repository.pg";

// Phase 3 — Automation (#11, #12, #24). P3.1-P3.4 will import these
// directly; re-exporting here keeps the `import { … } from "@/lib/db/repository"`
// pattern the rest of the codebase uses.
export { schedulerRepository } from "./pg/repositories/scheduler-repository.pg";
export { inboundRepository } from "./pg/repositories/inbound-repository.pg";
export { apiKeyRepository } from "./pg/repositories/api-key-repository.pg";
export { webhookRepository } from "./pg/repositories/webhook-repository.pg";
export { embedSessionRepository } from "./pg/repositories/embed-session-repository.pg";
export { apiUsageRepository } from "./pg/repositories/api-usage-repository.pg";

// Phase 4 — Sharing (#14, #15, #19) + Stripe prereq. P4.A-P4.E will
// import these directly; re-exporting here keeps the
// `import { … } from "@/lib/db/repository"` pattern the rest of the
// codebase uses.
export { mcpInstallRepository } from "./pg/repositories/mcp-install-repository.pg";
export { agentInstallRepository } from "./pg/repositories/agent-install-repository.pg";
export { agentViewRepository } from "./pg/repositories/agent-view-repository.pg";
export { teamRepository } from "./pg/repositories/team-repository.pg";
export { subscriptionRepository } from "./pg/repositories/subscription-repository.pg";

// P2.1 follow-up — knowledge base ingest. `lib/rag/retrieve.ts` could
// always read document_chunk rows; this repository is what finally
// writes them.
export { pgCollectionRepository as collectionRepository } from "./pg/repositories/collection-repository.pg";

// E2B Build (AI app builder). Restored with migration 0032 after the feature
// was removed in 2026-05; sandboxId on the row is what makes a build resumable.
export { pgBuildJobRepository as buildJobRepository } from "./pg/repositories/build-job-repository.pg";

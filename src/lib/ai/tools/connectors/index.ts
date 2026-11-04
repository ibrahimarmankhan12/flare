/**
 * Single import surface for all 42 new connector tools (added 2026-06-03).
 * The tool files themselves live in `src/lib/ai/tools/connectors/<name>-tool.ts`
 * and follow the existing slack/notion/github template.
 *
 * This barrel exists so that the registry (`tool-kit.ts`) and the catalog
 * (`/api/connectors/route.ts`) can iterate over the list in a typed way.
 */
export { createConfluenceToolForUser, confluenceTool } from "./confluence-tool";
export { createJiraToolForUser, jiraTool } from "./jira-tool";
export { createLinearToolForUser, linearTool } from "./linear-tool";
export { createAsanaToolForUser, asanaTool } from "./asana-tool";
export { createClickUpToolForUser, clickupTool } from "./clickup-tool";
export { createProductboardToolForUser, productboardTool } from "./productboard-tool";
export { createTestRailToolForUser, testrailTool } from "./testrail-tool";
export { createCodaToolForUser, codaTool } from "./coda-tool";
export { createOutlineToolForUser, outlineTool } from "./outline-tool";
export { createSlabToolForUser, slabTool } from "./slab-tool";
export { createGuruToolForUser, guruTool } from "./guru-tool";
export { createHighspotToolForUser, highspotTool } from "./highspot-tool";
export { createDocument360ToolForUser, document360Tool } from "./document360-tool";
export { createGitLabToolForUser, gitlabTool } from "./gitlab-tool";
export { createBitbucketToolForUser, bitbucketTool } from "./bitbucket-tool";
export { createDropboxToolForUser, dropboxTool } from "./dropbox-tool";
export { createZendeskToolForUser, zendeskTool } from "./zendesk-tool";
export { createFreshdeskToolForUser, freshdeskTool } from "./freshdesk-tool";
export { createSalesforceToolForUser, salesforceTool } from "./salesforce-tool";
export { createHubSpotToolForUser, hubspotTool } from "./hubspot-tool";
export { createAirtableToolForUser, airtableTool } from "./airtable-tool";
export { createGongToolForUser, gongTool } from "./gong-tool";
export { createEgnyteToolForUser, egnyteTool } from "./egnyte-tool";
export { createTeamsToolForUser, teamsTool } from "./teams-tool";
export { createDiscordToolForUser, discordTool } from "./discord-tool";
export { createBookstackToolForUser, bookstackTool } from "./bookstack-tool";
export { createGitbookToolForUser, gitbookTool } from "./gitbook-tool";
export { createCanvasLmsToolForUser, canvasLmsTool } from "./canvas-lms-tool";
export { createLoopioToolForUser, loopioTool } from "./loopio-tool";
export { createDiscourseToolForUser, discourseTool } from "./discourse-tool";
export { createXenforoToolForUser, xenforoTool } from "./xenforo-tool";
export { createDrupalWikiToolForUser, drupalWikiTool } from "./drupal-wiki-tool";
export { createAxeroToolForUser, axeroTool } from "./axero-tool";
export { createZulipToolForUser, zulipTool } from "./zulip-tool";
export { createMediawikiToolForUser, mediawikiTool } from "./mediawiki-tool";
export { createFirefliesToolForUser, firefliesTool } from "./fireflies-tool";
export { createWikipediaToolForUser, wikipediaTool } from "./wikipedia-tool";

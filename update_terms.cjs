const fs = require("fs");

function performUpdate(
  filePath,
  insertAfterSectionContains,
  newSectionTitle,
  newSectionBody,
) {
  let text = fs.readFileSync(filePath, "utf8");

  // Split into TOC and Body
  let newText = text;

  // 1. Find the TOC line to insert after
  let tocRegex = new RegExp(
    `^(\\d+)\\.\\s+\\[([^\\]]*${insertAfterSectionContains}[^\\]]*)\\]\\(.*?\\)$`,
    "m",
  );
  let tocMatch = newText.match(tocRegex);
  if (!tocMatch) return console.log("TOC not found for", filePath);

  let currentTocNum = parseInt(tocMatch[1]);
  let newTocNum = currentTocNum + 1;
  let newTocSlug = newSectionTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  let newTocLine = `${newTocNum}. [${newSectionTitle}](#${newTocNum}-${newTocSlug})`;

  // Replace the matched line with itself + new line
  let tocPart1 = newText.slice(0, tocMatch.index + tocMatch[0].length);
  let tocPart2 = newText.slice(tocMatch.index + tocMatch[0].length);

  // Now we must increment all TOC numbers after newTocNum
  tocPart2 = tocPart2.replace(/^(\d+)\.\s+\[(.*?)\]/gm, (m, n, t) => {
    let num = parseInt(n);
    if (num >= newTocNum) return `${num + 1}. [${t}]`;
    return m;
  });

  newText = tocPart1 + "\n" + newTocLine + tocPart2;

  // 2. Find the Heading line to insert before (which is currentTocNum + 1)
  let nextHeadingRegex = new RegExp(`^## (\\d+)\\.\\s+.*$`, "m");
  let currentIdx = 0;
  while (true) {
    let hMatch = newText.slice(currentIdx).match(nextHeadingRegex);
    if (!hMatch) break;
    let pTag = parseInt(hMatch[1]);
    // Since we didn't update headings yet, the next heading is STILL newTocNum
    if (pTag === newTocNum) {
      let insertPos = currentIdx + hMatch.index;
      let part1 = newText.slice(0, insertPos);
      let part2 = newText.slice(insertPos);

      // Increment all headings in part2
      part2 = part2.replace(/^## (\d+)\.\s+/gm, (_match, n) => {
        let num = parseInt(n);
        return `## ${num + 1}. `;
      });

      let newSectionWhole = `## ${newTocNum}. ${newSectionTitle}\n\n${newSectionBody}\n\n---\n\n`;
      newText = part1 + newSectionWhole + part2;
      break;
    }
    currentIdx += hMatch.index + hMatch[0].length;
  }

  fs.writeFileSync(filePath, newText);
  console.log("Updated", filePath);
}

const tosBody = `Flare allows you to connect external data sources and applications through Google Connectors and the Model Context Protocol (MCP). By using these integrations, you agree that:

- **Authorization**: You authorize Flare to access, view, and interact with the data in your connected accounts (e.g., Google Drive, connected MCP servers) based on the permissions you grant during the authorization process.
- **Secure Handling of Tokens**: We securely store integration tokens (such as OAuth tokens for Google or connection strings for MCP) using industry-standard encryption at rest and in transit. These tokens are used exclusively to facilitate your active requests.
- **Your Responsibility**: You are responsible for ensuring you have the right to access and connect these external data sources. You must not connect sources containing data you do not have permission to process.
- **Revocation**: You may disconnect any connector or MCP server at any time from your account settings. Upon disconnection, we promptly delete the associated access tokens. We are not responsible for data already processed or synthesized into your conversation history prior to disconnection.`;

performUpdate(
  "legal-consent/flare-flare-terms-of-service.md",
  "Third-Party AI Providers",
  "Integrations, MCP & Connectors",
  tosBody,
);

const ppBody = `Flare allows you to connect your external accounts (such as Google Drive) and local/remote datasets via the Model Context Protocol (MCP) and dedicated connectors.

Here is how we handle data related to these integrations:

- **Authentication & Tokens**: When you connect an external service (e.g., via Google OAuth) or configure an MCP server, we collect and securely store access tokens, connection strings, and authorization metadata. **Tokens are securely encrypted at rest (AES-256) and transmitted via TLS.**
- **Data Access & Usage**: We do not preemptively download, copy, or train models on your connected data. Data from Google Connectors or MCP servers is fetched **only on-demand** when you explicitly query or interact with it in a conversation.
- **Scope Limitations**: We only request the minimum permissions (scopes) necessary for the connector to function. Our access is strictly bound to generating AI responses based on your active prompts.
- **Token Deletion**: If you disconnect a service or delete your Flare account, your OAuth tokens and MCP connection strings are permanently securely deleted from our active database.`;

performUpdate(
  "legal-consent/flare-flare-privacy-policy.md",
  "Image Generation",
  "Model Context Protocol (MCP) & Data Connectors",
  ppBody,
);

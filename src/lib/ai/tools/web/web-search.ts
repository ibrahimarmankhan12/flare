import { tool as createTool } from "ai";
import { JSONSchema7 } from "json-schema";
import { jsonSchemaToZod } from "lib/json-schema-to-zod";
import { safe } from "ts-safe";

// Exa API Types
export interface ExaSearchRequest {
  query: string;
  type: string;
  category?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  startPublishedDate?: string;
  endPublishedDate?: string;
  numResults: number;
  contents: {
    text:
      | {
          maxCharacters?: number;
        }
      | boolean;
    livecrawl?: "always" | "fallback" | "preferred";
    subpages?: number;
    subpageTarget?: string[];
  };
}

export interface ExaSearchResult {
  id: string;
  title: string;
  url: string;
  publishedDate: string;
  author: string;
  text: string;
  image?: string;
  favicon?: string;
  score?: number;
}

export interface ExaSearchResponse {
  requestId: string;
  autopromptString: string;
  resolvedSearchType: string;
  results: ExaSearchResult[];
}

export interface ExaContentsRequest {
  ids: string[];
  contents: {
    text:
      | {
          maxCharacters?: number;
        }
      | boolean;
    livecrawl?: "always" | "fallback" | "preferred";
  };
}

export const exaSearchSchema: JSONSchema7 = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Search query",
    },
    numResults: {
      type: "number",
      description:
        "Number of search results to return. Defaults to 5 if not specified.",
      minimum: 1,
      maximum: 20,
    },
    type: {
      type: "string",
      enum: ["auto", "keyword", "neural"],
      description:
        "Search type - auto lets Exa decide, keyword for exact matches, neural for semantic search. Defaults to auto.",
    },
    category: {
      type: "string",
      enum: [
        "company",
        "research paper",
        "news",
        "linkedin profile",
        "github",
        "tweet",
        "movie",
        "song",
        "personal site",
        "pdf",
      ],
      description: "Category to focus the search on",
    },
    includeDomains: {
      type: "array",
      items: { type: "string" },
      description: "List of domains to specifically include in search results",
    },
    excludeDomains: {
      type: "array",
      items: { type: "string" },
      description:
        "List of domains to specifically exclude from search results",
    },
    startPublishedDate: {
      type: "string",
      description: "Start date for published content (YYYY-MM-DD format)",
    },
    endPublishedDate: {
      type: "string",
      description: "End date for published content (YYYY-MM-DD format)",
    },
    maxCharacters: {
      type: "number",
      description:
        "Maximum characters to extract from each result. Defaults to 3000.",
      minimum: 100,
      maximum: 10000,
    },
  },
  required: ["query"],
};

export const exaContentsSchema: JSONSchema7 = {
  type: "object",
  properties: {
    urls: {
      type: "array",
      items: { type: "string" },
      description: "List of URLs to extract content from",
    },
    maxCharacters: {
      type: "number",
      description:
        "Maximum characters to extract from each URL. Defaults to 3000.",
      minimum: 100,
      maximum: 10000,
    },
    livecrawl: {
      type: "string",
      enum: ["always", "fallback", "preferred"],
      description:
        "Live crawling preference - always forces live crawl, fallback uses cache first, preferred tries live first. Defaults to preferred.",
    },
  },
  required: ["urls"],
};

const API_KEY = process.env.EXA_API_KEY;
const BASE_URL = "https://api.exa.ai";
const SEARXNG_URL = process.env.SEARXNG_URL;

// --- SearXNG provider ---

interface SearxngResult {
  url: string;
  title: string;
  content?: string;
  publishedDate?: string;
  engine?: string;
  score?: number;
  thumbnail?: string;
  img_src?: string;
}

interface SearxngResponse {
  results: SearxngResult[];
}

const searchSearxng = async (query: string, numResults: number): Promise<ExaSearchResponse> => {
  if (!SEARXNG_URL) {
    throw new Error("SEARXNG_URL is not configured");
  }

  const url = new URL(`${SEARXNG_URL.replace(/\/$/, "")}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "en");
  url.searchParams.set("safesearch", "1");

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`SearXNG error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as SearxngResponse;
  const results = (data.results || []).slice(0, numResults).map((r, index) => ({
    id: String(index + 1),
    title: r.title || "Untitled",
    url: r.url,
    publishedDate: r.publishedDate || "",
    author: Array.isArray(r.engine) ? r.engine.join(", ") : String(r.engine || ""),
    text: r.content || "",
    image: r.img_src || r.thumbnail || undefined,
  }));

  return {
    requestId: "searxng",
    autopromptString: query,
    resolvedSearchType: "auto",
    results,
  };
};

const extractSearxng = async (url: string, maxCharacters: number): Promise<any> => {
  if (!SEARXNG_URL) {
    throw new Error("SEARXNG_URL is not configured");
  }

  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; FlareAI/1.0)" },
  });

  if (!response.ok) {
    throw new Error(`URL fetch error: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

  return {
    results: [{
      id: "1",
      title: url,
      url,
      text: text.slice(0, maxCharacters),
    }],
  };
};

// --- Provider selection ---

const searchWeb = async (request: ExaSearchRequest): Promise<any> => {
  if (SEARXNG_URL) {
    return searchSearxng(request.query, request.numResults || 5);
  }
  return fetchExa("/search", request);
};

const extractWebContent = async (request: ExaContentsRequest): Promise<any> => {
  if (SEARXNG_URL) {
    const [url] = request.ids;
    const maxChars = typeof request.contents.text === "object" && request.contents.text
      ? (request.contents.text.maxCharacters || 3000)
      : 3000;
    if (url) {
      return extractSearxng(url, maxChars);
    }
    return { results: [] };
  }
  return fetchExa("/contents", request);
};

// --- Exa provider ---

const fetchExa = async (endpoint: string, body: any): Promise<any> => {
  if (!API_KEY) {
    throw new Error("EXA_API_KEY is not configured");
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401) {
    throw new Error("Invalid EXA API key");
  }
  if (response.status === 429) {
    throw new Error("Exa API usage limit exceeded");
  }

  if (!response.ok) {
    throw new Error(`Exa API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
};

export const exaSearchToolForWorkflow = createTool({
  description:
    "Search the web in real time (SearXNG self-hosted or Exa AI). Returns high-quality, relevant results with full content extraction and citation support.",
  inputSchema: jsonSchemaToZod(exaSearchSchema),
  execute: async (params) => {
    const searchRequest: ExaSearchRequest = {
      query: params.query,
      type: params.type || "auto",
      numResults: params.numResults || 5,
      contents: {
        text: {
          maxCharacters: params.maxCharacters || 3000,
        },
        livecrawl: "preferred",
      },
    };

    // Add optional parameters if provided
    if (params.category) searchRequest.category = params.category;
    if (params.includeDomains?.length)
      searchRequest.includeDomains = params.includeDomains;
    if (params.excludeDomains?.length)
      searchRequest.excludeDomains = params.excludeDomains;
    if (params.startPublishedDate)
      searchRequest.startPublishedDate = params.startPublishedDate;
    if (params.endPublishedDate)
      searchRequest.endPublishedDate = params.endPublishedDate;

    const result = await searchWeb(searchRequest);

    // Build structured citations array
    const citations =
      result.results?.map((r: ExaSearchResult, index: number) => ({
        id: index + 1,
        title: r.title,
        url: r.url,
        author: r.author,
        publishedDate: r.publishedDate,
      })) || [];

    return {
      ...result,
      citations,
    };
  },
});

export const exaContentsToolForWorkflow = createTool({
  description:
    "Extract detailed content from specific URLs - retrieves full text content, metadata, and structured information from web pages.",
  inputSchema: jsonSchemaToZod(exaContentsSchema),
  execute: async (params) => {
    const contentsRequest: ExaContentsRequest = {
      ids: params.urls,
      contents: {
        text: {
          maxCharacters: params.maxCharacters || 3000,
        },
        livecrawl: params.livecrawl || "preferred",
      },
    };

    return extractWebContent(contentsRequest);
  },
});

export const exaSearchTool = createTool({
  description:
    "Search the web in real time (SearXNG self-hosted or Exa AI). Returns high-quality, relevant results with full content extraction and citation support.",
  inputSchema: jsonSchemaToZod(exaSearchSchema),
  execute: (params) => {
    return safe(async () => {
      const searchRequest: ExaSearchRequest = {
        query: params.query,
        type: params.type || "auto",
        numResults: params.numResults || 5,
        contents: {
          text: {
            maxCharacters: params.maxCharacters || 3000,
          },
          livecrawl: "preferred",
        },
      };

      // Add optional parameters if provided
      if (params.category) searchRequest.category = params.category;
      if (params.includeDomains?.length)
        searchRequest.includeDomains = params.includeDomains;
      if (params.excludeDomains?.length)
        searchRequest.excludeDomains = params.excludeDomains;
      if (params.startPublishedDate)
        searchRequest.startPublishedDate = params.startPublishedDate;
      if (params.endPublishedDate)
        searchRequest.endPublishedDate = params.endPublishedDate;

      const result = await searchWeb(searchRequest);

      // Build structured citations array for the AI to reference
      const citations =
        result.results?.map((r: ExaSearchResult, index: number) => ({
          id: index + 1,
          title: r.title,
          url: r.url,
          author: r.author,
          publishedDate: r.publishedDate,
          snippet: r.text?.slice(0, 500) + (r.text?.length > 500 ? "..." : ""),
        })) || [];

      return {
        ...result,
        citations,
        guide: `You have received ${citations.length} search results. When using information from these sources in your response:

1. **ALWAYS include inline citations** using the format [1], [2], etc. to reference the source.
2. Place citations immediately after the relevant information, for example: "The event occurred in 2024 [1]."
3. You can cite multiple sources for the same fact: "This was confirmed by multiple reports [1][3]."
4. At the end of your response, you may optionally provide a "Sources" section listing the key references used.

Available sources:
${citations.map((c: { id: number; title: string; url: string }) => `[${c.id}] ${c.title} - ${c.url}`).join("\n")}

Use these citations to provide accurate, well-sourced information to the user.`,
      };
    })
      .ifFail((e) => {
        return {
          isError: true,
          error: e.message,
          solution:
            "A web search error occurred. First, explain to the user what caused this specific error and how they can resolve it. Then provide helpful information based on your existing knowledge to answer their question.",
        };
      })
      .unwrap();
  },
});

export const exaContentsTool = createTool({
  description:
    "Extract detailed content from specific URLs - retrieves full text content, metadata, and structured information from web pages.",
  inputSchema: jsonSchemaToZod(exaContentsSchema),
  execute: async (params) => {
    return safe(async () => {
      const contentsRequest: ExaContentsRequest = {
        ids: params.urls,
        contents: {
          text: {
            maxCharacters: params.maxCharacters || 3000,
          },
          livecrawl: params.livecrawl || "preferred",
        },
      };

      return await fetchExa("/contents", contentsRequest);
    })
      .ifFail((e) => {
        return {
          isError: true,
          error: e.message,
          solution:
            "A web content extraction error occurred. First, explain to the user what caused this specific error and how they can resolve it. Then provide helpful information based on your existing knowledge to answer their question.",
        };
      })
      .unwrap();
  },
});

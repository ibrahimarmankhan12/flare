import { DBEdge, DBNode, DBWorkflow } from "app-types/workflow";
import { generateUUID } from "lib/utils";
import { babyResearchEdges, babyResearchNodes } from "./baby-research";
import { codeReviewEdges, codeReviewNodes } from "./code-review";
import { getWeatherEdges, getWeatherNodes } from "./get-weather";
import { summarizeEdges, summarizeNodes } from "./summarize";
import { translateEdges, translateNodes } from "./translate";

export const GetWeather = (): {
  workflow: Partial<DBWorkflow>;
  nodes: Partial<DBNode>[];
  edges: Partial<DBEdge>[];
} => {
  return {
    workflow: {
      description: "Get weather data from the API",
      name: "Get Weather",
      isPublished: true,
      visibility: "private",
      icon: {
        type: "emoji",
        value:
          "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/26c8-fe0f.png",
        style: {
          backgroundColor: "oklch(20.5% 0 0)",
        },
      },
    },
    nodes: getWeatherNodes,
    edges: getWeatherEdges.map((edge) => ({
      ...edge,
      id: generateUUID(),
    })),
  };
};

export const BabyResearch = (): {
  workflow: Partial<DBWorkflow>;
  nodes: Partial<DBNode>[];
  edges: Partial<DBEdge>[];
} => {
  return {
    workflow: {
      description:
        "Comprehensive web research workflow that performs multi-layered search and content analysis to generate detailed research reports based on user instructions and research objectives.",
      name: "baby-research",
      isPublished: true,
      visibility: "private",
      icon: {
        type: "emoji",
        value:
          "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f468-1f3fb-200d-1f52c.png",
        style: {
          backgroundColor: "oklch(78.5% 0.115 274.713)",
        },
      },
    },
    nodes: babyResearchNodes,
    edges: babyResearchEdges.map((edge) => ({
      ...edge,
      id: generateUUID(),
    })),
  };
};

/**
 * Summarize — feed long-form text in, get a structured summary out.
 * Returns { summary, keyPoints[], tldr }.
 */
export const Summarize = (): {
  workflow: Partial<DBWorkflow>;
  nodes: Partial<DBNode>[];
  edges: Partial<DBEdge>[];
} => {
  return {
    workflow: {
      description:
        "Summarize long-form text into a structured {summary, keyPoints, tldr} object using a fast LLM.",
      name: "Summarize",
      isPublished: true,
      visibility: "private",
      icon: {
        type: "emoji",
        value:
          "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f4dd.png",
        style: {
          backgroundColor: "oklch(60% 0.13 250)",
        },
      },
    },
    nodes: summarizeNodes,
    edges: summarizeEdges.map((edge) => ({
      ...edge,
      id: generateUUID(),
    })),
  };
};

/**
 * Translate — translate text into a target language and return structured
 * { translation, sourceLanguage }.
 */
export const Translate = (): {
  workflow: Partial<DBWorkflow>;
  nodes: Partial<DBNode>[];
  edges: Partial<DBEdge>[];
} => {
  return {
    workflow: {
      description:
        "Translate text into a target language and return {translation, sourceLanguage} using a multilingual LLM.",
      name: "Translate",
      isPublished: true,
      visibility: "private",
      icon: {
        type: "emoji",
        value:
          "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f310.png",
        style: {
          backgroundColor: "oklch(70% 0.14 200)",
        },
      },
    },
    nodes: translateNodes,
    edges: translateEdges.map((edge) => ({
      ...edge,
      id: generateUUID(),
    })),
  };
};

/**
 * Code Review — review a code patch and produce a structured critique with
 * { issues[], score, severity, review }.
 */
export const CodeReview = (): {
  workflow: Partial<DBWorkflow>;
  nodes: Partial<DBNode>[];
  edges: Partial<DBEdge>[];
} => {
  return {
    workflow: {
      description:
        "Two-stage code review: analyze the code for issues, score, and severity, then turn it into a markdown review.",
      name: "Code Review",
      isPublished: true,
      visibility: "private",
      icon: {
        type: "emoji",
        value:
          "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f50e.png",
        style: {
          backgroundColor: "oklch(78.5% 0.115 274.713)",
        },
      },
    },
    nodes: codeReviewNodes,
    edges: codeReviewEdges.map((edge) => ({
      ...edge,
      id: generateUUID(),
    })),
  };
};

import "server-only";

import { nanoid } from "nanoid";
import {
  COMMUNITY_POST_TYPES,
  type CommunityFeedResponse,
  type CommunityMedia,
  type CommunityPost,
  type CommunityPostType,
} from "app-types/community";

type CommunityPostRecord = {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string | null;
  authorBadge?: string;
  type: CommunityPostType;
  content: string;
  media?: CommunityMedia;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  likes?: Record<string, true>;
  bookmarks?: Record<string, true>;
  comments?: number;
  shares?: number;
};

type CommunityFeedTab = "For You" | "Trending" | "Latest" | "Following";

const COMMUNITY_ROOT_PATH = "community";

export class CommunityServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly publicMessage: string,
  ) {
    super(message);
    this.name = "CommunityServiceError";
  }
}

function getDatabaseUrl() {
  const databaseUrl = process.env.COMMUNITY_FIREBASE_DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new CommunityServiceError(
      "COMMUNITY_FIREBASE_DATABASE_URL is not configured",
      503,
      "Community backend is not configured",
    );
  }
  return databaseUrl.replace(/\/$/, "");
}

function buildFirebaseUrl(path: string) {
  const databaseUrl = getDatabaseUrl();
  const url = new URL(`${databaseUrl}/${path}.json`);
  const authToken = process.env.COMMUNITY_FIREBASE_AUTH_TOKEN?.trim();
  if (authToken) {
    url.searchParams.set("auth", authToken);
  }
  return url;
}

export function getCommunityPostsStreamUrl() {
  return buildFirebaseUrl(`${COMMUNITY_ROOT_PATH}/posts`).toString();
}

async function firebaseRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(buildFirebaseUrl(path), {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new CommunityServiceError(
        `Firebase request failed with status ${response.status}: ${body}`,
        503,
        "Community database access is not configured",
      );
    }

    throw new CommunityServiceError(
      `Firebase request failed with status ${response.status}: ${body}`,
      502,
      "Community backend is temporarily unavailable",
    );
  }

  return (await response.json()) as T;
}

export function getCommunityErrorResponse(error: unknown) {
  if (error instanceof CommunityServiceError) {
    return Response.json(
      { error: error.publicMessage, message: error.publicMessage },
      { status: error.status },
    );
  }

  return Response.json(
    {
      error: "Failed to load community data",
      message: "Failed to load community data",
    },
    { status: 500 },
  );
}

function normalizeTags(content: string, tags?: string[]) {
  const fromContent = Array.from(content.matchAll(/#([a-zA-Z0-9_-]+)/g)).map(
    ([, tag]) => tag.toLowerCase(),
  );
  return Array.from(
    new Set([...(tags ?? []), ...fromContent].map((tag) => tag.trim())),
  )
    .filter(Boolean)
    .slice(0, 8);
}

function likesCount(post: CommunityPostRecord) {
  return Object.keys(post.likes ?? {}).length;
}

function bookmarksCount(post: CommunityPostRecord) {
  return Object.keys(post.bookmarks ?? {}).length;
}

function engagementScore(post: CommunityPostRecord) {
  return likesCount(post) * 3 + bookmarksCount(post) * 2 + (post.shares ?? 0);
}

function toCommunityPost(
  post: CommunityPostRecord,
  currentUserId: string,
): CommunityPost {
  return {
    id: post.id,
    author: {
      id: post.authorId,
      name: post.authorName,
      avatar: post.authorAvatar,
      badge: post.authorBadge,
    },
    type: post.type,
    content: post.content,
    media: post.media,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    likes: likesCount(post),
    comments: post.comments ?? 0,
    shares: post.shares ?? 0,
    tags: post.tags ?? [],
    liked: !!post.likes?.[currentUserId],
    bookmarked: !!post.bookmarks?.[currentUserId],
  };
}

async function getPostRecords() {
  const rawPosts = await firebaseRequest<Record<
    string,
    CommunityPostRecord
  > | null>(`${COMMUNITY_ROOT_PATH}/posts`);
  return Object.values(rawPosts ?? {}).filter((post) =>
    COMMUNITY_POST_TYPES.includes(post.type),
  );
}

function sortPosts(posts: CommunityPostRecord[], tab: CommunityFeedTab) {
  const copy = [...posts];
  if (tab === "Trending") {
    return copy.sort(
      (a, b) =>
        engagementScore(b) - engagementScore(a) ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
  }

  return copy.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function getCommunityFeed(
  currentUserId: string,
  tab: CommunityFeedTab,
): Promise<CommunityFeedResponse> {
  const posts = await getPostRecords();
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const activeSince = now - 15 * 60 * 1000;

  const tagCounts = new Map<string, number>();
  const contributorMap = new Map<
    string,
    {
      id: string;
      name: string;
      avatar?: string | null;
      badge?: string;
      points: number;
    }
  >();

  for (const post of posts) {
    for (const tag of post.tags ?? []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }

    const contributor = contributorMap.get(post.authorId) ?? {
      id: post.authorId,
      name: post.authorName,
      avatar: post.authorAvatar,
      badge: post.authorBadge,
      points: 0,
    };
    contributor.points += 1 + likesCount(post) + (post.shares ?? 0);
    contributorMap.set(post.authorId, contributor);
  }

  return {
    posts: sortPosts(posts, tab).map((post) =>
      toCommunityPost(post, currentUserId),
    ),
    stats: {
      members: new Set(posts.map((post) => post.authorId)).size,
      postsToday: posts.filter(
        (post) => Date.parse(post.createdAt) >= startOfToday.getTime(),
      ).length,
      activeNow: new Set(
        posts
          .filter((post) => Date.parse(post.updatedAt) >= activeSince)
          .map((post) => post.authorId),
      ).size,
    },
    trendingTopics: Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count })),
    topContributors: Array.from(contributorMap.values())
      .sort((a, b) => b.points - a.points)
      .slice(0, 5),
  };
}

export async function createCommunityPost(input: {
  authorId: string;
  authorName: string;
  authorAvatar?: string | null;
  authorBadge?: string;
  type: CommunityPostType;
  content: string;
  media?: CommunityMedia;
  tags?: string[];
}) {
  const now = new Date().toISOString();
  const id = nanoid();
  const record: CommunityPostRecord = {
    id,
    authorId: input.authorId,
    authorName: input.authorName,
    authorAvatar: input.authorAvatar ?? null,
    type: input.type,
    content: input.content,
    createdAt: now,
    updatedAt: now,
    tags: normalizeTags(input.content, input.tags),
    likes: {},
    bookmarks: {},
    comments: 0,
    shares: 0,
  };

  if (input.authorBadge) {
    record.authorBadge = input.authorBadge;
  }

  if (input.media) {
    record.media = input.media;
  }

  await firebaseRequest(`${COMMUNITY_ROOT_PATH}/posts/${id}`, {
    method: "PUT",
    body: JSON.stringify(record),
  });

  return record;
}

export async function setCommunityReaction(input: {
  postId: string;
  userId: string;
  type: "like" | "bookmark";
  active: boolean;
}) {
  const child = input.type === "like" ? "likes" : "bookmarks";
  await firebaseRequest(
    `${COMMUNITY_ROOT_PATH}/posts/${input.postId}/${child}/${input.userId}`,
    {
      method: input.active ? "PUT" : "DELETE",
      body: input.active ? JSON.stringify(true) : undefined,
    },
  );
}

export async function incrementCommunityShare(postId: string) {
  const currentShares =
    (await firebaseRequest<number | null>(
      `${COMMUNITY_ROOT_PATH}/posts/${postId}/shares`,
    )) ?? 0;

  await firebaseRequest(`${COMMUNITY_ROOT_PATH}/posts/${postId}/shares`, {
    method: "PUT",
    body: JSON.stringify(currentShares + 1),
  });
}

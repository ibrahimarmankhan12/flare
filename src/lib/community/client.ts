"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  getDatabase,
  onValue,
  ref,
  remove,
  runTransaction,
  set,
} from "firebase/database";
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

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_COMMUNITY_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_COMMUNITY_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_COMMUNITY_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_COMMUNITY_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_COMMUNITY_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:
    process.env.NEXT_PUBLIC_COMMUNITY_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_COMMUNITY_FIREBASE_APP_ID,
};

function assertFirebaseConfig() {
  for (const [key, value] of Object.entries(firebaseConfig)) {
    if (!value) {
      throw new Error(`Missing Firebase config value: ${key}`);
    }
  }
}

function getCommunityApp() {
  assertFirebaseConfig();
  return getApps().some((app) => app.name === "community")
    ? getApp("community")
    : initializeApp(firebaseConfig, "community");
}

function getCommunityDatabase() {
  return getDatabase(getCommunityApp());
}

async function ensureCommunityAuth() {
  const auth = getAuth(getCommunityApp());
  if (auth.currentUser) return;

  try {
    await signInAnonymously(auth);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";

    if (
      code === "auth/operation-not-allowed" ||
      code === "auth/configuration-not-found"
    ) {
      throw new Error("Firebase Anonymous Auth is not enabled");
    }

    throw error;
  }
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

function buildCommunityFeed(
  records: CommunityPostRecord[],
  currentUserId: string,
  tab: CommunityFeedTab,
): CommunityFeedResponse {
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

  for (const post of records) {
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
    posts: sortPosts(records, tab).map((post) =>
      toCommunityPost(post, currentUserId),
    ),
    stats: {
      members: new Set(records.map((post) => post.authorId)).size,
      postsToday: records.filter(
        (post) => Date.parse(post.createdAt) >= startOfToday.getTime(),
      ).length,
      activeNow: new Set(
        records
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

export async function subscribeToCommunityFeed(input: {
  currentUserId: string;
  tab: CommunityFeedTab;
  onData: (feed: CommunityFeedResponse) => void;
  onError: (error: Error) => void;
}) {
  await ensureCommunityAuth();
  const postsRef = ref(getCommunityDatabase(), "community/posts");

  return onValue(
    postsRef,
    (snapshot) => {
      const rawPosts = (snapshot.val() ?? {}) as Record<
        string,
        CommunityPostRecord
      >;
      const records = Object.values(rawPosts).filter((post) =>
        COMMUNITY_POST_TYPES.includes(post.type),
      );
      input.onData(buildCommunityFeed(records, input.currentUserId, input.tab));
    },
    (error) => {
      input.onError(error);
    },
  );
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
  await ensureCommunityAuth();
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

  await set(ref(getCommunityDatabase(), `community/posts/${id}`), record);
  return record;
}

export async function setCommunityReaction(input: {
  postId: string;
  userId: string;
  type: "like" | "bookmark";
  active: boolean;
}) {
  await ensureCommunityAuth();
  const child = input.type === "like" ? "likes" : "bookmarks";
  const reactionRef = ref(
    getCommunityDatabase(),
    `community/posts/${input.postId}/${child}/${input.userId}`,
  );

  if (input.active) {
    await set(reactionRef, true);
    return;
  }

  await remove(reactionRef);
}

export async function incrementCommunityShare(postId: string) {
  await ensureCommunityAuth();
  await runTransaction(
    ref(getCommunityDatabase(), `community/posts/${postId}/shares`),
    (current) => (typeof current === "number" ? current + 1 : 1),
  );
}

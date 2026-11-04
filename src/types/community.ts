export const COMMUNITY_POST_TYPES = ["text", "media", "research"] as const;

export type CommunityPostType = (typeof COMMUNITY_POST_TYPES)[number];

export type CommunityMedia = {
  url: string;
  name: string;
  contentType: string;
  size: number;
};

export type CommunityAuthor = {
  id: string;
  name: string;
  avatar?: string | null;
  badge?: string;
};

export type CommunityPost = {
  id: string;
  author: CommunityAuthor;
  type: CommunityPostType;
  content: string;
  media?: CommunityMedia;
  createdAt: string;
  updatedAt: string;
  likes: number;
  comments: number;
  shares: number;
  tags: string[];
  liked: boolean;
  bookmarked: boolean;
};

export type CommunityTopic = {
  tag: string;
  count: number;
};

export type CommunityStats = {
  members: number;
  postsToday: number;
  activeNow: number;
};

export type CommunityContributor = {
  id: string;
  name: string;
  avatar?: string | null;
  badge?: string;
  points: number;
};

export type CommunityFeedResponse = {
  posts: CommunityPost[];
  stats: CommunityStats;
  trendingTopics: CommunityTopic[];
  topContributors: CommunityContributor[];
};

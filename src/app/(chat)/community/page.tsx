"use client";

import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import {
  Award,
  Bookmark,
  BookOpen,
  Clock,
  Filter,
  Hash,
  Heart,
  Image as ImageIcon,
  LoaderCircle,
  MessageCircle,
  MoreHorizontal,
  Send,
  Share2,
  Smile,
  Star,
  ThumbsUp,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type CommunityFeedResponse,
  type CommunityMedia,
  type CommunityPost,
  type CommunityPostType,
} from "app-types/community";
import { authClient } from "auth/client";
import {
  createCommunityPost,
  incrementCommunityShare,
  setCommunityReaction,
  subscribeToCommunityFeed,
} from "lib/community/client";
import { getUserAvatar } from "lib/user/utils";
import { cn, fetcher } from "lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "ui/avatar";
import { Button } from "ui/button";
import type { BasicUser } from "app-types/user";
import useSWR from "swr";

const TABS = ["For You", "Trending", "Latest", "Following"] as const;
type TabType = (typeof TABS)[number];

function getBadgeClasses(badge: string) {
  switch (badge) {
    case "Founder":
      return "bg-gradient-to-r from-amber-500 to-orange-500 text-white";
    case "Pro Member":
      return "bg-gradient-to-r from-teal-500 to-emerald-500 text-white";
    case "Top Contributor":
      return "bg-gradient-to-r from-violet-500 to-purple-500 text-white";
    case "Enterprise":
      return "bg-gradient-to-r from-blue-500 to-indigo-500 text-white";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function formatTimestamp(timestamp: string) {
  return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
}

function getPostTypeLabel(type: CommunityPostType) {
  switch (type) {
    case "research":
      return "Research";
    case "media":
      return "Media";
    default:
      return "Post";
  }
}

function PostCard({
  post,
  onLike,
  onBookmark,
  onShare,
}: {
  post: CommunityPost;
  onLike: (post: CommunityPost) => void;
  onBookmark: (post: CommunityPost) => void;
  onShare: (post: CommunityPost) => void;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-card border border-border rounded-2xl p-5 sm:p-6 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start gap-3 mb-4">
        <Avatar className="size-10 border">
          <AvatarImage
            src={post.author.avatar ?? undefined}
            alt={post.author.name}
          />
          <AvatarFallback className="text-sm font-medium bg-primary/10 text-primary">
            {post.author.name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground">
              {post.author.name}
            </span>
            {post.author.badge && (
              <span
                className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                  getBadgeClasses(post.author.badge),
                )}
              >
                {post.author.badge}
              </span>
            )}
            {post.type !== "text" && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {getPostTypeLabel(post.type)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            <Clock className="size-3" />
            <span>{formatTimestamp(post.createdAt)}</span>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="size-8 rounded-full">
          <MoreHorizontal className="size-4 text-muted-foreground" />
        </Button>
      </div>

      <p className="text-sm text-foreground/90 leading-relaxed mb-4 whitespace-pre-wrap">
        {post.content}
      </p>

      {post.media && (
        <div className="mb-4 overflow-hidden rounded-2xl border border-border/70 bg-muted/20">
          {post.media.contentType.startsWith("video/") ? (
            <video
              controls
              className="max-h-[420px] w-full bg-black object-contain"
              src={post.media.url}
            />
          ) : (
            <img
              alt={post.media.name}
              className="max-h-[420px] w-full object-cover"
              src={post.media.url}
            />
          )}
        </div>
      )}

      {post.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-primary/5 text-primary hover:bg-primary/10 cursor-pointer transition-colors"
            >
              <Hash className="size-3" />
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 pt-3 border-t border-border/50">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "gap-1.5 text-xs rounded-full h-8",
            post.liked && "text-rose-500",
          )}
          onClick={() => onLike(post)}
        >
          <Heart className={cn("size-4", post.liked && "fill-rose-500")} />
          <span>{post.likes}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs rounded-full h-8"
        >
          <MessageCircle className="size-4" />
          <span>{post.comments}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs rounded-full h-8"
          onClick={() => onShare(post)}
        >
          <Share2 className="size-4" />
          <span>{post.shares}</span>
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "size-8 rounded-full",
            post.bookmarked && "text-primary",
          )}
          onClick={() => onBookmark(post)}
        >
          <Bookmark
            className={cn("size-4", post.bookmarked && "fill-primary")}
          />
        </Button>
      </div>
    </motion.article>
  );
}

export default function CommunityPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: session } = authClient.useSession();
  const { data: currentUser } = useSWR<BasicUser>(
    session?.user.id ? "/api/user/details" : null,
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: 1000 * 60 * 10,
    },
  );
  const [activeTab, setActiveTab] = useState<TabType>("For You");
  const [newPost, setNewPost] = useState("");
  const [postType, setPostType] = useState<CommunityPostType>("text");
  const [media, setMedia] = useState<CommunityMedia>();
  const [isUploading, setIsUploading] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [data, setData] = useState<CommunityFeedResponse>();
  const [isLoading, setIsLoading] = useState(true);
  const [feedError, setFeedError] = useState<Error>();
  const [error, setError] = useState<string>();

  const currentUserName =
    currentUser?.name || session?.user.name || "Flare User";
  const currentUserAvatar = getUserAvatar(currentUser ?? session?.user ?? {});
  const posts = data?.posts ?? [];

  useEffect(() => {
    const currentUserId = session?.user.id;
    if (!currentUserId) return;

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    setIsLoading(true);
    setFeedError(undefined);

    void subscribeToCommunityFeed({
      currentUserId,
      tab: activeTab,
      onData: (feed) => {
        if (cancelled) return;
        setData(feed);
        setFeedError(undefined);
        setIsLoading(false);
      },
      onError: (subscriptionError) => {
        if (cancelled) return;
        setFeedError(subscriptionError);
        setIsLoading(false);
      },
    })
      .then((nextUnsubscribe) => {
        if (cancelled) {
          nextUnsubscribe();
          return;
        }
        unsubscribe = nextUnsubscribe;
      })
      .catch((subscriptionError) => {
        if (cancelled) return;
        setFeedError(
          subscriptionError instanceof Error
            ? subscriptionError
            : new Error("Failed to load community feed"),
        );
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [activeTab, session?.user.id]);

  const mutatePost = useCallback(
    (postId: string, updater: (post: CommunityPost) => CommunityPost) => {
      setData((current) =>
        current
          ? {
              ...current,
              posts: current.posts.map((post) =>
                post.id === postId ? updater(post) : post,
              ),
            }
          : current,
      );
    },
    [],
  );

  const updateReaction = useCallback(
    async (post: CommunityPost, type: "like" | "bookmark") => {
      if (!session?.user.id) return;
      const nextActive = type === "like" ? !post.liked : !post.bookmarked;
      mutatePost(post.id, (current) =>
        type === "like"
          ? {
              ...current,
              liked: nextActive,
              likes: current.likes + (nextActive ? 1 : -1),
            }
          : { ...current, bookmarked: nextActive },
      );

      try {
        await setCommunityReaction({
          postId: post.id,
          userId: session.user.id,
          type,
          active: nextActive,
        });
      } catch {
        mutatePost(post.id, () => post);
      }
    },
    [mutatePost, session?.user.id],
  );

  const handleShare = useCallback(
    async (post: CommunityPost) => {
      mutatePost(post.id, (current) => ({
        ...current,
        shares: current.shares + 1,
      }));

      try {
        await incrementCommunityShare(post.id);
      } catch {
        mutatePost(post.id, () => post);
      }
    },
    [mutatePost],
  );

  const handleMediaSelect = useCallback(async (file?: File) => {
    if (!file) return;
    setError(undefined);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/community/media", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        error?: string;
        media?: CommunityMedia;
      };

      if (!response.ok || !payload.media) {
        throw new Error(payload.error || "Failed to upload media");
      }

      setMedia(payload.media);
      setPostType("media");
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Failed to upload media",
      );
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handlePost = useCallback(async () => {
    if (!newPost.trim()) return;
    setError(undefined);
    setIsPosting(true);
    try {
      if (!session?.user.id) {
        throw new Error("You must be signed in to post");
      }

      await createCommunityPost({
        authorId: session.user.id,
        authorName: currentUserName,
        authorAvatar: currentUserAvatar,
        type: media ? "media" : postType,
        content: newPost.trim(),
        media,
      });

      setNewPost("");
      setPostType("text");
      setMedia(undefined);
    } catch (postError) {
      setError(
        postError instanceof Error
          ? postError.message
          : "Failed to create post",
      );
    } finally {
      setIsPosting(false);
    }
  }, [
    currentUserAvatar,
    currentUserName,
    media,
    newPost,
    postType,
    session?.user.id,
  ]);

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 sm:py-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Users className="size-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              Community
            </h1>
            <p className="text-sm text-muted-foreground">
              Share, learn, and connect with fellow Flare users
            </p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6 min-w-0">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="bg-card border border-border rounded-2xl p-4 sm:p-5"
          >
            <div className="flex items-start gap-3">
              <Avatar className="size-10 border">
                <AvatarImage src={currentUserAvatar || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                  {currentUserName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="mb-2 text-sm font-medium text-foreground">
                  {currentUserName}
                </p>
                <textarea
                  value={newPost}
                  onChange={(event) => setNewPost(event.target.value)}
                  placeholder={
                    postType === "research"
                      ? "Share your research, findings, or sources..."
                      : "Share something with the community..."
                  }
                  className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none min-h-[60px]"
                  rows={2}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      (event.metaKey || event.ctrlKey)
                    ) {
                      void handlePost();
                    }
                  }}
                />

                {media && (
                  <div className="mt-3 flex items-center gap-3 rounded-2xl border border-border bg-muted/20 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        {media.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {media.contentType}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-full"
                      onClick={() => {
                        setMedia(undefined);
                        setPostType("text");
                      }}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                )}

                {(error || feedError) && (
                  <p className="mt-3 text-xs text-destructive">
                    {error ||
                      (feedError instanceof Error
                        ? feedError.message
                        : "Failed to load community feed")}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-border/50">
                  <div className="flex flex-wrap items-center gap-1">
                    <input
                      ref={fileInputRef}
                      accept="image/*,video/*"
                      className="hidden"
                      type="file"
                      onChange={(event) =>
                        void handleMediaSelect(event.target.files?.[0])
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-full text-muted-foreground hover:text-primary"
                      disabled={isUploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {isUploading ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <ImageIcon className="size-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-full text-muted-foreground hover:text-primary"
                    >
                      <Smile className="size-4" />
                    </Button>
                    <Button
                      variant={postType === "research" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-8 rounded-full gap-1.5 text-xs"
                      onClick={() =>
                        setPostType((current) =>
                          current === "research" ? "text" : "research",
                        )
                      }
                    >
                      <BookOpen className="size-3.5" />
                      Research
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-full text-muted-foreground hover:text-primary"
                    >
                      <Hash className="size-4" />
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    className="rounded-full px-4 gap-1.5"
                    disabled={!newPost.trim() || isPosting || isUploading}
                    onClick={() => void handlePost()}
                  >
                    {isPosting ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : (
                      <Send className="size-3.5" />
                    )}
                    Post
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>

          <div className="flex items-center gap-1 p-1 rounded-full bg-muted/50 border border-border w-fit">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm font-medium transition-all",
                  activeTab === tab
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab}
              </button>
            ))}
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-full ml-1"
            >
              <Filter className="size-4 text-muted-foreground" />
            </Button>
          </div>

          <div className="space-y-4">
            {isLoading ? (
              <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                Loading community posts...
              </div>
            ) : feedError ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
                {feedError instanceof Error
                  ? feedError.message
                  : "Failed to load community feed"}
              </div>
            ) : posts.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                No posts yet. Start the community conversation.
              </div>
            ) : (
              posts.map((post, index) => (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <PostCard
                    post={post}
                    onLike={(current) => void updateReaction(current, "like")}
                    onBookmark={(current) =>
                      void updateReaction(current, "bookmark")
                    }
                    onShare={(current) => void handleShare(current)}
                  />
                </motion.div>
              ))
            )}
          </div>
        </div>

        <aside className="hidden lg:block space-y-5">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="bg-card border border-border rounded-2xl p-5"
          >
            <h3 className="font-semibold text-sm text-foreground mb-4 flex items-center gap-2">
              <Award className="size-4 text-primary" />
              Community Stats
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: "Members",
                  value: data?.stats.members ?? 0,
                  icon: Users,
                },
                {
                  label: "Posts Today",
                  value: data?.stats.postsToday ?? 0,
                  icon: MessageCircle,
                },
                {
                  label: "Active Now",
                  value: data?.stats.activeNow ?? 0,
                  icon: TrendingUp,
                },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="p-2 rounded-xl bg-primary/5 mx-auto w-fit mb-1.5">
                    <stat.icon className="size-4 text-primary" />
                  </div>
                  <div className="text-lg font-bold text-foreground">
                    {stat.value}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="bg-card border border-border rounded-2xl p-5"
          >
            <h3 className="font-semibold text-sm text-foreground mb-4 flex items-center gap-2">
              <TrendingUp className="size-4 text-primary" />
              Trending Topics
            </h3>
            <div className="space-y-3">
              {(data?.trendingTopics ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Tags will appear once people start posting.
                </p>
              ) : (
                data?.trendingTopics.map((topic, index) => (
                  <div
                    key={topic.tag}
                    className="flex items-center gap-3 group"
                  >
                    <span className="text-xs font-mono text-muted-foreground w-4">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground flex items-center gap-1">
                        <Hash className="size-3" />
                        {topic.tag}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {topic.count} posts
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="bg-card border border-border rounded-2xl p-5"
          >
            <h3 className="font-semibold text-sm text-foreground mb-4 flex items-center gap-2">
              <Star className="size-4 text-amber-500" />
              Top Contributors
            </h3>
            <div className="space-y-3">
              {(data?.topContributors ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Contributors will appear after the first posts.
                </p>
              ) : (
                data?.topContributors.map((contributor) => (
                  <div key={contributor.id} className="flex items-center gap-3">
                    <Avatar className="size-8 border">
                      <AvatarImage src={contributor.avatar ?? undefined} />
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {contributor.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground truncate block">
                        {contributor.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <ThumbsUp className="size-3" />
                      {contributor.points}
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.5 }}
            className="bg-gradient-to-br from-primary/5 via-card to-card border border-border rounded-2xl p-5"
          >
            <h3 className="font-semibold text-sm text-foreground mb-3">
              Join us on Telegram
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Get real-time help, chat with the team, and join community events.
            </p>
            <Button
              className="w-full rounded-full text-sm"
              size="sm"
              onClick={() =>
                window.open("https://t.me/VoidzeroX", "_blank")
              }
            >
              Open Telegram
            </Button>
          </motion.div>
        </aside>
      </div>
    </div>
  );
}

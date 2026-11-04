"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";
import { Button } from "ui/button";
import { Label } from "ui/label";
import { Shield, Lock, UserCheck, AlertTriangle, Trash2 } from "lucide-react";
import { BasicUserWithLastLogin } from "app-types/user";
import { UserRoleBadges } from "./user-role-badges";
import { UserStatusBadge } from "./user-status-badge";
import { UserRoleSelector } from "./user-role-selection-dialog";
import { UserTierSelector } from "./user-tier-selection-dialog";
import { UpdateUserPasswordDialog } from "./user-update-password-dialog";
import { UserDeleteDialog } from "./user-delete-dialog";
import { useProfileTranslations } from "@/hooks/use-profile-translations";
import { Badge } from "ui/badge";
import {
  normalizeSubscriptionTier,
  subscriptionTiersInfo,
} from "app-types/subscription";
import useSWR from "swr";
import { fetcher } from "lib/utils";

interface UserAccessCardProps {
  user: BasicUserWithLastLogin;
  currentUserId: string;
  userAccountInfo?: {
    hasPassword: boolean;
    oauthProviders: string[];
  };
  onUserDetailsUpdate: (user: Partial<BasicUserWithLastLogin>) => void;
  view?: "admin" | "user";
  disabled?: boolean;
}

export function UserAccessCard({
  user,
  currentUserId,
  userAccountInfo,
  onUserDetailsUpdate,
  view,
  disabled = false,
}: UserAccessCardProps) {
  const { t, tCommon } = useProfileTranslations(view);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [showTierDialog, setShowTierDialog] = useState(false);
  const tierInfo = subscriptionTiersInfo[normalizeSubscriptionTier(user.tier)];
  const isOwnProfile = useMemo(
    () => user.id === currentUserId,
    [user.id, currentUserId],
  );
  const { data: usageData } = useSWR<{
    tier: string;
    isFreeTier: boolean;
    limits: {
      dailyTokens: number;
      dailyImageGenerations: number;
      dailyImageEdits: number;
    } | null;
    usage: {
      tokensUsed: number;
      imageGenerationsUsed: number;
      imageEditsUsed: number;
    } | null;
    remaining: {
      tokens: number;
      imageGenerations: number;
      imageEdits: number;
    } | null;
    percentUsed: number;
  }>(isOwnProfile ? "/api/user/usage" : null, fetcher);

  const handleUserUpdate = (updatedUser: Partial<BasicUserWithLastLogin>) => {
    onUserDetailsUpdate(updatedUser);
  };

  return (
    <>
      <Card className="transition-all duration-200 hover:shadow-md">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            {tCommon("accessAndAccount")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("accessCardDescription")}
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Roles Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                {t("roles")}
              </Label>
              {user.id !== currentUserId && view === "admin" && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowRoleDialog(true)}
                  disabled={disabled}
                  className="h-8 text-xs"
                  data-testid="edit-roles-button"
                >
                  {tCommon("editRoles")}
                </Button>
              )}
            </div>

            <div className="rounded-lg border bg-muted/30 p-3">
              <UserRoleBadges
                user={user}
                showBanned={false}
                view={view}
                onRoleClick={
                  user.id !== currentUserId && view === "admin"
                    ? () => setShowRoleDialog(true)
                    : undefined
                }
                disabled={user.id === currentUserId || disabled}
                className="mt-0"
              />
              {user.id === currentUserId && (
                <p className="text-xs text-muted-foreground mt-2">
                  {t("cannotModifyOwnRole")}
                </p>
              )}
            </div>
          </div>

          {/* Daily Usage (Free Tier) */}
          {isOwnProfile &&
            usageData?.isFreeTier &&
            usageData.limits &&
            usageData.usage && (
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  Usage
                </Label>
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="h-3 w-full rounded-full bg-muted">
                    <div
                      className="h-3 rounded-full bg-primary transition-all"
                      style={{
                        width: `${Math.min(100, usageData.percentUsed)}%`,
                      }}
                    />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {usageData.percentUsed}% used
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Tokens: {usageData.usage.tokensUsed.toLocaleString()} /{" "}
                    {usageData.limits.dailyTokens.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Image generations: {usageData.usage.imageGenerationsUsed} /{" "}
                    {usageData.limits.dailyImageGenerations}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Image edits: {usageData.usage.imageEditsUsed} /{" "}
                    {usageData.limits.dailyImageEdits}
                  </div>
                </div>
              </div>
            )}

          {/* Subscription Tier Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Subscription Tier
              </Label>
              {view === "admin" && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowTierDialog(true)}
                  disabled={disabled}
                  className="h-8 text-xs"
                  data-testid="edit-tier-button"
                >
                  Edit Tier
                </Button>
              )}
            </div>

            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" data-testid="user-tier-badge">
                  {tierInfo.label}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  INR {tierInfo.pricePerMonthInr.toLocaleString("en-IN")}/month
                </span>
              </div>
            </div>
          </div>

          {/* Account Status Section */}
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4" />
              {t("accountStatus")}
            </Label>

            <div className="rounded-lg border bg-muted/30 p-3">
              <UserStatusBadge
                user={user}
                onStatusChange={handleUserUpdate}
                currentUserId={currentUserId}
                disabled={disabled}
                showClickable={view === "admin"}
                view={view}
              />
              {user.banned && (
                <p className="text-xs text-muted-foreground mt-2">
                  {t("userBannedDescription")}
                </p>
              )}
            </div>
          </div>

          {/* Password Section */}
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Lock className="h-4 w-4" />
              {tCommon("security")}
            </Label>

            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {tCommon("passwordManagement")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {userAccountInfo?.hasPassword
                      ? t("userHasPassword")
                      : t("userOAuthOnly")}
                  </p>
                </div>

                <UpdateUserPasswordDialog
                  userId={user.id}
                  view={view}
                  currentUserId={currentUserId}
                >
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={disabled || !userAccountInfo?.hasPassword}
                    className="h-8 text-xs"
                    data-testid="update-password-button"
                  >
                    <Lock className="w-3 h-3 mr-1" />
                    {t("updatePassword")}
                  </Button>
                </UpdateUserPasswordDialog>
              </div>
            </div>
          </div>

          {/* Danger Zone Section */}
          {view === "admin" && user.id !== currentUserId && (
            <div className="space-y-3 pt-4 border-t">
              <Label className="text-sm font-medium flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                {tCommon("dangerZone")}
              </Label>

              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-destructive">
                      {t("deleteUser")}
                    </p>
                    <p className="text-xs text-destructive/80">
                      {t("deleteUserPermanently")}
                    </p>
                  </div>

                  <UserDeleteDialog user={user} view={view}>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-8 text-xs"
                      data-testid="delete-user-button"
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      {t("deleteUser")}
                    </Button>
                  </UserDeleteDialog>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <UserRoleSelector
        user={user}
        onRoleChange={handleUserUpdate}
        open={showRoleDialog}
        onOpenChange={setShowRoleDialog}
        view={view}
      />

      <UserTierSelector
        user={user}
        onTierChange={handleUserUpdate}
        open={showTierDialog}
        onOpenChange={setShowTierDialog}
      />
    </>
  );
}

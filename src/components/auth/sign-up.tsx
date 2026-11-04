"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { SocialAuthenticationProvider } from "app-types/authentication";
import SocialProviders from "./social-providers";
import { authClient } from "auth/client";
import { toast } from "sonner";
import { startTransition } from "react";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";

const DASHBOARD_PATH = "/dashboard";

export default function SignUpPage({
  socialAuthenticationProviders,
  isFirstUser,
}: {
  socialAuthenticationProviders: SocialAuthenticationProvider[];
  isFirstUser: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileExpired, setTurnstileExpired] = useState(false);

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    // Site key configured → require a fresh token. If the token
    // expired mid-form-fill, the widget will auto-refresh but if the
    // user is racing the submit button we block and ask for a moment.
    if (
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY &&
      (!turnstileToken || turnstileExpired)
    ) {
      toast.error("Please complete the security check below.");
      return;
    }
    setLoading(true);
    startTransition(async () => {
      try {
        const { error } = await authClient.signUp.email({
          email,
          password,
          name: name.trim(),
        });
        if (error) {
          toast.error(error.message || String(error));
          setLoading(false);
          return;
        }
        toast.success("Account created! Redirecting...");
        router.push(DASHBOARD_PATH);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to sign up");
        setLoading(false);
      }
    });
  };

  const handleSocialSignIn = (provider: SocialAuthenticationProvider) => {
    // Better Auth defaults the social callback to `/` if no
    // `callbackURL` is given. We want OAuth users to land on the
    // dashboard, not the marketing page. The dashboard route already
    // has its own server-side auth check that 307s the user out if
    // the session never got minted.
    startTransition(async () => {
      try {
        await authClient.signIn.social({
          provider,
          callbackURL: DASHBOARD_PATH,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Unknown error");
      }
    });
  };

  return (
    <Card className="w-full md:max-w-md bg-background border-none mx-auto shadow-none">
      <CardHeader>
        <CardTitle className="text-2xl text-center ">
          {isFirstUser ? t("Auth.SignUp.titleAdmin") : t("Auth.SignUp.title")}
        </CardTitle>
        <CardDescription className="text-center">
          {isFirstUser
            ? t("Auth.SignUp.signUpDescriptionAdmin")
            : t("Auth.SignUp.signUpDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <form onSubmit={handleEmailSignUp} className="flex flex-col gap-3">
          <Input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
          <Input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-7 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <TurnstileWidget
            mode="explicit"
            action="signup"
            onVerify={(token) => {
              setTurnstileToken(token);
              setTurnstileExpired(false);
            }}
            onExpire={() => {
              setTurnstileExpired(true);
              setTurnstileToken(null);
            }}
            onError={() => {
              setTurnstileToken(null);
              setTurnstileExpired(true);
            }}
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </form>

        {socialAuthenticationProviders.length > 0 && (
          <>
            <div className="flex items-center gap-2 my-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">
                or continue with
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <SocialProviders
              socialAuthenticationProviders={socialAuthenticationProviders}
              onSocialProviderClick={handleSocialSignIn}
            />
          </>
        )}
        <div className="my-8 text-center text-sm text-muted-foreground">
          {t("Auth.SignUp.haveAccount")}{" "}
          <Link href="/sign-in" className="underline-offset-4 text-primary">
            {t("Auth.SignUp.signIn")}
          </Link>
        </div>
        <div className="mt-2 text-center text-xs text-muted-foreground">
          By continuing, you agree to our
          <Link
            href="/terms-of-service"
            className="ml-1 underline-offset-4 text-primary"
          >
            Terms of Service
          </Link>{" "}
          and
          <Link
            href="/privacy-policy"
            className="underline-offset-4 text-primary"
          >
            Privacy Policy
          </Link>
          .
        </div>
      </CardContent>
    </Card>
  );
}

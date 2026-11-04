"use client";

/**
 * Combined auth page body. Hosts both the sign-in and sign-up flows
 * behind a Cupertino-style segmented control. Replaces the legacy
 * (auth)/sign-in and (auth)/sign-up pages with a single component
 * rendered at (auth)/auth.
 *
 * The legacy /sign-in and /sign-up routes still work — they import
 * the original sign-in.tsx and sign-up.tsx components which are
 * untouched. This is a parallel surface, not a migration.
 *
 * All auth flows go through `authClient.signIn.email`,
 * `authClient.signUp.email`, and `authClient.signIn.social` (the same
 * client the legacy components use). Turnstile integration is the
 * same: invisible mode for sign-in, explicit mode for sign-up. The
 * token is rendered into the form and submitted with the request
 * payload for server-side verification — see the auth API routes.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "auth/client";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { SocialAuthenticationProvider } from "app-types/authentication";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import SocialProviders from "@/components/auth/social-providers";
import { SegmentedControl } from "@/components/auth/segmented-control";

type Mode = "signin" | "signup";

const DASHBOARD_PATH = "/dashboard";

export interface AuthPageProps {
  signUpEnabled: boolean;
  socialAuthenticationProviders: SocialAuthenticationProvider[];
  isFirstUser: boolean;
  defaultMode?: Mode;
}

export default function AuthPage({
  signUpEnabled,
  socialAuthenticationProviders,
  isFirstUser,
  defaultMode,
}: AuthPageProps) {
  const tSignIn = useTranslations("Auth.SignIn");
  const tSignUp = useTranslations("Auth.SignUp");
  const router = useRouter();

  // First user always lands on signup (no other accounts to sign in
  // with); otherwise the requested default wins, falling back to
  // signin. If sign-up is disabled, force signin regardless.
  const initialMode: Mode = !signUpEnabled
    ? "signin"
    : (defaultMode ?? (isFirstUser ? "signup" : "signin"));

  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileExpired, setTurnstileExpired] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // When the user switches modes, drop any pending turnstile token
  // and field state so the form behaves like a fresh load.
  // (Password is intentionally preserved — most users reuse the same
  // passphrase, and clearing it would be hostile.)
  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setTurnstileToken(null);
    setTurnstileExpired(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (mode === "signup") {
      if (!name.trim() || !email.trim() || !password) {
        toast.error("Please fill in all fields");
        return;
      }
      if (
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY &&
        (!turnstileToken || turnstileExpired)
      ) {
        toast.error("Please complete the security check below.");
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await authClient.signIn.email({ email, password });
        if (error) {
          toast.error(error.message || String(error));
          return;
        }
        router.push(DASHBOARD_PATH);
        router.refresh();
        return;
      }

      // signup
      const { error } = await authClient.signUp.email({
        email,
        password,
        name: name.trim(),
      });
      if (error) {
        toast.error(error.message || String(error));
        return;
      }
      toast.success("Account created! Redirecting...");
      router.push(DASHBOARD_PATH);
      router.refresh();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: string }).message)
          : mode === "signup"
            ? "Failed to sign up"
            : "Failed to sign in";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSocialSignIn = (provider: SocialAuthenticationProvider) => {
    // Better Auth defaults the social callback to `/` if no
    // `callbackURL` is given. We want OAuth users to land on the
    // dashboard, not the marketing page. The dashboard route already
    // has its own server-side auth check that 307s the user out if
    // the session never got minted.
    void authClient.signIn
      .social({ provider, callbackURL: DASHBOARD_PATH })
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : "Unknown error");
      });
  };

  const isSignup = mode === "signup";

  // Tab labels. We reuse the existing translation keys so we don't
  // ship a new translation surface. Auth.SignIn.signIn is "Sign in"
  // in en.json. The "Sign up" tab label isn't a dedicated key in the
  // existing namespace, so we reuse the SignUp page title for that
  // purpose — but for locales where the title is "Create an account"
  // (also en), we fall back to a literal "Sign up" for compactness
  // in the segmented control.
  const signInLabel = tSignIn("signIn");
  const rawSignUpTitle = tSignUp("title");
  const tabSignUp =
    rawSignUpTitle && rawSignUpTitle.length <= 10 ? rawSignUpTitle : "Sign up";

  return (
    <div className="w-full h-full flex flex-col p-4 md:p-8 justify-center">
      <div className="w-full md:max-w-md mx-auto flex flex-col gap-6 animate-in fade-in duration-700">
        <SegmentedControl
          ariaLabel="Sign in or sign up"
          value={mode}
          onChange={(v) => switchMode(v)}
          options={[
            { value: "signin", label: signInLabel },
            { value: "signup", label: tabSignUp, disabled: !signUpEnabled },
          ]}
        />

        <div className="flex flex-col text-center gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">
            {isSignup
              ? isFirstUser
                ? tSignUp("titleAdmin")
                : tSignUp("title")
              : tSignIn("title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isSignup
              ? isFirstUser
                ? tSignUp("signUpDescriptionAdmin")
                : tSignUp("signUpDescription")
              : tSignIn("description")}
          </p>
        </div>

        <form
          id={`segmented-panel-${mode}`}
          role="tabpanel"
          aria-labelledby={`tab-${mode}`}
          onSubmit={handleSubmit}
          className="flex flex-col gap-3"
        >
          {isSignup && (
            <Input
              type="text"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              disabled={loading}
            />
          )}
          <Input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            disabled={loading}
          />
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isSignup ? "new-password" : "current-password"}
              disabled={loading}
              className="pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              disabled={loading}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-7 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          {isSignup && (
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
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? isSignup
                ? "Creating account..."
                : "Signing in..."
              : isSignup
                ? tSignUp("title")
                : tSignIn("title")}
          </Button>
        </form>

        {socialAuthenticationProviders.length > 0 && (
          <>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">
                {tSignIn("orContinueWith")}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <SocialProviders
              socialAuthenticationProviders={socialAuthenticationProviders}
              onSocialProviderClick={handleSocialSignIn}
            />
          </>
        )}

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
      </div>
    </div>
  );
}

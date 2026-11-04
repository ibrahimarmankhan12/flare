import AuthPage from "@/components/auth/auth-page";
import { getAuthConfig } from "lib/auth/config";
import { getIsFirstUser } from "lib/auth/server";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in or sign up",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AuthRoute() {
  const isFirstUser = await getIsFirstUser();
  const { socialAuthenticationProviders, signUpEnabled } = getAuthConfig();

  const enabledProviders = (
    Object.keys(
      socialAuthenticationProviders,
    ) as (keyof typeof socialAuthenticationProviders)[]
  ).filter((key) => socialAuthenticationProviders[key]);

  return (
    <AuthPage
      signUpEnabled={signUpEnabled}
      socialAuthenticationProviders={enabledProviders}
      isFirstUser={isFirstUser}
    />
  );
}

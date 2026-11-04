import SignUpPage from "@/components/auth/sign-up";
import { getAuthConfig } from "lib/auth/config";
import { getIsFirstUser } from "lib/auth/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SignUp() {
  const isFirstUser = await getIsFirstUser();
  const { socialAuthenticationProviders, signUpEnabled } = getAuthConfig();

  if (!signUpEnabled) {
    redirect("/sign-in");
  }
  const enabledProviders = (
    Object.keys(
      socialAuthenticationProviders,
    ) as (keyof typeof socialAuthenticationProviders)[]
  ).filter((key) => socialAuthenticationProviders[key]);
  return (
    <SignUpPage
      isFirstUser={isFirstUser}
      socialAuthenticationProviders={enabledProviders}
    />
  );
}

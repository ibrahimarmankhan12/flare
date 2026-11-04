import SignIn from "@/components/auth/sign-in";
import { getAuthConfig } from "lib/auth/config";

export default async function SignInPage() {
  const { signUpEnabled, socialAuthenticationProviders } = getAuthConfig();
  const enabledProviders = (
    Object.keys(
      socialAuthenticationProviders,
    ) as (keyof typeof socialAuthenticationProviders)[]
  ).filter((key) => socialAuthenticationProviders[key]);
  return (
    <SignIn
      signUpEnabled={signUpEnabled}
      socialAuthenticationProviders={enabledProviders}
    />
  );
}

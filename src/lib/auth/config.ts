import {
  AuthConfig,
  AuthConfigSchema,
  GitHubConfig,
  GitHubConfigSchema,
  GoogleConfig,
  GoogleConfigSchema,
  MicrosoftConfig,
  MicrosoftConfigSchema,
} from "app-types/authentication";
// Conditionally import React taint
let experimental_taintUniqueValue: any = () => {};
try {
  // Only use taint in Next.js runtime
  if (typeof window !== "undefined" || process.env.NEXT_RUNTIME) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const react = require("react");
    experimental_taintUniqueValue = react.experimental_taintUniqueValue;
  }
} catch (_e) {
  // No-op for non-React contexts
}
import { parseEnvBoolean } from "../utils";

// P4.A — Better Auth's organization() plugin is enabled for auth flows
// (createOrganization / invitations / active organization helpers), while
// Flare's canonical organization table remains `team`.
export const BETTER_AUTH_ORGANIZATION_PLUGIN_ENABLED = true;

const getCleanEnv = (key: string) => process.env[key]?.trim();

function parseSocialAuthConfigs() {
  const configs: {
    github?: GitHubConfig;
    google?: GoogleConfig;
    microsoft?: MicrosoftConfig;
  } = {};
  const disableSignUp = parseEnvBoolean(process.env.DISABLE_SIGN_UP);
  const githubClientId = getCleanEnv("GITHUB_CLIENT_ID");
  const githubClientSecret = getCleanEnv("GITHUB_CLIENT_SECRET");
  const googleClientId = getCleanEnv("GOOGLE_CLIENT_ID");
  const googleClientSecret = getCleanEnv("GOOGLE_CLIENT_SECRET");
  const microsoftClientId = getCleanEnv("MICROSOFT_CLIENT_ID");
  const microsoftClientSecret = getCleanEnv("MICROSOFT_CLIENT_SECRET");

  if (githubClientId && githubClientSecret) {
    const githubResult = GitHubConfigSchema.safeParse({
      clientId: githubClientId,
      clientSecret: githubClientSecret,
      disableSignUp,
    });
    if (githubResult.success) {
      configs.github = githubResult.data;
      experimental_taintUniqueValue(
        "Do not pass GITHUB_CLIENT_SECRET to the client",
        configs,
        configs.github.clientSecret,
      );
    }
  }

  if (googleClientId && googleClientSecret) {
    const forceAccountSelection = parseEnvBoolean(
      process.env.GOOGLE_FORCE_ACCOUNT_SELECTION,
    );

    const googleConfig: GoogleConfig = {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      ...(forceAccountSelection && { prompt: "select_account" as const }),
      disableSignUp,
    };

    const googleResult = GoogleConfigSchema.safeParse(googleConfig);
    if (googleResult.success) {
      configs.google = googleResult.data;
      experimental_taintUniqueValue(
        "Do not pass GOOGLE_CLIENT_SECRET to the client",
        configs,
        configs.google.clientSecret,
      );
    }
  }

  if (microsoftClientId && microsoftClientSecret) {
    const forceAccountSelection = parseEnvBoolean(
      process.env.MICROSOFT_FORCE_ACCOUNT_SELECTION,
    );
    const tenantId = getCleanEnv("MICROSOFT_TENANT_ID") || "common";

    const microsoftConfig: MicrosoftConfig = {
      clientId: microsoftClientId,
      clientSecret: microsoftClientSecret,
      tenantId,
      ...(forceAccountSelection && { prompt: "select_account" as const }),
      disableSignUp,
    };

    const microsoftResult = MicrosoftConfigSchema.safeParse(microsoftConfig);
    if (microsoftResult.success) {
      configs.microsoft = microsoftResult.data;
      experimental_taintUniqueValue(
        "Do not pass MICROSOFT_CLIENT_SECRET to the client",
        configs,
        configs.microsoft.clientSecret,
      );
    }
  }

  return configs;
}

export function getAuthConfig(): AuthConfig {
  const enableEmailPassword = !parseEnvBoolean(
    process.env.DISABLE_EMAIL_SIGN_IN,
  );
  const rawConfig = {
    emailAndPasswordEnabled: enableEmailPassword,
    signUpEnabled: process.env.DISABLE_SIGN_UP
      ? !parseEnvBoolean(process.env.DISABLE_SIGN_UP)
      : true,
    socialAuthenticationProviders: parseSocialAuthConfigs(),
  };

  const result = AuthConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    throw new Error(`Invalid auth configuration: ${result.error.message}`);
  }

  return result.data;
}

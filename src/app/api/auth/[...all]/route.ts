import { auth } from "auth/server";
import { toNextJsHandler } from "better-auth/next-js";

const handlers = toNextJsHandler(auth.handler);

const getAuthEnvDiagnostics = () => ({
  hasBetterAuthSecret: Boolean(process.env.BETTER_AUTH_SECRET),
  hasBaseUrl: Boolean(
    process.env.FLARE_AUTH_URL || process.env.NEXT_PUBLIC_BASE_URL,
  ),
  hasGoogleClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
  hasGoogleClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
  hasGithubClientId: Boolean(process.env.GITHUB_CLIENT_ID),
  hasGithubClientSecret: Boolean(process.env.GITHUB_CLIENT_SECRET),
  hasMicrosoftClientId: Boolean(process.env.MICROSOFT_CLIENT_ID),
  hasMicrosoftClientSecret: Boolean(process.env.MICROSOFT_CLIENT_SECRET),
});

const logAuthRouteError = async (request: Request, error: unknown) => {
  let body: unknown;
  try {
    body = await request.clone().json();
  } catch {
    body = undefined;
  }

  console.error("[AuthRoute] Better Auth handler failed", {
    method: request.method,
    url: request.url,
    body,
    env: getAuthEnvDiagnostics(),
    error,
  });
};

export const GET = async (request: Request) => {
  try {
    return await handlers.GET(request);
  } catch (error) {
    await logAuthRouteError(request, error);
    throw error;
  }
};

export const POST = async (request: Request) => {
  try {
    return await handlers.POST(request);
  } catch (error) {
    await logAuthRouteError(request, error);
    throw error;
  }
};

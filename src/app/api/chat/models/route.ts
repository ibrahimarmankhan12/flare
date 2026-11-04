import { getSession } from "auth/server";
import { customModelProvider } from "lib/ai/models";
import { sortProvidersFlareFirst } from "lib/ai/sort-providers";

export const GET = async () => {
  // Requires a session: this payload reveals which provider API keys are
  // configured on the deployment plus internal capability flags — useful
  // recon for anonymous attackers choosing abuse targets.
  const session = await getSession();
  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const providers = customModelProvider.modelsInfo.sort((a, b) => {
    if (a.hasAPIKey && !b.hasAPIKey) return -1;
    if (!a.hasAPIKey && b.hasAPIKey) return 1;
    return 0;
  });
  // Pin the Flare provider at the top so the first provider cached
  // by the chat-models SWR (which seeds `appStore.chatModel`) is Flare
  // when present.
  return Response.json(sortProvidersFlareFirst(providers));
};

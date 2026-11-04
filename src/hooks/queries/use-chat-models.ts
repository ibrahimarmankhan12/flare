import { appStore } from "@/app/store";
import { fetcher } from "lib/utils";
import useSWR, { SWRConfiguration } from "swr";

export const useChatModels = (options?: SWRConfiguration) => {
  return useSWR<
    {
      provider: string;
      hasAPIKey: boolean;
      models: {
        name: string;
        isToolCallUnsupported: boolean;
        isImageInputUnsupported: boolean;
        isBlackboxModel: boolean;
        supportedFileMimeTypes: string[];
      }[];
    }[]
  >("/api/chat/models", fetcher, {
    dedupingInterval: 60_000 * 5,
    refreshInterval: 15_000,
    revalidateOnFocus: true,
    fallbackData: [],
    onSuccess: (data) => {
      const status = appStore.getState();
      if (!status.chatModel) {
        // Prefer the Flare deepseek.v3.2 workhorse as the out-of-box default;
        // fall back to whatever the API lists first otherwise.
        const flare = data.find((p) => p.provider.toLowerCase() === "flare");
        const preferred = flare?.models.find(
          (m) =>
            m.name.toLowerCase().includes("deepseek") &&
            m.name.includes("v3.2"),
        );
        const provider = preferred ? flare! : data[0];
        const model = preferred?.name ?? data[0]?.models[0]?.name;
        if (provider && model) {
          appStore.setState({
            chatModel: { provider: provider.provider, model },
          });
        }
      }
    },
    ...options,
  });
};

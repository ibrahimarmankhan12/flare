import { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { FlipWords } from "ui/flip-words";
import { AuthIntroDecoration } from "@/components/auth/auth-intro-decoration";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AuthLayout({
  children,
}: { children: React.ReactNode }) {
  const t = await getTranslations("Auth.Intro");
  return (
    <main className="relative w-full flex flex-col h-screen">
      <div className="flex-1">
        <div className="flex min-h-screen w-full">
          <div className="hidden lg:flex lg:w-1/2 bg-muted border-r flex-col p-18 relative">
            <h1 className="text-xl font-semibold flex items-center gap-3 animate-in fade-in duration-1000">
              <Image
                src="/flare-logo-192.webp"
                alt="Flare AI Logo"
                width={24}
                height={24}
                className="object-contain"
              />

              <span>Chat Bot</span>
            </h1>
            <AuthIntroDecoration />
            <FlipWords
              words={[t("description")]}
              className=" mb-4 text-muted-foreground"
            />
          </div>

          <div className="w-full lg:w-1/2 p-6">{children}</div>
        </div>
      </div>
    </main>
  );
}

"use client";

import { SmoothScroll } from "@/components/landing/SmoothScroll";

// ── Section imports ──────────────────────────────────────────────────────────
import { Navbar } from "@/components/landing/sections/Navbar";
import { Hero } from "@/components/landing/sections/Hero";
import { BuiltToScale } from "@/components/landing/sections/BuiltToScale";
import { AtomsSection } from "@/components/landing/sections/AtomsSection";
import { PlatformUI } from "@/components/landing/sections/PlatformUI";
// import { DeveloperSection } from "@/components/landing/sections/DeveloperSection";
import { EnterpriseSecurity } from "@/components/landing/sections/EnterpriseSecurity";
import { MachineIntelligence } from "@/components/landing/sections/MachineIntelligence";
import { Thesis } from "@/components/landing/sections/Thesis";
import { LatestResearch } from "@/components/landing/sections/LatestResearch";
// import { CareersCTA } from "@/components/landing/sections/CareersCTA";
import { ConnectSection } from "@/components/landing/sections/ConnectSection";
import { Footer } from "@/components/landing/sections/Footer";

/**
 * The actual marketing landing page body. Extracted out of the
 * `(public)/landing/page.tsx` route file so it can be rendered
 * from BOTH:
 *   - `app/page.tsx` (the canonical root `/`, gated by auth in a
 *     server component — logged-in users get redirected to
 *     `/dashboard` before this client component ever mounts)
 *   - `app/(public)/landing/page.tsx` (the `/landing` alias route
 *     for legacy / external links; no auth gate, identical body)
 */
export default function LandingPageBody() {
  return (
    <SmoothScroll>
      <div
        style={{
          overflowX: "hidden",
          background: "#000000",
          position: "relative",
        }}
      >
        {/* Global ambient glows like plans page */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -160,
            left: "50%",
            transform: "translateX(-50%)",
            width: "1100px",
            height: "600px",
            borderRadius: "9999px",
            opacity: 0.3,
            filter: "blur(80px)",
            pointerEvents: "none",
            background:
              "radial-gradient(ellipse, rgba(61,158,140,0.45), transparent 60%)",
            zIndex: 2,
          }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: "30%",
            right: -160,
            width: "400px",
            height: "400px",
            borderRadius: "9999px",
            opacity: 0.25,
            filter: "blur(80px)",
            pointerEvents: "none",
            background:
              "radial-gradient(circle, rgba(61,158,140,0.5), transparent 70%)",
            zIndex: 2,
          }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute",
            bottom: "10%",
            left: -160,
            width: "500px",
            height: "500px",
            borderRadius: "9999px",
            opacity: 0.2,
            filter: "blur(80px)",
            pointerEvents: "none",
            background:
              "radial-gradient(circle, rgba(61,158,140,0.45), transparent 70%)",
            zIndex: 2,
          }}
        />

        <Navbar />
        <Hero />
        <BuiltToScale />
        <AtomsSection />
        <PlatformUI />
        {/* <DeveloperSection /> */}
        <EnterpriseSecurity />
        <MachineIntelligence />
        <Thesis />
        <LatestResearch />
        {/* <CareersCTA /> */}
        <ConnectSection />
        <Footer />
      </div>
    </SmoothScroll>
  );
}

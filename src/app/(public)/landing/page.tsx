// Legacy `/landing` route — kept for back-compat with any external
// links that still hit it. The body now lives in a reusable client
// component that the root `/` page also renders.
//
// This file is intentionally a server component (no "use client")
// so that it Just Works without auth gating — `/landing` is meant
// to be a public marketing page regardless of session state.
import LandingPageBody from "@/components/landing/landing-page-body";

export default function LandingPage() {
  return <LandingPageBody />;
}

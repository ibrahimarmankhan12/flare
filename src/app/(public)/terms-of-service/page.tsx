import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { LogIn } from "lucide-react";

type Section = {
  id: string;
  title: string;
  summary: string;
  paragraphs?: string[];
  bullets?: string[];
  highlightParagraph?: string;
  subSections?: {
    title: string;
    paragraphs?: string[];
    bullets?: string[];
    table?: { headers: string[]; rows: string[][] };
  }[];
  table?: { headers: string[]; rows: string[][] };
  links?: { label: string; href: string }[];
};

const sections: Section[] = [
  {
    id: "introduction",
    title: "Introduction",
    summary: "What Flare is and what these Terms cover.",
    paragraphs: [
      'Welcome to Flare ("Flare", "we", "us", "our") — an AI-powered chat and productivity platform that brings together multiple state-of-the-art AI models, image generation and editing tools, voice interaction, and web-aware AI assistance in a single unified interface.',
      "Flare is designed for students, developers, creators, researchers, and professionals who want a smarter, more versatile AI workspace — similar in spirit to platforms like ChatGPT, Claude, and Perplexity, but built with a focus on multi-model flexibility and an all-in-one experience.",
      "These Terms of Service govern your access to and use of:",
    ],
    bullets: [
      "The Flare web application at https://flare-sh.tech",
      "Any Flare mobile applications (current or future)",
      "Any APIs or developer tools offered by Flare",
      "All features, content, and services provided under the Flare brand",
    ],
  },
  {
    id: "acceptance-of-terms",
    title: "Acceptance of Terms",
    summary: "Your agreement to be bound by these Terms.",
    paragraphs: [
      "Your use of Flare constitutes your agreement to these Terms. This agreement is effective from the date you first access or use Flare.",
      'If you are using Flare on behalf of a company, organization, or other legal entity, you represent that you have the authority to bind that entity to these Terms. In that case, "you" refers to that entity.',
      "If you do not agree with any part of these Terms, you must immediately stop using Flare.",
    ],
  },
  {
    id: "eligibility",
    title: "Eligibility",
    summary: "Who can use Flare.",
    paragraphs: ["To use Flare, you must meet the following requirements:"],
    bullets: [
      "You must be at least 13 years of age.",
      "If you are between 13 and 18, you must have parental or guardian consent to use Flare.",
      "You must have the legal capacity to enter into a binding contract in your jurisdiction.",
      "You must not be prohibited from using Flare under the laws of your country or region.",
      "You must not have had a Flare account previously terminated due to a violation of these Terms.",
    ],
    subSections: [
      {
        title: "3.1 Age Verification",
        paragraphs: [
          "We do not currently have automated age verification systems in place. If we become aware that a user is under 13 years of age, we will immediately suspend that account and delete any associated personal data in compliance with applicable law.",
        ],
      },
    ],
  },
  {
    id: "description-of-services",
    title: "Description of Services",
    summary: "What Flare offers.",
    paragraphs: ["Flare provides the following core features and services:"],
    subSections: [
      {
        title: "4.1 Multi-Model AI Chat",
        paragraphs: [
          "Access and interact with multiple large language models (LLMs) from a single interface, including:",
        ],
        bullets: [
          "Claude (by Anthropic) — Claude 3.5 Sonnet, Claude 3 Opus, and others",
          "GPT models (by OpenAI) — GPT-4o, GPT-4 Turbo, and others",
          "Gemini (by Google via GCP) — Gemini 1.5 Pro, Gemini Flash, and others",
          "Open-source models (via Groq) — DeepSeek, LLaMA, Mixtral, and others",
          "Flare proprietary models — including Flare-2o-web, Flare Reasoning Pro, and others developed internally",
        ],
      },
      {
        title: "4.2 AI Image Generation & Editing",
        paragraphs: [
          "Generate and edit images using state-of-the-art image AI models via our integrated Flare API. You can create original images from text prompts, edit existing images, and explore creative visual outputs.",
        ],
      },
      {
        title: "4.3 Voice Interaction (Voice Mode)",
        paragraphs: [
          "Use your microphone to speak with AI models directly. Voice input is transcribed in real-time and responses can be played back via text-to-speech. Voice Mode features an animated orb interface with state-based visual feedback.",
        ],
      },
      {
        title: "4.4 Web-Aware AI (Search-Enabled Models)",
        paragraphs: [
          "Some Flare models have access to real-time web search, allowing them to retrieve and synthesize up-to-date information beyond their training data cutoff.",
        ],
      },
      {
        title: "4.5 Conversation History & Management",
        paragraphs: [
          "All your conversations are saved to your account so you can revisit, continue, or delete them at any time.",
        ],
      },
      {
        title: "4.6 Account & Settings Management",
        paragraphs: [
          "Customize your experience with preferences including default model selection, interface themes, custom system prompts, and more.",
          "We reserve the right to modify, add, or remove features at any time. We will try to give reasonable notice of significant changes.",
        ],
      },
    ],
  },
  {
    id: "account-registration-security",
    title: "Account Registration & Security",
    summary: "Creating and securing your Flare account.",
    subSections: [
      {
        title: "5.1 Creating an Account",
        paragraphs: [
          "To access most features of Flare, you must register for an account. You agree to:",
        ],
        bullets: [
          "Provide accurate, complete, and current registration information.",
          "Maintain and promptly update your account information as needed.",
          "Use a real email address that you own and have access to.",
        ],
      },
      {
        title: "5.2 Account Security",
        paragraphs: [
          "You are responsible for maintaining the confidentiality of your login credentials. You agree to:",
        ],
        bullets: [
          "Choose a strong, unique password for your Flare account.",
          "Not share your password or login credentials with anyone.",
          "Log out of your account when using shared or public devices.",
          "Notify us immediately at security@flare-sh.tech if you suspect unauthorized access to your account.",
        ],
      },
      {
        title: "5.3 Account Responsibility",
        paragraphs: [
          "You are fully responsible for all activities that occur under your account, whether or not you authorized them. Flare is not liable for any loss or damage resulting from unauthorized access due to your failure to keep your credentials secure.",
        ],
      },
      {
        title: "5.4 One Account Per User",
        paragraphs: [
          "Each user may maintain only one account unless explicitly permitted by Flare. Creating multiple accounts to circumvent bans, usage limits, or free tier restrictions is prohibited.",
        ],
      },
      {
        title: "5.5 Third-Party Sign-In",
        paragraphs: [
          "If you sign in using a third-party provider (e.g., Google, GitHub), you authorize Flare to access and store the basic profile information provided by that service (typically name, email, and profile photo). Your use of third-party sign-in is also governed by that provider's terms.",
        ],
      },
    ],
  },
  {
    id: "subscription-plans-billing",
    title: "Subscription Plans & Billing",
    summary: "Pricing, payments, and refunds.",
    subSections: [
      {
        title: "6.1 Free and Paid Tiers",
        paragraphs: [
          "Flare offers both a free tier and paid subscription plans. The specific features, limits, and pricing of each plan are described on our Pricing page and may change over time.",
        ],
      },
      {
        title: "6.2 Billing & Payment",
        bullets: [
          "Paid subscriptions are billed on a recurring basis (monthly or annually, depending on your plan).",
          "Payment is processed through a third-party provider (e.g., Stripe or Razorpay).",
          "By providing payment information, you authorize Flare to charge your payment method on a recurring basis.",
          "All prices are listed in the applicable currency and are inclusive or exclusive of taxes as stated at checkout.",
        ],
      },
      {
        title: "6.3 Taxes",
        paragraphs: [
          "You are responsible for any applicable taxes, levies, or duties imposed by tax authorities in your jurisdiction. Where required by law, Flare may collect and remit taxes on your behalf.",
        ],
      },
      {
        title: "6.4 Refund Policy",
        bullets: [
          "Subscription fees are non-refundable except where required by applicable law or at our sole discretion.",
          "If you believe you were charged in error, contact us at billing@flare-sh.tech within 7 days of the charge.",
        ],
      },
      {
        title: "6.5 Plan Changes & Cancellation",
        bullets: [
          "You may upgrade, downgrade, or cancel your subscription at any time from your account settings.",
          "Cancellation takes effect at the end of the current billing period; you retain access until then.",
          "Downgrading your plan may result in reduced access to features or increased usage restrictions.",
        ],
      },
      {
        title: "6.6 Price Changes",
        paragraphs: [
          "We reserve the right to change subscription pricing. We will notify existing subscribers at least 30 days in advance of any price increase. Continued use after the price change takes effect constitutes acceptance.",
        ],
      },
    ],
  },
  {
    id: "free-tier-usage-limits",
    title: "Free Tier & Usage Limits",
    summary: "Limits and fair use for free and paid plans.",
    subSections: [
      {
        title: "7.1 Free Tier Availability",
        paragraphs: [
          "Flare offers a free tier with access to a subset of features and models. Free tier availability, feature access, and usage limits are subject to change at our discretion.",
        ],
      },
      {
        title: "7.2 Usage Quotas",
        paragraphs: [
          "All plans, including paid plans, are subject to usage limits (e.g., message limits, image generation credits, API call limits). Specific limits are described in your plan details.",
        ],
      },
      {
        title: "7.3 Fair Use",
        paragraphs: [
          "Even within stated limits, we reserve the right to throttle or restrict usage that is excessive, automated, or inconsistent with normal personal use — in order to ensure platform availability for all users.",
        ],
      },
      {
        title: "7.4 No Guarantee of Availability",
        paragraphs: [
          "Free tier features may be modified or discontinued without notice. We do not guarantee the continued availability of any free features.",
        ],
      },
    ],
  },
  {
    id: "acceptable-use-policy",
    title: "Acceptable Use Policy",
    summary: "Keep Flare safe and lawful.",
    paragraphs: [
      "You agree to use Flare only for lawful purposes and in a manner consistent with these Terms. Flare is intended to be a helpful, productive, and trustworthy AI platform. We expect all users to use it responsibly.",
    ],
    subSections: [
      {
        title: "8.1 Permitted Uses",
        paragraphs: ["You may use Flare to:"],
        bullets: [
          "Ask questions, research topics, and get AI-generated explanations.",
          "Write, edit, summarize, and brainstorm content.",
          "Generate and edit images from text prompts.",
          "Write, debug, and review code.",
          "Conduct legitimate academic, professional, or personal research.",
          "Interact with AI using voice input.",
          "Build applications using Flare's API (subject to API terms).",
        ],
      },
      {
        title: "8.2 General Standards",
        paragraphs: ["You agree not to use Flare in any way that:"],
        bullets: [
          "Violates any applicable local, national, or international law or regulation.",
          "Infringes the intellectual property rights of Flare or any third party.",
          "Harms, exploits, or endangers any person.",
          "Undermines the security, integrity, or availability of the platform.",
          "Violates the terms of the underlying AI model providers.",
        ],
      },
    ],
  },
  {
    id: "prohibited-conduct",
    title: "Prohibited Conduct",
    summary:
      "Strictly prohibited actions that may result in immediate account termination.",
    paragraphs: [
      "The following are strictly prohibited on Flare. Violations may result in immediate account suspension or termination.",
    ],
    subSections: [
      {
        title: "9.1 Illegal & Harmful Content",
        paragraphs: [
          "You may not use Flare to generate, distribute, or facilitate:",
        ],
        bullets: [
          "Child sexual abuse material (CSAM) or any content that sexually exploits minors.",
          "Content that incites, promotes, or facilitates violence against any person or group.",
          "Hate speech targeting individuals or groups based on race, religion, gender, sexual orientation, nationality, disability, or other protected characteristics.",
          "Terrorist or extremist propaganda.",
          "Content that facilitates human trafficking, exploitation, or abuse.",
        ],
      },
      {
        title: "9.2 Deception & Fraud",
        paragraphs: ["You may not use Flare to:"],
        bullets: [
          "Create deepfakes, synthetic media, or impersonations intended to deceive or defraud.",
          "Generate phishing content, scam messages, or fraudulent communications.",
          "Impersonate any person, company, or entity — including Flare staff or support.",
          "Spread deliberate misinformation or disinformation at scale.",
          "Generate fake reviews, testimonials, or endorsements.",
        ],
      },
      {
        title: "9.3 Security & System Abuse",
        paragraphs: ["You may not:"],
        bullets: [
          "Attempt to hack, reverse engineer, or exploit Flare's systems or APIs.",
          "Use automated scripts, bots, or scrapers to access Flare at scale without authorization.",
          "Attempt to extract training data or model weights from Flare or its AI providers.",
          "Launch denial-of-service (DoS) attacks or otherwise attempt to disrupt the platform.",
          "Probe or test the security of Flare without explicit written permission.",
          "Use Flare to generate malware, exploits, ransomware, or any malicious code.",
        ],
      },
      {
        title: "9.4 Privacy Violations",
        paragraphs: ["You may not use Flare to:"],
        bullets: [
          "Collect, harvest, or aggregate personal data about other users or third parties.",
          "Generate content that doxxes, stalks, or harasses individuals.",
          "Attempt to identify anonymous users or bypass anonymization.",
          "Share other people's private information without their consent.",
        ],
      },
      {
        title: "9.5 Intellectual Property Violations",
        paragraphs: ["You may not use Flare to:"],
        bullets: [
          "Reproduce or distribute copyrighted content in a way that infringes on rights holders.",
          "Generate content that plagiarizes or falsely attributes works to others.",
          "Circumvent digital rights management (DRM) or access controls.",
        ],
      },
      {
        title: "9.6 Commercial Spam & Manipulation",
        paragraphs: ["You may not use Flare to:"],
        bullets: [
          "Generate unsolicited bulk commercial messages (spam).",
          "Artificially manipulate search rankings, social media engagement, or ad systems.",
          "Create content farms or SEO manipulation schemes at scale.",
        ],
      },
      {
        title: "9.7 Platform Integrity",
        paragraphs: ["You may not:"],
        bullets: [
          "Circumvent usage limits, paywalls, or access controls.",
          "Resell or sublicense access to Flare without written permission.",
          "Create accounts for others without their knowledge.",
          "Use Flare to compete with or replicate Flare's core product.",
        ],
      },
    ],
  },
  {
    id: "data-collection-privacy",
    title: "Data Collection & Privacy",
    summary: "How we handle your data.",
    paragraphs: [
      "We believe that your privacy matters. This section summarizes how we handle your data. For full details, please read our Privacy Policy.",
    ],
    subSections: [
      {
        title: "10.1 What We Collect",
        paragraphs: ["When you use Flare, we collect:"],
        bullets: [
          "Account data — name, email address, hashed password, profile photo.",
          "Conversation data — your messages, AI responses, and chat history.",
          "Usage data — features used, session duration, model selections.",
          "Device & technical data — IP address, browser, OS, device type.",
          "Voice data — transcribed text from Voice Mode (raw audio is never stored).",
          "Image generation data — text prompts used for image generation.",
          "Payment data — billing status and tokenized payment references (via third-party processors; we never store raw card details).",
        ],
      },
      {
        title: "10.2 Why We Collect It",
        paragraphs: [
          "We collect data only to serve you — to provide, maintain, and improve Flare. We do not collect data for advertising or to sell to third parties.",
          "Specifically, we use your data to:",
        ],
        bullets: [
          "Deliver AI responses and maintain your conversation history.",
          "Authenticate your account securely.",
          "Improve platform performance, features, and reliability.",
          "Detect and prevent fraud, abuse, and security threats.",
          "Comply with legal obligations.",
        ],
      },
      {
        title: "10.3 Consent to Data Collection",
        paragraphs: [
          "By creating an account and using Flare, you consent to the collection and use of your data as described in these Terms and our Privacy Policy.",
          "You may withdraw consent at any time by deleting your account. This will trigger the deletion of your personal data from our active systems within 30 days.",
        ],
      },
      {
        title: "10.4 Cookies",
        paragraphs: [
          "We use essential, preference, analytics, and security cookies. We do not use advertising cookies. You can manage cookie preferences in your browser settings.",
        ],
      },
    ],
  },
  {
    id: "how-we-store-use-your-data",
    title: "How We Store & Use Your Data",
    summary: "Storage, retention, and access controls.",
    subSections: [
      {
        title: "11.1 Storage",
        paragraphs: [
          "Your data is stored on secure, encrypted servers. We use industry-standard encryption (TLS for data in transit, AES-256 for data at rest). Passwords are stored as secure one-way hashes — we never store plain-text passwords.",
        ],
      },
      {
        title: "11.2 Retention",
        paragraphs: [
          "We retain your data for as long as your account is active or as needed to provide our services. Key retention periods:",
        ],
        table: {
          headers: ["Data Type", "Retention"],
          rows: [
            ["Account information", "Until account deletion"],
            [
              "Conversation history",
              "Until deleted by you or account deletion",
            ],
            [
              "Voice transcription input",
              "Deleted immediately after processing",
            ],
            [
              "Usage & analytics data",
              "Up to 12 months (anonymized after 30 days)",
            ],
            ["Payment records", "Up to 7 years (legal requirement)"],
            ["Server logs", "Up to 90 days"],
          ],
        },
      },
      {
        title: "11.3 Access Controls",
        paragraphs: [
          "Access to user data is restricted to authorized Flare personnel on a strict need-to-know basis. Administrative systems require multi-factor authentication (MFA). We do not allow third parties to browse or access your personal conversations.",
        ],
      },
      {
        title: "11.4 Data Portability & Deletion",
        paragraphs: [
          "You can request a copy of your data or request its deletion at any time by contacting privacy@flare-sh.tech. We will fulfill requests within 30 days.",
        ],
      },
    ],
  },
  {
    id: "we-do-not-sell-your-data",
    title: "We Do NOT Sell Your Data",
    summary: "Our clear commitment on data monetization.",
    highlightParagraph:
      "Flare does not sell, rent, trade, or share your personal data with any third party for commercial, marketing, or advertising purposes.",
    bullets: [
      "We do not sell your email address or usage patterns to advertisers.",
      "We do not participate in data broker networks.",
      "We do not use your conversations to train AI models without your explicit opt-in consent.",
      "We do not build advertising profiles from your usage.",
    ],
    paragraphs: [
      "Our revenue comes from user subscriptions — not from monetizing your personal information.",
    ],
  },
  {
    id: "ai-conversations-generated-content",
    title: "AI Conversations & Generated Content",
    summary: "Outputs, limitations, and how you can use them.",
    subSections: [
      {
        title: "13.1 Nature of AI Responses",
        paragraphs: [
          "Flare provides access to AI language models that generate responses based on your inputs. You acknowledge that:",
        ],
        bullets: [
          "AI responses are generated automatically and may not always be accurate, complete, or appropriate.",
          "AI responses do not constitute professional advice — not legal, medical, financial, psychological, or otherwise.",
          "You should independently verify any AI-generated information before relying on it for important decisions.",
          "AI models may occasionally produce outputs that are incorrect, biased, or unexpected.",
        ],
      },
      {
        title: "13.2 No Professional Reliance",
        paragraphs: [
          "Flare is not a licensed professional service. Nothing on Flare should be treated as:",
        ],
        bullets: [
          "Legal advice or a substitute for consulting a licensed attorney.",
          "Medical advice or a substitute for consulting a licensed healthcare provider.",
          "Financial advice or a substitute for consulting a licensed financial advisor.",
          "Any other form of regulated professional service.",
        ],
      },
      {
        title: "13.3 Content Responsibility",
        paragraphs: [
          "You are solely responsible for how you use AI-generated content. Flare is not liable for any decisions you make, actions you take, or outcomes that result from your use of AI-generated outputs.",
        ],
      },
      {
        title: "13.4 Accuracy & Hallucinations",
        paragraphs: [
          'AI models can produce "hallucinations" — confidently stated but factually incorrect information. We do not guarantee the accuracy or reliability of any AI-generated content on Flare.',
        ],
      },
    ],
  },
  {
    id: "third-party-ai-providers",
    title: "Third-Party AI Providers",
    summary: "Working with external AI providers.",
    paragraphs: [
      "Flare routes your messages to external AI model APIs to generate responses. By using Flare, you acknowledge and agree that:",
    ],
    bullets: [
      "Your inputs are transmitted to third-party AI providers including Anthropic, OpenAI, Google, and Groq.",
      "These providers process your data according to their own privacy policies and terms of service.",
      "We are not responsible for the behavior, accuracy, or data practices of these third-party providers.",
      "The availability of specific AI models depends on the continued availability of these third-party APIs.",
    ],
    table: {
      headers: ["Provider", "Terms of Service"],
      rows: [
        ["Anthropic (Claude)", "anthropic.com/legal"],
        ["OpenAI (GPT)", "openai.com/policies"],
        ["Google (Gemini)", "policies.google.com"],
        ["Groq", "groq.com/terms"],
      ],
    },
  },
  {
    id: "integrations-mcp-connectors",
    title: "Integrations, MCP & Connectors",
    summary: "How we connect to external data sources.",
    paragraphs: [
      "Flare allows you to connect external data sources and applications through Google Connectors and the Model Context Protocol (MCP). By using these integrations, you agree that:",
    ],
    bullets: [
      "Authorization: You authorize Flare to access, view, and interact with the data in your connected accounts (e.g., Google Drive, connected MCP servers) based on the permissions you grant during the authorization process.",
      "Secure Handling of Tokens: We securely store integration tokens (such as OAuth tokens for Google or connection strings for MCP) using industry-standard encryption at rest and in transit. These tokens are used exclusively to facilitate your active requests.",
      "Your Responsibility: You are responsible for ensuring you have the right to access and connect these external data sources. You must not connect sources containing data you do not have permission to process.",
      "Revocation: You may disconnect any connector or MCP server at any time from your account settings. Upon disconnection, we promptly delete the associated access tokens. We are not responsible for data already processed or synthesized into your conversation history prior to disconnection.",
    ],
  },
  {
    id: "intellectual-property",
    title: "Intellectual Property",
    summary: "Our models, code, and brand.",
    subSections: [
      {
        title: "15.1 Flare's Intellectual Property",
        paragraphs: [
          "All content, features, code, design, branding, and technology that make up Flare — including but not limited to the Flare name, logo, interface, models, and software — are the intellectual property of Flare and are protected by applicable copyright, trademark, and other laws.",
          "You may not:",
        ],
        bullets: [
          "Copy, reproduce, or distribute any part of Flare without written permission.",
          "Reverse engineer or decompile any part of the Flare platform.",
          "Use the Flare name, logo, or branding without our prior written consent.",
          "Create derivative works based on Flare's proprietary systems.",
        ],
      },
      {
        title: "15.2 Feedback & Suggestions",
        paragraphs: [
          "If you provide feedback, ideas, or suggestions about Flare, you grant us a non-exclusive, royalty-free, perpetual license to use that feedback for any purpose without compensation to you.",
        ],
      },
    ],
  },
  {
    id: "your-content-ownership",
    title: "Your Content & Ownership",
    summary: "You own your inputs.",
    subSections: [
      {
        title: "16.1 You Own Your Inputs",
        paragraphs: [
          'You retain full ownership of the prompts, messages, files, and other content you submit to Flare ("Your Content"). We do not claim ownership over your inputs.',
        ],
      },
      {
        title: "16.2 License You Grant to Flare",
        paragraphs: [
          "By submitting content to Flare, you grant us a limited, non-exclusive, worldwide, royalty-free license to:",
        ],
        bullets: [
          "Process and transmit your content to AI providers to generate responses.",
          "Store your content to maintain your conversation history.",
          "Use aggregated, anonymized data derived from your content to improve our services.",
        ],
      },
      {
        title: "16.3 AI-Generated Outputs",
        paragraphs: [
          "The outputs generated by AI models in response to your prompts are provided to you for your use, subject to:",
        ],
        bullets: [
          "The terms of this agreement.",
          "The terms and usage policies of the underlying AI model providers.",
          "Applicable intellectual property laws.",
        ],
      },
      {
        title: "16.4 Responsibility for Your Content",
        paragraphs: [
          "You are solely responsible for the content you submit to Flare. You represent and warrant that:",
        ],
        bullets: [
          "You own or have the necessary rights to submit your content.",
          "Your content does not violate any third-party rights.",
          "Your content complies with these Terms and applicable laws.",
        ],
      },
    ],
  },
  {
    id: "image-generation-editing",
    title: "Image Generation & Editing",
    summary: "Usage rules for AI image tools.",
    subSections: [
      {
        title: "17.1 Usage",
        paragraphs: [
          "Flare's image generation and editing tools are powered by third-party image AI APIs (currently A4F API). By using these features, you agree to:",
        ],
        bullets: [
          "Use generated images only for lawful purposes.",
          "Not generate images that depict real, identifiable individuals in misleading or harmful contexts.",
          "Not generate sexually explicit images of any person.",
          "Not generate images that violate third-party intellectual property rights.",
          "Comply with the usage policies of our image generation API providers.",
        ],
      },
      {
        title: "17.2 Content Moderation",
        paragraphs: [
          "We reserve the right to block, remove, or restrict image generation requests that violate our Acceptable Use Policy. Repeated violations may result in account suspension.",
        ],
      },
      {
        title: "17.3 Ownership of Generated Images",
        paragraphs: [
          "Images generated using Flare tools are provided to you for your use, subject to the terms above. We do not claim ownership over images you generate, but we also do not guarantee your exclusive rights to them, as other users may generate similar outputs from similar prompts.",
        ],
      },
    ],
  },
  {
    id: "voice-mode",
    title: "Voice Mode",
    summary: "How your voice data is handled.",
    subSections: [
      {
        title: "18.1 Microphone Access",
        paragraphs: [
          "Using Voice Mode requires granting Flare access to your device's microphone. You may revoke this access at any time through your device or browser settings.",
        ],
      },
      {
        title: "18.2 Audio Processing",
        bullets: [
          "Audio captured during Voice Mode is transcribed to text in real-time.",
          "Raw audio recordings are never stored on our servers.",
          "Transcribed text is processed and stored as a standard chat message.",
        ],
      },
      {
        title: "18.3 Consent",
        paragraphs: [
          "By using Voice Mode, you consent to the real-time capture and transcription of your voice input. Do not use Voice Mode in situations where recording or transmitting audio would be prohibited by law (e.g., recording others without consent).",
        ],
      },
    ],
  },
  {
    id: "disclaimer-of-warranties",
    title: "Disclaimer of Warranties",
    summary: "Service is provided as-is.",
    highlightParagraph:
      'TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, FLARE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED.',
    paragraphs: ["We specifically disclaim:"],
    bullets: [
      "Any warranty that Flare will be uninterrupted, error-free, or secure.",
      "Any warranty of accuracy, completeness, or reliability of AI-generated content.",
      "Any implied warranties of merchantability, fitness for a particular purpose, or non-infringement.",
      "Any warranty that Flare will meet your specific requirements or expectations.",
    ],
  },
  {
    id: "limitation-of-liability",
    title: "Limitation of Liability",
    summary: "Limits on damages.",
    highlightParagraph:
      "TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, FLARE AND ITS FOUNDERS, EMPLOYEES, CONTRACTORS, AND AFFILIATES SHALL NOT BE LIABLE FOR:",
    bullets: [
      "Any indirect, incidental, special, consequential, or punitive damages.",
      "Loss of profits, data, business, or goodwill.",
      "Damages resulting from your reliance on AI-generated content.",
      "Damages resulting from unauthorized access to your account.",
      "Any damages exceeding the amount you paid to Flare in the 3 months preceding the claim (or $10 USD if you are on the free tier).",
    ],
    paragraphs: [
      "This limitation applies regardless of the legal theory under which the claim is brought and even if Flare has been advised of the possibility of such damages.",
      "Some jurisdictions do not allow the exclusion of certain warranties or the limitation of liability for certain damages. In such jurisdictions, our liability is limited to the maximum extent permitted by law.",
    ],
  },
  {
    id: "indemnification",
    title: "Indemnification",
    summary: "Your obligation to hold Flare harmless.",
    paragraphs: [
      "You agree to defend, indemnify, and hold harmless Flare and its founders, employees, contractors, and affiliates from and against any claims, liabilities, damages, losses, and expenses (including legal fees) arising out of or in connection with:",
    ],
    bullets: [
      "Your use of or access to Flare.",
      "Your violation of these Terms.",
      "Your violation of any third-party rights, including intellectual property or privacy rights.",
      "Any content you submit to Flare.",
      "Your violation of any applicable law or regulation.",
    ],
  },
  {
    id: "termination-suspension",
    title: "Termination & Suspension",
    summary: "When access may end.",
    subSections: [
      {
        title: "22.1 Termination by You",
        paragraphs: [
          "You may close your Flare account at any time through your account settings. Upon account closure:",
        ],
        bullets: [
          "Your access to Flare is immediately revoked.",
          "Your personal data will be deleted from active systems within 30 days.",
          "Any unused subscription time is forfeited and non-refundable (except where required by law).",
        ],
      },
      {
        title: "22.2 Suspension or Termination by Flare",
        paragraphs: [
          "We reserve the right to suspend or permanently terminate your account at any time if:",
        ],
        bullets: [
          "You violate these Terms or our Acceptable Use Policy.",
          "Your account is involved in fraudulent, abusive, or illegal activity.",
          "Continued access poses a risk to the security or integrity of the platform or other users.",
          "We are required to do so by law or legal order.",
        ],
      },
      {
        title: "22.3 Effect of Termination",
        paragraphs: ["Upon termination:"],
        bullets: [
          "Your right to access Flare ceases immediately.",
          "All licenses granted to you under these Terms are revoked.",
          "We may retain data as required by law or for legitimate business purposes (see our Privacy Policy).",
        ],
      },
      {
        title: "22.4 Appeals",
        paragraphs: [
          'If you believe your account was suspended or terminated in error, you may appeal by contacting us at support@flare-sh.tech with the subject line: "Account Termination Appeal."',
        ],
      },
    ],
  },
  {
    id: "dispute-resolution",
    title: "Dispute Resolution",
    summary: "How disputes are handled.",
    subSections: [
      {
        title: "23.1 Informal Resolution First",
        paragraphs: [
          "Before pursuing formal legal action, you agree to first try to resolve any dispute informally by contacting us at legal@flare-sh.tech. We will make a good-faith effort to resolve the dispute within 30 days.",
        ],
      },
      {
        title: "23.2 Arbitration",
        paragraphs: [
          "If informal resolution fails, disputes will be resolved through binding arbitration, except where prohibited by law. You agree to waive the right to participate in a class action lawsuit or class-wide arbitration against Flare.",
        ],
      },
      {
        title: "23.3 Exceptions",
        paragraphs: [
          "Notwithstanding the above, either party may seek emergency injunctive or other equitable relief in a court of competent jurisdiction to prevent irreparable harm.",
        ],
      },
    ],
  },
  {
    id: "governing-law",
    title: "Governing Law",
    summary: "Where disputes are handled.",
    paragraphs: [
      "These Terms are governed by and construed in accordance with the laws of India, without regard to its conflict of law provisions.",
      "Any disputes that are not resolved through arbitration will be subject to the exclusive jurisdiction of the courts located in India.",
      "If you are accessing Flare from outside India, you are responsible for compliance with local laws applicable to your use of the platform.",
    ],
  },
  {
    id: "changes-to-these-terms",
    title: "Changes to These Terms",
    summary: "How we notify you of updates.",
    paragraphs: ["We may update these Terms from time to time to reflect:"],
    bullets: [
      "Changes to our services or features.",
      "Changes in applicable laws or regulations.",
      "Feedback from users or legal counsel.",
    ],
    subSections: [
      {
        title: "When we make changes:",
        bullets: [
          'We will update the "Last Updated" date at the top of this document.',
          "For significant changes, we will notify you via email and/or an in-app notice at least 14 days before the changes take effect.",
          "For minor changes (e.g., clarifications, typo fixes), we may update without active notification.",
        ],
      },
    ],
  },
  {
    id: "severability",
    title: "Severability",
    summary: "Partial invalidity does not affect remaining Terms.",
    paragraphs: [
      "If any provision of these Terms is found to be invalid, illegal, or unenforceable by a court of competent jurisdiction, that provision will be modified to the minimum extent necessary to make it enforceable, or severed if modification is not possible. The remaining provisions of these Terms will continue in full force and effect.",
    ],
  },
  {
    id: "entire-agreement",
    title: "Entire Agreement",
    summary: "This is the complete agreement.",
    paragraphs: [
      "These Terms, together with our Privacy Policy and any other policies or guidelines referenced herein, constitute the entire agreement between you and Flare regarding your use of the platform. They supersede all prior agreements, representations, and understandings — whether written or oral — relating to the same subject matter.",
      "No waiver of any provision of these Terms shall be deemed a further or continuing waiver of such provision or any other provision.",
    ],
  },
  {
    id: "contact",
    title: "Contact Us",
    summary: "How to reach us.",
    paragraphs: [
      "If you have any questions, concerns, or feedback about these Terms, please reach out:",
    ],
    links: [
      { label: "General", href: "mailto:hello@flare-sh.tech" },
      { label: "Legal & Terms", href: "mailto:legal@flare-sh.tech" },
      { label: "Privacy & Data", href: "mailto:privacy@flare-sh.tech" },
      { label: "Security", href: "mailto:security@flare-sh.tech" },
      { label: "Billing", href: "mailto:billing@flare-sh.tech" },
    ],
  },
];

export const metadata: Metadata = {
  title: "Terms of Service | Flare AI",
  description:
    "Read the Flare AI Terms of Service and understand how we handle accounts, content, and safety.",
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-zinc-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 pb-16 pt-10 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-6 border-b border-zinc-800 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="group flex items-center gap-3">
            <div className="relative h-10 w-10 overflow-hidden rounded-lg bg-zinc-900 ring-1 ring-zinc-800">
              <Image
                src="/flare-logo-192.webp"
                alt="Flare AI logo"
                fill
                priority
                sizes="40px"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <div className="leading-tight">
              <p className="text-sm uppercase tracking-[0.12em] text-zinc-400">
                Flare AI
              </p>
              <p className="text-lg font-semibold text-white">
                Terms of Service
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 ring-1 ring-emerald-500/40">
              Effective: March 5, 2026
            </span>
            <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300 ring-1 ring-white/10">
              v2.0
            </span>
            <Link
              href="/sign-in"
              className="flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/10 transition hover:bg-white/10 hover:ring-white/30"
            >
              <LogIn className="h-4 w-4" />
              Login
            </Link>
          </div>
        </header>

        <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
          <aside className="sticky top-8 h-fit max-h-[85vh] overflow-y-auto rounded-2xl border border-white/5 bg-white/[0.03] p-4 shadow-[0_10px_60px_-40px_rgba(0,0,0,0.6)]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white">Topics</p>
              <span className="rounded-full bg-white/5 px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-zinc-400">
                Navigate
              </span>
            </div>
            <nav className="space-y-1 text-sm">
              {sections.map((section) => (
                <Link
                  key={section.id}
                  href={`#${section.id}`}
                  className="block rounded-lg px-3 py-2 text-zinc-300 transition hover:bg-white/5 hover:text-white"
                >
                  {section.title}
                </Link>
              ))}
            </nav>

            <div className="mt-6 space-y-2 text-sm">
              <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">
                More pages & conditions
              </p>
              <div className="flex flex-col gap-2">
                <Link
                  href="/privacy-policy"
                  className="inline-flex items-center justify-center rounded-lg bg-white/5 px-3 py-2 font-medium text-white ring-1 ring-white/10 transition hover:bg-white/10 hover:ring-white/30"
                >
                  Privacy Policy
                </Link>
                <Link
                  href="/refund-policy"
                  className="inline-flex items-center justify-center rounded-lg bg-white/5 px-3 py-2 font-medium text-white ring-1 ring-white/10 transition hover:bg-white/10 hover:ring-white/30"
                >
                  Refund Policy
                </Link>
                <Link
                  href="/cookies-policy"
                  className="inline-flex items-center justify-center rounded-lg bg-white/5 px-3 py-2 font-medium text-white ring-1 ring-white/10 transition hover:bg-white/10 hover:ring-white/30"
                >
                  Cookies Policy
                </Link>
              </div>
            </div>
          </aside>

          <article className="space-y-10">
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-6 shadow-[0_10px_60px_-40px_rgba(0,0,0,0.6)]">
              <p className="text-sm text-zinc-300">
                Thanks for using Flare AI.
              </p>
              <p className="mt-2 text-xl font-semibold text-white">
                Please read these Terms of Service carefully before using Flare.
                By accessing or using our platform, you agree to be legally
                bound by these Terms. If you do not agree, do not use Flare.
              </p>
            </div>

            {sections.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                aria-labelledby={`${section.id}-title`}
                className="scroll-mt-24 rounded-2xl border border-white/5 bg-white/[0.02] p-6 shadow-[0_10px_60px_-40px_rgba(0,0,0,0.6)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">
                      {String(index + 1).padStart(2, "0")}
                    </p>
                    <h2
                      id={`${section.id}-title`}
                      className="mt-1 text-xl font-semibold text-white"
                    >
                      {section.title}
                    </h2>
                    <p className="mt-1 text-sm text-zinc-300">
                      {section.summary}
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-200">
                  {section.highlightParagraph && (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm font-semibold text-emerald-100">
                      {section.highlightParagraph}
                    </div>
                  )}

                  {section.paragraphs?.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}

                  {section.bullets && (
                    <ul className="list-disc space-y-2 pl-5 text-zinc-200">
                      {section.bullets.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}

                  {section.table && (
                    <div className="overflow-hidden rounded-xl border border-white/10">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-white/10 bg-white/5">
                            {section.table.headers.map((header) => (
                              <th
                                key={header}
                                className="px-4 py-3 font-semibold text-white"
                              >
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {section.table.rows.map((row) => (
                            <tr
                              key={row[0]}
                              className="border-b border-white/5 last:border-0"
                            >
                              {row.map((cell, cellIndex) => (
                                <td
                                  key={cellIndex}
                                  className="px-4 py-3 text-zinc-200"
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {section.subSections?.map((sub) => (
                    <div
                      key={sub.title}
                      className="space-y-2 rounded-xl bg-white/5 p-4 text-zinc-100"
                    >
                      <p className="text-sm font-semibold text-white">
                        {sub.title}
                      </p>
                      {sub.paragraphs?.map((paragraph) => (
                        <p key={paragraph} className="text-sm text-zinc-200">
                          {paragraph}
                        </p>
                      ))}
                      {sub.bullets && (
                        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-200">
                          {sub.bullets.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      )}
                      {sub.table && (
                        <div className="overflow-hidden rounded-xl border border-white/10">
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr className="border-b border-white/10 bg-white/5">
                                {sub.table.headers.map((header) => (
                                  <th
                                    key={header}
                                    className="px-4 py-3 font-semibold text-white"
                                  >
                                    {header}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sub.table.rows.map((row) => (
                                <tr
                                  key={row[0]}
                                  className="border-b border-white/5 last:border-0"
                                >
                                  {row.map((cell, cellIndex) => (
                                    <td
                                      key={cellIndex}
                                      className="px-4 py-3 text-zinc-200"
                                    >
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}

                  {section.links && (
                    <div className="flex flex-wrap gap-3 pt-2 text-sm">
                      {section.links.map((link) => (
                        <Link
                          key={link.label}
                          href={link.href}
                          className="inline-flex items-center justify-center rounded-full bg-white/10 px-4 py-2 font-medium text-white ring-1 ring-white/20 transition hover:bg-white/20"
                        >
                          {link.label}
                        </Link>
                      ))}
                      <Link
                        href="https://flare-sh.tech"
                        className="inline-flex items-center justify-center rounded-full bg-emerald-500/15 px-4 py-2 font-medium text-emerald-100 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/25"
                      >
                        Visit Website
                      </Link>
                    </div>
                  )}
                </div>
              </section>
            ))}

            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-6 text-center text-sm text-zinc-400 shadow-[0_10px_60px_-40px_rgba(0,0,0,0.6)]">
              <p>Last Updated: March 5, 2026 | Version 2.0</p>
              <p className="mt-2 text-zinc-500">
                Flare is built on trust. These Terms exist to protect you,
                protect us, and keep the platform a safe and productive space
                for everyone.
              </p>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}

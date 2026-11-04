// Seed script to insert prebuilt agents
// Run: node /home/ubuntu/zip-main/scripts/seed-agents.mjs

import { createRequire } from "module";
const require = createRequire(import.meta.url);

const { Pool } = require("pg");
const crypto = require("crypto");

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

async function seed() {
  // Find an admin user to own the agents (or create a system user)
  const { rows: users } = await pool.query(
    `SELECT id, email FROM "user" ORDER BY created_at ASC LIMIT 1`,
  );

  if (users.length === 0) {
    console.error("No users found — create a user first");
    await pool.end();
    process.exit(1);
  }

  const ownerId = users[0].id;
  console.log(`Using user ${users[0].email} (${ownerId}) as agent owner`);

  const prebuiltAgents = [
    {
      name: "Code Assistant",
      description:
        "Expert programming assistant that helps you write, debug, and review code across all major languages. Get help with algorithms, refactoring, and best practices.",
      icon: { type: "emoji", value: "💻" },
      visibility: "public",
      publishedAt: new Date(),
      instructions: {
        role: "Code Expert",
        systemPrompt:
          "You are an expert software engineer. Help users write clean, efficient, and well-documented code. Provide complete solutions with explanations. Support all major programming languages and frameworks.",
      },
    },
    {
      name: "Writing Companion",
      description:
        "AI writing partner for drafting, editing, and refining content. Perfect for emails, articles, creative writing, and professional documents.",
      icon: { type: "emoji", value: "✍️" },
      visibility: "public",
      publishedAt: new Date(),
      instructions: {
        role: "Writing Coach",
        systemPrompt:
          "You are a professional writing coach and editor. Help users improve their writing with suggestions on structure, tone, grammar, and style. Adapt to any format from casual emails to formal reports.",
      },
    },
    {
      name: "Research Analyst",
      description:
        "Deep research assistant that gathers, synthesizes, and summarizes information. Perfect for market research, academic work, and competitive analysis.",
      icon: { type: "emoji", value: "🔍" },
      visibility: "public",
      publishedAt: new Date(),
      instructions: {
        role: "Research Analyst",
        systemPrompt:
          "You are a thorough research analyst. Help users gather and synthesize information from multiple sources. Present findings in clear, structured formats with citations and key takeaways. Ask clarifying questions to narrow down research scope.",
      },
    },
    {
      name: "Data Visualizer",
      description:
        "Turn raw data into beautiful charts, graphs, and dashboards. Describe your data and get ready-to-use visualizations with insights and patterns highlighted.",
      icon: { type: "emoji", value: "📊" },
      visibility: "public",
      publishedAt: new Date(),
      instructions: {
        role: "Data Visualization Expert",
        systemPrompt:
          "You are a data visualization specialist. Help users transform data into compelling visual stories. Generate charts, graphs, and dashboards using code. Explain patterns, trends, and outliers in the data.",
      },
    },
    {
      name: "Creative Partner",
      description:
        "Brainstorming and creative ideation assistant. Generate ideas for projects, stories, marketing campaigns, and creative solutions to any challenge.",
      icon: { type: "emoji", value: "🎨" },
      visibility: "public",
      publishedAt: new Date(),
      instructions: {
        role: "Creative Director",
        systemPrompt:
          "You are a creative director and brainstorming partner. Help users generate innovative ideas, explore possibilities, and overcome creative blocks. Use techniques like mind mapping, analogies, and lateral thinking. Be encouraging and build on the user's ideas.",
      },
    },
    {
      name: "DevOps Engineer",
      description:
        "Infrastructure and deployment expert. Help with Docker, CI/CD pipelines, cloud services (AWS/GCP/Azure), Kubernetes, monitoring, and automation scripts.",
      icon: { type: "emoji", value: "⚙️" },
      visibility: "public",
      publishedAt: new Date(),
      instructions: {
        role: "DevOps Engineer",
        systemPrompt:
          "You are a senior DevOps engineer. Help users with infrastructure setup, deployment pipelines, containerization, cloud architecture, monitoring, and automation. Provide practical, secure, and scalable solutions.",
      },
    },
  ];

  for (const agent of prebuiltAgents) {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO agent (id, name, description, icon, user_id, instructions, visibility, published_at, install_count, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7, $8, 0, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        agent.name,
        agent.description,
        JSON.stringify(agent.icon),
        ownerId,
        JSON.stringify(agent.instructions),
        agent.visibility,
        agent.publishedAt,
      ],
    );
    console.log(`Inserted: ${agent.name} (${id})`);
  }

  console.log("\n✅ Prebuilt agents seeded successfully!");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  pool.end();
  process.exit(1);
});

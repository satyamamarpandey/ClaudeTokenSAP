/**
 * Prompt Analyzer — detects app type, framework, language, database, platform
 * from user's first prompt. Generates contextual hints for onboarding questions.
 */

const SIGNALS = {
  appType: {
    web: ["website", "webapp", "web app", "landing page", "dashboard", "saas", "e-commerce", "ecommerce", "blog", "portfolio", "cms", "admin panel", "web portal", "storefront", "marketplace"],
    mobile: ["mobile app", "ios app", "android app", "phone app", "tablet", "app store", "play store", "react native", "flutter app", "expo app", "swiftui", "jetpack compose", "mobile"],
    desktop: ["desktop app", "electron", "tauri", "macos app", "windows app", "linux app", "native desktop"],
    cli: ["cli", "command line", "terminal tool", "shell script", "command-line", "cli tool"],
    api: ["rest api", "graphql api", "backend service", "microservice", "api server", "webhook", "api endpoint"],
    library: ["library", "npm package", "pypi package", "module", "sdk", "framework", "plugin", "crate"],
    game: ["game", "unity", "godot", "phaser", "three.js", "threejs", "canvas game", "webgl", "2d game", "3d game"],
    bot: ["bot", "chatbot", "discord bot", "telegram bot", "slack bot", "ai agent", "assistant", "ai chatbot"],
    extension: ["chrome extension", "vscode extension", "browser extension", "addon", "firefox addon"],
  },

  framework: {
    "Next.js":        ["next.js", "nextjs", "next js", "next app"],
    "React":          ["react", "react app", "create-react-app", "cra", "vite react"],
    "Vue":            ["vue", "vue.js", "vuejs"],
    "Nuxt":           ["nuxt", "nuxtjs", "nuxt.js"],
    "Angular":        ["angular"],
    "Svelte":         ["svelte", "sveltekit"],
    "Remix":          ["remix"],
    "Astro":          ["astro"],
    "Express":        ["express", "express.js", "expressjs"],
    "FastAPI":        ["fastapi", "fast api"],
    "Django":         ["django"],
    "Flask":          ["flask"],
    "Rails":          ["rails", "ruby on rails"],
    "Spring Boot":    ["spring boot", "springboot", "spring"],
    "NestJS":         ["nestjs", "nest.js"],
    "Hono":           ["hono"],
    "Laravel":        ["laravel"],
    "Flutter":        ["flutter"],
    "React Native":   ["react native", "react-native"],
    "Expo":           ["expo"],
    "SwiftUI":        ["swiftui", "swift ui"],
    "Jetpack Compose":["jetpack compose", "compose multiplatform"],
    "Electron":       ["electron"],
    "Tauri":          ["tauri"],
    "Qt":             ["qt", "qml"],
  },

  language: {
    "TypeScript":  ["typescript", " ts ", ".tsx", ".ts ", "tsx"],
    "JavaScript":  ["javascript", " js ", "node.js", "nodejs"],
    "Python":      ["python", " py ", "pip ", "poetry", "conda"],
    "Rust":        ["rust", "cargo", "rustc"],
    "Go":          ["golang", " go ", "go module"],
    "Java":        ["java ", "maven", "gradle", "jvm"],
    "Kotlin":      ["kotlin", "kmp", "kmm"],
    "Swift":       ["swift", "xcode", "swiftpm"],
    "C#":          ["c#", "csharp", "dotnet", ".net", "unity c#"],
    "C++":         ["c++", "cpp", "cmake"],
    "Ruby":        ["ruby", "gem ", "bundler"],
    "PHP":         ["php", "composer"],
    "Dart":        ["dart"],
    "Elixir":      ["elixir", "phoenix"],
    "Zig":         ["zig"],
  },

  database: {
    "PostgreSQL":  ["postgres", "postgresql", "pg ", "neon"],
    "MongoDB":     ["mongo", "mongodb", "mongoose"],
    "SQLite":      ["sqlite", "sqlite3"],
    "MySQL":       ["mysql", "mariadb"],
    "Firebase":    ["firebase", "firestore"],
    "Supabase":    ["supabase"],
    "Redis":       ["redis", "upstash"],
    "DynamoDB":    ["dynamodb", "dynamo"],
    "Prisma":      ["prisma"],
    "Drizzle":     ["drizzle"],
    "PlanetScale": ["planetscale"],
    "CockroachDB": ["cockroachdb", "cockroach"],
    "Turso":       ["turso", "libsql"],
  },

  platform: {
    "iOS":             ["ios", "iphone", "ipad", "app store"],
    "Android":         ["android", "play store", "google play"],
    "Web":             ["web", "browser", "website", "webapp"],
    "macOS":           ["macos", "mac os", "mac app"],
    "Windows":         ["windows app", "win32"],
    "Linux":           ["linux app", "linux desktop"],
    "Cross-platform":  ["cross-platform", "cross platform", "multiplatform", "kmp", "kmm"],
  },

  // Additional domain signals for richer context
  domain: {
    "AI/ML":           ["ai", "machine learning", "ml", "llm", "gpt", "claude", "openai", "neural", "training", "model"],
    "E-commerce":      ["shop", "cart", "checkout", "payment", "stripe", "store", "product"],
    "Social":          ["social", "feed", "follow", "like", "comment", "post", "profile", "timeline"],
    "Fintech":         ["finance", "banking", "payment", "wallet", "trading", "stock", "crypto"],
    "Health":          ["health", "medical", "patient", "fitness", "tracker", "wellness"],
    "Education":       ["education", "course", "student", "learning", "quiz", "exam"],
    "Productivity":    ["todo", "task", "project management", "calendar", "notes", "kanban"],
    "Media":           ["streaming", "video", "audio", "podcast", "music", "media player"],
    "DevTools":        ["developer tool", "dev tool", "debugging", "profiler", "linter", "formatter"],
    "IoT":             ["iot", "sensor", "arduino", "raspberry", "mqtt", "embedded"],
  },
};

/**
 * Detect all matching signals from prompt text.
 * Returns best match per category + all signals found.
 */
function analyzePrompt(promptText) {
  if (!promptText || typeof promptText !== "string") {
    return { appType: null, framework: null, language: null, database: null, platform: null, domain: null, signals: [] };
  }

  const text = ` ${promptText.toLowerCase()} `;
  const detected = {
    appType: null,
    framework: null,
    language: null,
    database: null,
    platform: null,
    domain: null,
    signals: [],
  };

  // Score-based detection: longer keyword matches = higher confidence
  for (const [category, entries] of Object.entries(SIGNALS)) {
    let bestMatch = null;
    let bestLen = 0;

    for (const [value, keywords] of Object.entries(entries)) {
      for (const kw of keywords) {
        if (text.includes(kw) && kw.length > bestLen) {
          bestMatch = value;
          bestLen = kw.length;
          detected.signals.push({ field: category, value, keyword: kw.trim() });
        }
      }
    }

    if (bestMatch) {
      detected[category] = bestMatch;
    }
  }

  // Infer language from framework if not directly detected
  if (!detected.language && detected.framework) {
    const frameworkLangMap = {
      "Next.js": "TypeScript", "React": "TypeScript", "Vue": "TypeScript",
      "Nuxt": "TypeScript", "Angular": "TypeScript", "Svelte": "TypeScript",
      "Remix": "TypeScript", "Astro": "TypeScript", "NestJS": "TypeScript",
      "Hono": "TypeScript", "Express": "JavaScript",
      "FastAPI": "Python", "Django": "Python", "Flask": "Python",
      "Rails": "Ruby", "Laravel": "PHP",
      "Spring Boot": "Java", "Flutter": "Dart",
      "React Native": "TypeScript", "Expo": "TypeScript",
      "SwiftUI": "Swift", "Jetpack Compose": "Kotlin",
      "Electron": "TypeScript", "Tauri": "Rust",
    };
    detected.language = frameworkLangMap[detected.framework] || null;
  }

  // Infer platform from framework if not directly detected
  if (!detected.platform && detected.framework) {
    const frameworkPlatMap = {
      "Flutter": "Cross-platform", "React Native": "Cross-platform", "Expo": "Cross-platform",
      "SwiftUI": "iOS", "Jetpack Compose": "Android",
      "Electron": "Cross-platform", "Tauri": "Cross-platform",
      "Next.js": "Web", "React": "Web", "Vue": "Web", "Nuxt": "Web",
      "Angular": "Web", "Svelte": "Web", "Remix": "Web", "Astro": "Web",
    };
    detected.platform = frameworkPlatMap[detected.framework] || null;
  }

  // Infer appType from framework if not directly detected
  if (!detected.appType && detected.framework) {
    const frameworkTypeMap = {
      "Next.js": "web", "React": "web", "Vue": "web", "Nuxt": "web",
      "Angular": "web", "Svelte": "web", "Remix": "web", "Astro": "web",
      "Express": "api", "FastAPI": "api", "Django": "api", "Flask": "api",
      "NestJS": "api", "Hono": "api", "Rails": "api", "Laravel": "api",
      "Spring Boot": "api", "Flutter": "mobile", "React Native": "mobile",
      "Expo": "mobile", "SwiftUI": "mobile", "Jetpack Compose": "mobile",
      "Electron": "desktop", "Tauri": "desktop",
    };
    detected.appType = frameworkTypeMap[detected.framework] || null;
  }

  return detected;
}

/**
 * Generate contextual hints for each onboarding question based on detected signals.
 */
function generateHints(detected) {
  const hints = {};

  // ── App type ──
  if (detected.appType) {
    hints.appType = `I detected "${detected.appType}" from your prompt — confirm or correct`;
  } else {
    hints.appType = "e.g., web app, mobile, CLI, API, library, bot, game, desktop";
  }

  // ── Framework/language ──
  if (detected.framework && detected.language) {
    hints.framework = `I detected "${detected.framework}" (${detected.language}) — confirm or specify`;
  } else if (detected.framework) {
    hints.framework = `I detected "${detected.framework}" — confirm or correct`;
  } else {
    const typeHints = {
      web: "e.g., React+TS, Next.js, Vue+Nuxt, Angular, Svelte, Astro",
      mobile: "e.g., Flutter, React Native, SwiftUI (iOS), Jetpack Compose (Android)",
      desktop: "e.g., Electron, Tauri, Qt, native (Swift/C++/C#)",
      api: "e.g., Express, FastAPI, Django, NestJS, Hono, Spring Boot",
      cli: "e.g., Node.js (commander), Python (click/typer), Rust (clap), Go (cobra)",
      game: "e.g., Unity (C#), Godot (GDScript), Phaser (JS), Three.js (WebGL)",
      bot: "e.g., discord.js, Telegraf, Slack Bolt, LangChain, AI SDK",
      library: "e.g., TypeScript, Rust, Python, Go — specify target runtime",
      extension: "e.g., Chrome Extension (Manifest V3), VS Code Extension API",
    };
    hints.framework = typeHints[detected.appType] || "e.g., React+TS, Flutter, Python+FastAPI, Swift, Kotlin";
  }

  // ── Target users ──
  if (detected.domain) {
    const domainUserMap = {
      "AI/ML": "e.g., developers, data scientists, end-users, researchers",
      "E-commerce": "e.g., shoppers, merchants, admins",
      "Social": "e.g., general public, creators, community members",
      "Fintech": "e.g., traders, customers, financial analysts",
      "Health": "e.g., patients, doctors, fitness enthusiasts",
      "Education": "e.g., students, teachers, administrators",
      "Productivity": "e.g., teams, individuals, project managers",
      "DevTools": "e.g., developers, DevOps engineers, open-source community",
    };
    hints.users = domainUserMap[detected.domain] || "e.g., developers, consumers, internal team, enterprise";
  } else {
    hints.users = "e.g., developers, consumers, internal team, enterprise";
  }

  // ── Database ──
  if (detected.database) {
    hints.database = `I detected "${detected.database}" — confirm or correct`;
  } else {
    const typeDbMap = {
      mobile: "e.g., SQLite (local), Firebase, Supabase, none",
      web: "e.g., PostgreSQL, MongoDB, SQLite, Supabase, Firebase, none",
      api: "e.g., PostgreSQL, MongoDB, Redis, DynamoDB, none",
      cli: "e.g., SQLite (local), JSON files, none",
      bot: "e.g., Redis, SQLite, Firebase, none",
    };
    hints.database = typeDbMap[detected.appType] || "e.g., PostgreSQL, MongoDB, SQLite, Firebase, none";
  }

  // ── Constraints ──
  const typeConstraintMap = {
    mobile: "e.g., offline-capable, cross-platform, minimum OS version, push notifications",
    web: "e.g., SSR/SSG, PWA, no JS frameworks, specific hosting, SEO-critical",
    api: "e.g., real-time (WebSocket), rate limits, auth provider, serverless, specific cloud",
    cli: "e.g., single binary, cross-platform, interactive prompts, config file format",
    game: "e.g., target FPS, multiplayer, specific platform, asset pipeline",
    bot: "e.g., multi-platform, AI model, rate limits, persistent memory",
    desktop: "e.g., auto-update, single binary, OS-specific features, tray icon",
    library: "e.g., zero dependencies, tree-shakeable, specific Node/browser support",
    extension: "e.g., Manifest V3, specific browser support, content scripts",
  };
  hints.constraints = typeConstraintMap[detected.appType] || "e.g., offline-capable, no external APIs, must use specific library";

  return hints;
}

/**
 * Build a formatted "detected context" summary for the directive.
 */
function formatDetectedContext(detected) {
  const parts = [];
  if (detected.appType) parts.push(`App type: ${detected.appType}`);
  if (detected.framework) parts.push(`Framework: ${detected.framework}`);
  if (detected.language) parts.push(`Language: ${detected.language}`);
  if (detected.database) parts.push(`Database: ${detected.database}`);
  if (detected.platform) parts.push(`Platform: ${detected.platform}`);
  if (detected.domain) parts.push(`Domain: ${detected.domain}`);

  if (parts.length === 0) return null;
  return parts.join(" | ");
}

/**
 * Check CLAUDE.md for completeness — used by follow-up detection in prompt_preprocess.
 * Returns array of gap descriptions (empty = fully complete).
 */
function checkOnboardingCompleteness(claudeMdContent) {
  if (!claudeMdContent) return ["missing"];

  const gaps = [];

  if (claudeMdContent.includes("pending onboarding")) {
    // Find which specific fields are still pending
    const fields = ["Type", "Platform", "Language", "Target Users", "Database"];
    for (const field of fields) {
      if (new RegExp(`-\\s*${field}:\\s*\\(?pending`, "i").test(claudeMdContent)) {
        gaps.push(field.toLowerCase());
      }
    }
    if (gaps.length === 0) gaps.push("generic_pending");
  }

  // Check for minimal useful content (less than 5 non-empty lines after header)
  const contentLines = claudeMdContent.split("\n").filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("<!--"));
  if (contentLines.length < 3) {
    gaps.push("too_sparse");
  }

  return gaps;
}

module.exports = { analyzePrompt, generateHints, formatDetectedContext, checkOnboardingCompleteness, SIGNALS };

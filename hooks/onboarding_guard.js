const fs = require("fs");
const path = require("path");
const { appendDebugLog, mergeSessionState, readSessionState } = require("../lib/debug-log");
const { analyzePrompt } = require("../lib/prompt-analyzer");

function readJsonStdin() {
  return new Promise((resolve) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { resolve({}); }
    });
  });
}

const DENY_RULES = [
  "Read(node_modules/**)",
  "Read(dist/**)",
  "Read(build/**)",
  "Read(.next/**)",
  "Read(coverage/**)",
  "Read(.turbo/**)",
  "Read(vendor/**)",
  "Read(out/**)",
  "Read(**/*.lock)",
  "Read(**/*.log)",
  "Read(**/*.map)",
  "Read(**/*.min.js)",
  "Read(**/*.min.css)",
  "Read(.git/**)",
  "Read(**/*.wasm)",
  "Read(**/*.pb)",
  "Read(**/.env)",
  "Read(**/.env.*)",
  "Read(**/*.env)",
];

const ASK_RULES = [
  "Read(**/*.png)",
  "Read(**/*.jpg)",
  "Read(**/*.jpeg)",
  "Read(**/*.gif)",
  "Read(**/*.svg)",
  "Read(**/*.mp4)",
  "Read(**/*.mp3)",
  "Read(**/*.wav)",
];

// Intent-based question sets — questions adapt to what the user is building
const QUESTION_SETS = {
  trading: [
    { key: "language",   label: "Language / platform?",  options: ["Python", "JavaScript / Node.js", "Pine Script (TradingView)", "MQL4/5 (MetaTrader)", "R"] },
    { key: "market",     label: "Market?",               options: ["Crypto", "Stocks / Equities", "Forex", "Futures", "Options"] },
    { key: "timeframe",  label: "Timeframe / style?",    options: ["Scalping (< 5 min)", "Day trading (intraday)", "Swing (days–weeks)", "Long-term / position"] },
    { key: "datasource", label: "Data source?",          options: ["Binance / ccxt", "Alpaca", "Interactive Brokers", "Yahoo Finance", "Simulate / backtest only"] },
    { key: "output",     label: "Output format?",        options: ["Backtest script", "Live trading bot", "Strategy analyzer", "Jupyter notebook"] },
  ],
  data_analysis: [
    { key: "language",   label: "Language?",             options: ["Python", "R", "SQL", "JavaScript"] },
    { key: "datasource", label: "Data source?",          options: ["CSV / local files", "Database (SQL)", "API / web scraping", "Cloud storage"] },
    { key: "output",     label: "Output format?",        options: ["Jupyter notebook", "Script", "Dashboard / charts", "Report / PDF"] },
    { key: "users",      label: "Who uses this?",        options: ["Just me", "Data team", "Non-technical stakeholders", "Public"] },
    { key: "constraints",label: "Constraints?",          options: ["None", "Must run offline", "Large datasets (>1GB)", "Real-time / streaming"] },
  ],
  ml_model: [
    { key: "stack",      label: "Language / framework?", options: ["Python + PyTorch", "Python + TensorFlow", "Python + scikit-learn", "JavaScript + TensorFlow.js"] },
    { key: "task",       label: "ML task?",              options: ["Classification", "Regression", "NLP / text", "Computer vision", "Reinforcement learning"] },
    { key: "datatype",   label: "Data type?",            options: ["Tabular (CSV)", "Images", "Text", "Time series", "Audio"] },
    { key: "deployment", label: "Deployment?",           options: ["Local script only", "API (FastAPI / Flask)", "Cloud (AWS / GCP / Azure)", "Edge device"] },
    { key: "constraints",label: "Constraints?",          options: ["None", "Real-time inference", "Low latency", "Interpretability required"] },
  ],
  web_app: [
    { key: "stack",      label: "Framework?",            options: ["React + TypeScript", "Next.js", "Vue / Nuxt", "Svelte / SvelteKit", "Astro", "Angular"] },
    { key: "users",      label: "Target users?",         options: ["General consumers", "Developers", "Business users", "Internal team"] },
    { key: "database",   label: "Database?",             options: ["None", "PostgreSQL", "MongoDB", "SQLite", "Firebase / Supabase"] },
    { key: "auth",       label: "Authentication?",       options: ["None", "Clerk / NextAuth / Auth.js", "Firebase Auth", "Custom JWT", "OAuth"] },
    { key: "constraints",label: "Constraints?",          options: ["None", "SSR required", "SEO-critical", "PWA", "Mobile-first"] },
  ],
  api_backend: [
    { key: "stack",      label: "Language / framework?", options: ["Node.js + Express", "Python + FastAPI", "Python + Django", "Go", "Rust + Axum", "Java + Spring Boot"] },
    { key: "database",   label: "Database?",             options: ["PostgreSQL", "MongoDB", "MySQL", "SQLite", "Redis", "None"] },
    { key: "auth",       label: "Auth strategy?",        options: ["None", "JWT", "OAuth2", "API keys", "Session-based"] },
    { key: "deployment", label: "Deployment target?",    options: ["Local / dev only", "Docker", "Cloud (AWS / GCP / Fly.io)", "Serverless"] },
    { key: "constraints",label: "API style?",            options: ["REST", "GraphQL", "WebSockets", "gRPC", "Mixed"] },
  ],
  mobile_app: [
    { key: "stack",      label: "Framework?",            options: ["Flutter / Dart", "React Native", "SwiftUI (iOS only)", "Jetpack Compose (Android only)", "Expo"] },
    { key: "platform",   label: "Target platform?",      options: ["iOS + Android", "iOS only", "Android only"] },
    { key: "users",      label: "Target users?",         options: ["General consumers", "Developers", "Business users", "Internal team"] },
    { key: "database",   label: "Storage?",              options: ["None", "SQLite (local)", "Firebase", "Supabase", "Custom API backend"] },
    { key: "constraints",label: "Constraints?",          options: ["None", "Offline-capable", "Push notifications", "In-app purchases"] },
  ],
  cli_tool: [
    { key: "language",   label: "Language?",             options: ["Node.js (commander)", "Python (click / typer)", "Rust (clap)", "Go (cobra)", "Bash"] },
    { key: "distribution",label: "Distribution?",        options: ["npm package", "pip package", "Single binary", "GitHub Releases", "Internal only"] },
    { key: "users",      label: "Users?",                options: ["Just me", "Developers", "DevOps / SRE", "General users"] },
    { key: "config",     label: "Config method?",        options: ["No config", "Config file (JSON / YAML)", "Environment variables", "Interactive prompts"] },
    { key: "constraints",label: "Constraints?",          options: ["None", "Must run offline", "Single binary, no runtime", "Cross-platform"] },
  ],
  bot: [
    { key: "platform",   label: "Platform?",             options: ["Discord", "Telegram", "Slack", "WhatsApp / Twilio", "Custom / standalone"] },
    { key: "ai",         label: "AI / LLM?",             options: ["OpenAI GPT", "Claude / Anthropic", "Local LLM (Ollama)", "No AI needed"] },
    { key: "language",   label: "Language?",             options: ["JavaScript / TypeScript", "Python", "Go", "Rust"] },
    { key: "persistence",label: "Memory / persistence?", options: ["None", "SQLite / file", "Redis", "PostgreSQL"] },
    { key: "deployment", label: "Deployment?",           options: ["Local only", "VPS / cloud server", "Serverless", "Docker"] },
  ],
  game: [
    { key: "engine",     label: "Engine?",               options: ["Unity (C#)", "Godot (GDScript / C#)", "Phaser (JavaScript)", "Three.js (WebGL)", "pygame (Python)"] },
    { key: "genre",      label: "Genre?",                options: ["Platformer", "RPG", "Puzzle", "Shooter", "Strategy", "Simulation"] },
    { key: "platform",   label: "Target platform?",      options: ["Web browser", "Desktop (PC / Mac)", "Mobile", "Console"] },
    { key: "multiplayer",label: "Multiplayer?",          options: ["Single player", "Local co-op", "Online multiplayer"] },
    { key: "constraints",label: "Art style?",            options: ["Pixel art", "3D", "2D vector", "None / procedural"] },
  ],
  library: [
    { key: "language",   label: "Language?",             options: ["TypeScript / JavaScript (npm)", "Python (PyPI)", "Rust (crates.io)", "Go module"] },
    { key: "purpose",    label: "Purpose?",              options: ["UI components", "Utilities / helpers", "Data processing", "API client", "Framework plugin"] },
    { key: "users",      label: "Users?",                options: ["Developers", "Open-source community", "Internal use only"] },
    { key: "distribution",label: "Distribution?",       options: ["npm / PyPI / crates.io", "GitHub Releases", "Private registry", "Monorepo package"] },
    { key: "constraints",label: "Constraints?",          options: ["None", "Zero runtime deps", "Tree-shakeable", "Browser + Node support"] },
  ],
  script: [
    { key: "language",   label: "Language?",             options: ["Python", "Bash", "Node.js / JavaScript", "PowerShell", "Ruby"] },
    { key: "trigger",    label: "How does it run?",      options: ["Manually", "Scheduled (cron)", "On file change", "On webhook / event"] },
    { key: "io",         label: "Input / output?",       options: ["Files", "APIs / HTTP", "Database", "Stdin / stdout"] },
    { key: "users",      label: "Who runs it?",          options: ["Just me", "Dev team", "Automated system"] },
    { key: "constraints",label: "Constraints?",          options: ["None", "Must run offline", "Docker / containerized", "Very lightweight"] },
  ],
  devops: [
    { key: "platform",    label: "CI/CD platform?",       options: ["GitHub Actions", "GitLab CI", "Jenkins", "CircleCI / TeamCity", "ArgoCD / Flux (GitOps)"] },
    { key: "target",      label: "Deployment target?",    options: ["Docker / Kubernetes", "VMs / bare metal", "Serverless (Lambda / Cloud Run)", "Managed PaaS (Heroku / Fly.io)"] },
    { key: "language",    label: "Primary language?",     options: ["YAML / shell scripts", "Python (Ansible / Fabric)", "HCL (Terraform)", "TypeScript / Pulumi"] },
    { key: "scope",       label: "Scope?",                options: ["Single-repo pipeline", "Multi-service monorepo", "Infrastructure-as-code", "Full platform engineering"] },
    { key: "constraints", label: "Constraints?",          options: ["None", "Self-hosted runners", "Air-gapped / on-prem", "Compliance (SOC2 / HIPAA)"] },
  ],
  desktop_app: [
    { key: "framework",   label: "Framework?",            options: ["Electron (JS/TS)", "Tauri (Rust + web frontend)", "Qt (C++ / Python)", "WinUI 3 / WPF (.NET)", "JavaFX / Swing"] },
    { key: "platform",    label: "Target OS?",            options: ["Windows + macOS + Linux", "Windows only", "macOS only", "Linux only"] },
    { key: "language",    label: "Language?",             options: ["TypeScript / JavaScript", "Rust", "Python", "C++ / C#", "Java / Kotlin"] },
    { key: "storage",     label: "Local storage?",        options: ["None", "SQLite", "File system (JSON / YAML)", "IndexedDB / LocalStorage", "Embedded DB (LevelDB)"] },
    { key: "constraints", label: "Constraints?",          options: ["None", "Offline-only, no network", "Auto-update required", "System tray / background process", "Native OS integrations"] },
  ],
  browser_extension: [
    { key: "browser",     label: "Target browser?",       options: ["Chrome + Edge (MV3)", "Firefox (MV2/3)", "Safari", "All browsers (cross-browser)"] },
    { key: "purpose",     label: "What does it do?",      options: ["Productivity / tab management", "Content modification (DOM)", "Dev tools / debugging", "Privacy / ad blocking", "AI-powered assistant"] },
    { key: "language",    label: "Language?",             options: ["TypeScript", "JavaScript", "React + TypeScript", "Vue + TypeScript"] },
    { key: "permissions", label: "Permissions needed?",   options: ["Minimal (activeTab only)", "Storage + sync", "All tabs + history", "Network requests (fetch)", "Native messaging"] },
    { key: "distribution",label: "Distribution?",        options: ["Chrome Web Store", "Firefox Add-ons", "Enterprise sideload only", "All major stores"] },
  ],
  llm_app: [
    { key: "provider",    label: "LLM provider?",         options: ["Anthropic (Claude)", "OpenAI (GPT)", "Google (Gemini)", "Local / Ollama", "Multiple providers"] },
    { key: "app_type",    label: "App type?",             options: ["Chatbot / assistant", "RAG over documents", "AI agent / automation", "Content generation", "Code assistant"] },
    { key: "framework",   label: "Framework?",            options: ["Raw API (no framework)", "Vercel AI SDK", "LangChain / LangGraph", "LlamaIndex", "CrewAI / AutoGen"] },
    { key: "storage",     label: "Vector / memory store?", options: ["None", "Chroma (local)", "Pinecone / Qdrant", "pgvector (PostgreSQL)", "In-memory only"] },
    { key: "deployment",  label: "Deployment?",           options: ["Local dev only", "Web app (Next.js / SvelteKit)", "API server", "Serverless (Vercel / Lambda)", "Desktop app"] },
  ],
  blockchain: [
    { key: "chain",       label: "Blockchain?",           options: ["Ethereum / EVM compatible", "Solana", "Bitcoin / Lightning", "Cosmos / Polkadot", "Move-based (Aptos / Sui)"] },
    { key: "type",        label: "Project type?",         options: ["DeFi protocol", "NFT / token / ERC-20", "DAO / governance", "Wallet / signing tool", "Block explorer / indexer"] },
    { key: "language",    label: "Contract language?",    options: ["Solidity", "Rust (Anchor / Ink!)", "Move", "Vyper", "No contracts (frontend / indexer only)"] },
    { key: "framework",   label: "Dev framework?",        options: ["Hardhat", "Foundry", "Anchor (Solana)", "Truffle / Brownie", "None"] },
    { key: "constraints", label: "Constraints?",          options: ["None", "Gas optimization critical", "Formal verification / auditability", "Upgradeable contracts", "Cross-chain / bridge"] },
  ],
  data_engineering: [
    { key: "tool",        label: "Primary tool?",         options: ["Apache Spark / PySpark", "Apache Kafka / Flink", "Apache Airflow / Prefect", "dbt (data transforms)", "Custom Python ETL"] },
    { key: "language",    label: "Language?",             options: ["Python", "Scala / Java", "SQL", "Go"] },
    { key: "scale",       label: "Data scale?",           options: ["< 1 GB (local)", "1–100 GB (medium)", "> 100 GB / streaming", "Petabyte-scale (enterprise)"] },
    { key: "storage",     label: "Source / sink?",        options: ["S3 / GCS / Azure Blob", "PostgreSQL / MySQL", "Kafka / Kinesis (streaming)", "Data warehouse (BigQuery / Snowflake / Redshift)", "Files / HDFS"] },
    { key: "deployment",  label: "Deployment?",           options: ["Local / laptop", "Docker / Kubernetes", "Cloud managed (EMR / Dataproc)", "Serverless (Glue / Cloud Functions)"] },
  ],
  embedded: [
    { key: "platform",    label: "Hardware platform?",    options: ["Arduino (AVR / ARM)", "ESP32 / ESP8266 (Wi-Fi / BT)", "Raspberry Pi (Linux)", "STM32 / nRF52", "General embedded Linux"] },
    { key: "language",    label: "Language?",             options: ["C / C++", "MicroPython / CircuitPython", "Rust (embedded-hal)", "Arduino sketch (C++)", "Assembly"] },
    { key: "connectivity",label: "Connectivity?",        options: ["None (standalone)", "Wi-Fi (HTTP / MQTT)", "Bluetooth BLE", "LoRa / LoRaWAN", "Ethernet / serial"] },
    { key: "rtos",        label: "OS / RTOS?",            options: ["Bare metal (no OS)", "FreeRTOS", "Linux / Yocto", "Zephyr RTOS", "Arduino framework"] },
    { key: "constraints", label: "Constraints?",          options: ["None", "Low power / battery operated", "Hard real-time requirements", "OTA firmware updates", "Tiny flash / RAM (< 256KB)"] },
  ],
  default: [
    { key: "what",       label: "What type of app are you building?", options: ["Web app", "Mobile app", "API / backend", "CLI tool", "Script / automation", "Data analysis", "ML model", "Game", "Bot / agent", "Library / package"] },
    { key: "stack",      label: "Language and tech stack?", options: ["Python", "TypeScript / JavaScript", "Rust", "Go", "Java", "Other"] },
    { key: "users",      label: "Who are the target users?", options: ["Just me", "Developers", "General consumers", "Business users"] },
    { key: "database",   label: "Data storage?",         options: ["None", "PostgreSQL", "SQLite", "MongoDB", "Files / S3"] },
    { key: "constraints",label: "Any constraints?",      options: ["None", "Performance-critical", "Must run offline", "Open source", "Privacy-sensitive"] },
  ],
};

// Classify the user's intent from the prompt + detected signals
function classifyIntent(promptText, detected) {
  const t = (promptText || "").toLowerCase();

  // Trading / finance strategies
  if (/trading\s*strat|algo\s*trad|trading\s*bot|backtest|technical\s*anal|candlestick|moving\s*average|rsi|macd|bollinger|forex\s*strat|crypto\s*strat|stock\s*strat|mean\s*reversion|momentum\s*strat/.test(t)) return "trading";
  if (detected.domain === "Fintech" && /strat|algo|signal|indicator|backtest|position|order|trade/.test(t)) return "trading";

  // ML / AI models
  if (/train\s*(a\s*)?(model|neural|classifier)|fine.tun|machine\s*learn|deep\s*learn|neural\s*net|pytorch|tensorflow|scikit|keras|llm\s*fine|rag\s*pipeline|embedding\s*model/.test(t)) return "ml_model";

  // Data analysis / notebooks
  if (/data\s*(analysis|pipeline|viz|visualiz|explore|clean)|etl|pandas|jupyter|notebook|csv\s*anal|plot\s*(the\s*)?data|analyze\s*(the\s*)?data|dashboard\s*(for\s*)?data/.test(t)) return "data_analysis";

  // Bots / agents
  if (detected.appType === "bot" || /discord\s*bot|telegram\s*bot|slack\s*bot|chatbot|ai\s*agent|ai\s*assistant/.test(t)) return "bot";

  // Games
  if (detected.appType === "game" || /\bgame\b|unity|godot|phaser|game\s*engine/.test(t)) return "game";

  // CLI tools
  if (detected.appType === "cli" || /\bcli\b|command.line|terminal\s*tool|shell\s*script/.test(t)) return "cli_tool";

  // Libraries / packages
  if (detected.appType === "library" || /npm\s*package|pypi|crate|library|sdk|publish\s*(to|a)\s*(npm|pypi)/.test(t)) return "library";

  // Scripts / automation
  if (/\bscript\b|automat|batch\s*(process|job)|cron\s*job|scheduled\s*(task|job)|webhook\s*handler|file\s*(watcher|processor)/.test(t)) return "script";

  // API / backend
  if (detected.appType === "api" || /rest\s*api|graphql|backend|microservice|api\s*server|api\s*endpoint/.test(t)) return "api_backend";

  // Mobile
  if (detected.appType === "mobile" || /mobile\s*app|ios\s*app|android\s*app|flutter\s*app|react\s*native/.test(t)) return "mobile_app";

  // Web
  if (detected.appType === "web" || /website|web\s*app|dashboard|landing\s*page|portfolio\s*(site|page|website)|saas/.test(t)) return "web_app";

  // LLM / AI-powered apps (RAG, agents, API wrappers — not model training)
  if (/\b(rag|retrieval.augmented|vector\s*(db|database|store)|langchain|llamaindex|ai\s*(agent|assistant|chatbot)|llm\s*(app|api|chain)|openai\s*api|anthropic\s*api|ai.powered|chat\s*with\s*(my\s*)?(docs|pdf|data)|claude\s*api|gpt.api|vercel\s*ai\s*sdk|crewai|autogen)\b/.test(t)) return "llm_app";

  // DevOps / CI/CD / infrastructure-as-code
  if (/\b(ci\s*\/?\s*cd|github\s*actions|gitlab\s*ci|jenkins|argocd|kubernetes|docker\s*(compose|file|image)|terraform|ansible|helm\s*chart|deploy\s*pipeline|build\s*pipeline|devops|infrastructure.as.code|pulumi)\b/.test(t)) return "devops";

  // Desktop apps (Electron, Tauri, native GUI)
  if (/\belectron\b|tauri|desktop\s*app|(windows|mac|linux|macos)\s*(desktop|app|gui|application)\b/.test(t)) return "desktop_app";

  // Browser extensions
  if (/chrome\s*extension|firefox\s*(addon|extension)|browser\s*extension|manifest\s*v[23]|content\s*script/.test(t)) return "browser_extension";

  // Blockchain / Web3 / smart contracts
  if (/\b(smart\s*contract|solidity|web3\b|defi|nft\b|ethereum|solana|blockchain|on.chain|erc.?20|erc.?721|\bdao\b|dapp|metamask|hardhat|foundry|anchor\s*program)\b/.test(t)) return "blockchain";

  // Data engineering / pipelines (distinct from data analysis)
  if (/\b(data\s*pipeline|etl\s*pipeline|data\s*warehouse|apache\s*(spark|kafka|flink|airflow)|pyspark|\bdbt\b|kafka\s*(consumer|producer)|stream\s*processing|data\s*lake|bigquery|snowflake|redshift)\b/.test(t)) return "data_engineering";

  // Embedded / IoT / firmware
  if (/\b(arduino|esp32|esp8266|raspberry\s*pi|stm32|microcontroller|firmware|freertos|embedded\s*(system|c\b|linux)|iot\s*(device|sensor|firmware)|micropython|circuitpython|zephyr\s*rtos)\b/.test(t)) return "embedded";

  return "default";
}

function resolveOption(text, options) {
  const t = (text || "").trim();
  if (!t) return null; // blank → caller uses default
  const n = parseInt(t, 10);
  if (n >= 1 && n <= options.length) return options[n - 1];
  return t; // free-text answer
}

function formatQuestion(q, stepNum, totalSteps, detectedDefault) {
  const lines = [
    `[ ${stepNum} / ${totalSteps} ]  ${q.label}`,
    "",
  ];
  q.options.forEach((opt, i) => {
    lines.push(`  ${i + 1}.  ${opt}`);
  });
  lines.push("");
  if (detectedDefault) {
    lines.push(`  Auto-detected: ${detectedDefault}`);
    lines.push(`  Type 1 to confirm, or type another number / custom answer`);
  } else {
    lines.push(`  Type 1-${q.options.length}, or enter a custom answer`);
  }
  return lines.join("\n");
}

function emit(directiveStr) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: directiveStr,
      },
    })
  );
}

(async () => {
  const payload = await readJsonStdin();
  const cwd = payload.cwd || process.cwd();
  const prompt = (payload.prompt || "").trim();

  const claudeMdPath = path.join(cwd, ".claude", "CLAUDE.md");

  // Already onboarded - skip entirely
  if (fs.existsSync(claudeMdPath)) {
    process.exit(0);
  }

  const state = readSessionState();
  const step = state.onboardingStep || 0;

  // Completed onboarding this session - skip
  const savedTotal = state.onboardingTotal || 5;
  if (step > savedTotal) {
    process.exit(0);
  }

  appendDebugLog("onboarding_step", { step, cwd });

  // ── Step 0: first trigger - save original prompt, ask Q1 ──────────────
  if (step === 0) {
    const detected = analyzePrompt(prompt.slice(0, 500));

    // Enhance detection by scanning project files on disk
    const stackFiles = [
      { file: "package.json", detect: () => {
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
          const deps = { ...pkg.dependencies, ...pkg.devDependencies };
          if (deps.next) return "Next.js";
          if (deps.react) return "React + TypeScript";
          if (deps.vue || deps.nuxt) return "Vue / Nuxt";
          return "Node.js / Express";
        } catch { return "Node.js / Express"; }
      }},
      { file: "requirements.txt", detect: () => "Python" },
      { file: "pyproject.toml",   detect: () => "Python" },
      { file: "Cargo.toml",       detect: () => "Rust" },
      { file: "go.mod",           detect: () => "Go" },
      { file: "pubspec.yaml",     detect: () => "Flutter / Dart" },
      { file: "pom.xml",          detect: () => "Java" },
      { file: "build.gradle",     detect: () => "Java" },
    ];
    for (const { file, detect } of stackFiles) {
      if (fs.existsSync(path.join(cwd, file))) {
        detected.framework = detected.framework || detect();
        break;
      }
    }

    const category = classifyIntent(prompt, detected);
    const questions = QUESTION_SETS[category] || QUESTION_SETS.default;

    mergeSessionState((prev) => ({
      ...prev,
      onboardingStep: 1,
      onboardingOriginalPrompt: prompt.slice(0, 400),
      onboardingCategory: category,
      onboardingTotal: questions.length,
      onboardingQuestions: questions,
      detectedSignals: detected,
      onboardingAnswers: {},
    }));

    appendDebugLog("onboarding_start", { originalPrompt: prompt.slice(0, 100), category });

    const qText = formatQuestion(questions[0], 1, questions.length, null);

    emit([
      "⛔ ONBOARDING - Ask ONLY this question. Do NOT write code or start the task yet.",
      "",
      qText,
      "",
      "Present this question clearly, then STOP and wait for the user's answer.",
    ].join("\n"));
    return;
  }

  // ── Steps 1–N: capture answer to Q(step-1), ask Q(step) or finalize ───
  const category = state.onboardingCategory || "default";
  const questions = state.onboardingQuestions
    || QUESTION_SETS[category]
    || QUESTION_SETS.default;
  const total = state.onboardingTotal || questions.length;

  const answers = { ...(state.onboardingAnswers || {}) };
  const prevQ = questions[step - 1];
  answers[prevQ.key] = resolveOption(prompt, prevQ.options) || prevQ.options[0];

  if (step < total) {
    mergeSessionState((prev) => ({
      ...prev,
      onboardingStep: step + 1,
      onboardingAnswers: answers,
    }));

    const qText = formatQuestion(questions[step], step + 1, total, null);

    emit([
      `⛔ ONBOARDING - Ask Question ${step + 1}. Do NOT write code yet.`,
      "",
      qText,
      "",
      "Present this question, then STOP and wait for the user's answer.",
    ].join("\n"));
    return;
  }

  // ── All answers collected: create files ───────────────────────────────
  mergeSessionState((prev) => ({
    ...prev,
    onboardingStep: total + 1,
    onboardingDone: true,
    onboardingAnswers: answers,
  }));

  appendDebugLog("onboarding_complete", { answers, category });

  const projectName = path.basename(cwd) || "Project";
  const originalPrompt = state.onboardingOriginalPrompt || "";

  // Build CLAUDE.md lines from collected answers using question labels as keys
  const answerLines = questions.map((q) => {
    const val = answers[q.key];
    if (!val || val === "None") return null;
    // Use the question label as the field name, strip trailing "?"
    const label = q.label.replace(/\?$/, "").trim();
    return `${label}: ${val}`;
  }).filter(Boolean);

  const baseIgnore = [
    "node_modules/", "dist/", "build/", ".next/", "coverage/",
    ".turbo/", "vendor/", "out/", ".git/", ".cache/", ".parcel-cache/",
    "__pycache__/", "target/",
    "*.lock", "*.log", "*.map", "*.min.js", "*.min.css",
    "*.wasm", "*.pb", "*.tsbuildinfo", "*.pyc", "*.class",
    ".env", ".env.*", "*.env",
  ];

  // Merge .gitignore rules (git-aware ignore)
  const gitignorePath = path.join(cwd, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const baseSet = new Set(baseIgnore);
    const extra = fs.readFileSync(gitignorePath, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && !baseSet.has(l));
    baseIgnore.push(...extra);
  }

  // ── Write files directly (don't rely on Claude to write them) ──────────
  const claudeDir = path.join(cwd, ".claude");
  if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });

  const claudeMdContent = [
    `# ${projectName}`,
    ...answerLines,
    ``,
    `# AI strategy`,
    `Use Haiku for simple tasks; Sonnet for main dev; Opus for complex arch or if Sonnet fails 2x.`,
    `Keep context low: Grep before Read, targeted reads only.`,
    ``,
    `# Rules`,
    `Concise responses. No overengineering. No unrequested extras.`,
  ].join("\n");

  fs.writeFileSync(path.join(claudeDir, "CLAUDE.md"), claudeMdContent, "utf8");

  const settingsContent = JSON.stringify({
    permissions: { deny: DENY_RULES, ask: ASK_RULES },
  }, null, 2);
  fs.writeFileSync(path.join(claudeDir, "settings.json"), settingsContent, "utf8");

  fs.writeFileSync(path.join(cwd, ".claudeignore"), baseIgnore.join("\n"), "utf8");

  appendDebugLog("onboarding_files_written", { claudeDir, cwd });

  const summary = answerLines.slice(0, 3).join(" | ");
  emit([
    "✅ ONBOARDING COMPLETE - Project files written. Execute the original request now.",
    "",
    `Project: ${projectName} (${category}) — ${summary}`,
    `Files created: .claude/CLAUDE.md, .claude/settings.json, .claudeignore`,
    "",
    `Announce: 'Setup complete. Now building: ${originalPrompt.slice(0, 100)}'`,
    `Then immediately execute: "${originalPrompt}"`,
    "When done: 'Done. [1-line summary]. Ready to test.' Then STOP.",
  ].join("\n"));
})();

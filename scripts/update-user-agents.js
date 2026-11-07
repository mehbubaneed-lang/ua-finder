const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "../data/user-agents.json");

// User-Agent database source
const SOURCES = [
  "https://raw.githubusercontent.com/ShrekBytes/useragents-data/main/data.json"
];

async function fetchUserAgents(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Source failed: ${url} (${response.status})`);
  }

  const data = await response.json();

  if (Array.isArray(data)) return data;

  if (Array.isArray(data.userAgents)) return data.userAgents;
  if (Array.isArray(data.data)) return data.data;

  throw new Error("Unknown source data format");
}

function normalize(item) {
  if (typeof item === "string") {
    return { userAgent: item, source: "ShrekBytes" };
  }

  if (!item || typeof item !== "object") return null;

  const userAgent =
    item.userAgent ||
    item.user_agent ||
    item.ua ||
    item.string;

  if (typeof userAgent !== "string" || !userAgent.trim()) {
    return null;
  }

  return {
    ...item,
    userAgent: userAgent.trim(),
    source: item.source || "ShrekBytes"
  };
}

async function main() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });

  let oldData = [];

  if (fs.existsSync(DATA_FILE)) {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    oldData = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.userAgents)
        ? parsed.userAgents
        : [];
  }

  const newData = [];

  for (const source of SOURCES) {
    try {
      const records = await fetchUserAgents(source);

      for (const item of records) {
        const normalized = normalize(item);
        if (normalized) newData.push(normalized);
      }

      console.log(`Fetched ${records.length} records`);
    } catch (error) {
      console.error(error.message);
    }
  }

  if (newData.length === 0) {
    throw new Error("No new User-Agent data received. Existing database preserved.");
  }

  const merged = new Map();

  for (const item of [...oldData, ...newData]) {
    const normalized = normalize(item);
    if (!normalized) continue;

    const key = normalized.userAgent.toLowerCase();

    if (!merged.has(key)) {
      merged.set(key, normalized);
    }
  }

  const result = [...merged.values()];

  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(result, null, 2) + "\n",
    "utf8"
  );

  console.log(`Old records: ${oldData.length}`);
  console.log(`New source records: ${newData.length}`);
  console.log(`Total unique records: ${result.length}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

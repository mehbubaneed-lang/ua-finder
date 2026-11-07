const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "../data/user-agents.json");

const SOURCES = [
  {
    name: "WinFuture23 Real World User Agents",
    url: "https://raw.githubusercontent.com/WinFuture23/real-world-user-agents/main/user-agents.json",
    type: "winfuture"
  },
  {
    name: "ShrekBytes Desktop",
    url: "https://raw.githubusercontent.com/ShrekBytes/useragents-data/main/data/desktop.json",
    type: "shrek"
  },
  {
    name: "ShrekBytes Mobile",
    url: "https://raw.githubusercontent.com/ShrekBytes/useragents-data/main/data/mobile.json",
    type: "shrek"
  },
  {
    name: "ShrekBytes Tablet",
    url: "https://raw.githubusercontent.com/ShrekBytes/useragents-data/main/data/tablet.json",
    type: "shrek"
  }
];

function detectCategory(ua) {
  if (/FBAN|FBAV|FB_IAB|FB4A|FBIOS|FBAN\/EMA/i.test(ua))
    return "Facebook";

  if (/TwitterAndroid|Twitter for iPhone|TwitterWeb|Twitter\/|XAndroid/i.test(ua))
    return "X / Twitter";

  if (/musical_ly|BytedanceWebview|TikTok/i.test(ua))
    return "TikTok";

  if (/com\.google\.android\.youtube|YouTube\//i.test(ua))
    return "YouTube";

  if (/Instagram/i.test(ua))
    return "Instagram";

  if (/WhatsApp/i.test(ua))
    return "WhatsApp";

  if (/iPhone|iPad|iPod/i.test(ua))
    return "iPhone";

  if (/Android/i.test(ua))
    return "Android";

  if (/Windows/i.test(ua))
    return "Windows";

  if (/Macintosh|Mac OS X/i.test(ua))
    return "Mac";

  if (/X11; Linux|Linux x86_64|Linux i686|Linux arm/i.test(ua))
    return "Linux";

  return "";
}

function getUserAgent(item, sourceType) {
  if (typeof item === "string") return item;

  if (!item || typeof item !== "object") return "";

  if (sourceType === "winfuture") {
    return item.ua || "";
  }

  return item.user_agent || item.userAgent || item.ua || "";
}

function makeName(item, category) {
  const browser = item?.browser?.name || "";
  const os = item?.os?.name || "";

  if (browser && os) {
    return `${browser} on ${os}`;
  }

  if (browser) {
    return `${browser} ${category}`;
  }

  return `${category} User-Agent`;
}

async function fetchSource(source) {
  const response = await fetch(source.url, {
    signal: AbortSignal.timeout(30000),
    headers: {
      "User-Agent": "UA-Finder-Database/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`${source.name}: HTTP ${response.status}`);
  }

  const data = await response.json();

  if (!data || !Array.isArray(data.user_agents)) {
    throw new Error(`${source.name}: Invalid JSON structure`);
  }

  return data;
}

async function main() {
  console.log("Starting UA Finder database update...");

  if (!fs.existsSync(DATA_FILE)) {
    throw new Error("Database not found. No existing data was changed.");
  }

  const db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

  if (!db || !Array.isArray(db.records)) {
    throw new Error("Invalid database. Expected records array.");
  }

  const existing = new Map();

  for (const record of db.records) {
    if (record && typeof record.ua === "string" && record.ua.trim()) {
      existing.set(record.ua.trim().toLowerCase(), record);
    }
  }

  let fetched = 0;
  let added = 0;
  let refreshed = 0;
  let successfulSources = 0;

  const sourceReport = [];
  const today = new Date().toISOString();

  for (const source of SOURCES) {
    console.log(`Fetching: ${source.name}`);

    try {
      const data = await fetchSource(source);

      successfulSources++;

      let sourceAdded = 0;

      fetched += data.user_agents.length;

      for (const item of data.user_agents) {
        const ua = getUserAgent(item, source.type);

        if (typeof ua !== "string" || !ua.trim()) {
          continue;
        }

        const cleanUA = ua.trim();

        if (cleanUA.length < 20 || cleanUA.length > 2000) {
          continue;
        }

        const category = detectCategory(cleanUA);

        if (!category) {
          continue;
        }

        const key = cleanUA.toLowerCase();

        const firstSeen =
          item?.first_seen ||
          item?.firstSeen ||
          "";

        const lastSeen =
          item?.last_seen ||
          item?.lastSeen ||
          today;

        const sourceName = source.name;

        if (existing.has(key)) {
          const oldRecord = existing.get(key);

          // Preserve old records and their original information.
          // Upgrade category when a genuine app token is detected.
          if (
            ["Facebook", "X / Twitter", "TikTok", "YouTube",
             "Instagram", "WhatsApp"].includes(category)
          ) {
            oldRecord.category = category;
          }

          const sources = Array.isArray(oldRecord.sources)
            ? oldRecord.sources
            : [];

          if (!sources.includes(sourceName)) {
            sources.push(sourceName);
          }

          oldRecord.sources = sources;
          oldRecord.lastSeen = lastSeen;

          refreshed++;
          continue;
        }

        const record = {
          category,
          name: makeName(item, category),
          ua: cleanUA,
          kind: "observed",
          source: sourceName,
          sources: [sourceName],
          firstSeen,
          lastSeen
        };

        db.records.push(record);
        existing.set(key, record);

        added++;
        sourceAdded++;
      }

      sourceReport.push({
        source: sourceName,
        status: "success",
        received: data.user_agents.length,
        added: sourceAdded,
        generatedAt: data.generated_at || ""
      });

      console.log(
        `${source.name}: ${data.user_agents.length} checked, ${sourceAdded} added`
      );

    } catch (error) {
      console.error(`Source warning: ${error.message}`);

      sourceReport.push({
        source: source.name,
        status: "failed",
        error: error.message
      });
    }
  }

  if (successfulSources === 0) {
    throw new Error(
      "All data sources failed. Existing database was not changed."
    );
  }

  db.lastUpdated = today;
  db.sourceReport = sourceReport;

  const temporaryFile = DATA_FILE + ".tmp";

  fs.writeFileSync(
    temporaryFile,
    JSON.stringify(db, null, 2) + "\n",
    "utf8"
  );

  fs.renameSync(temporaryFile, DATA_FILE);

  console.log("--------------------------------");
  console.log("UA Finder update completed.");
  console.log("Successful sources:", successfulSources);
  console.log("Source entries checked:", fetched);
  console.log("New records added:", added);
  console.log("Existing records refreshed:", refreshed);
  console.log("Total database records:", db.records.length);
  console.log("Updated at:", db.lastUpdated);
  console.log("--------------------------------");
}

main().catch(error => {
  console.error("DATABASE UPDATE FAILED:", error);
  process.exit(1);
});

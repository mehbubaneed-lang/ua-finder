const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "../data/user-agents.json");

const SOURCE =
  "https://raw.githubusercontent.com/ShrekBytes/useragents-data/main/data";

const GROUPS = ["desktop", "mobile", "tablet"];

function detectCategory(ua) {
  if (/FBAN|FBAV|FB_IAB|FB4A/i.test(ua)) return "Facebook";
  if (/TwitterAndroid|Twitter for iPhone|TwitterWeb/i.test(ua)) return "X / Twitter";
  if (/musical_ly|TikTok/i.test(ua)) return "TikTok";
  if (/com\.google\.android\.youtube|YouTube\//i.test(ua)) return "YouTube";
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/WhatsApp/i.test(ua)) return "WhatsApp";

  if (/iPhone|iPad|iPod/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/X11; Linux|Linux x86_64|Linux i686/i.test(ua)) return "Linux";

  return "";
}

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error("Database file not found. Existing data was not changed.");
  }

  const db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

  if (!db || !Array.isArray(db.records)) {
    throw new Error("Invalid database format. Expected db.records.");
  }

  const seen = new Set(
    db.records
      .filter(x => x && typeof x.ua === "string")
      .map(x => x.ua.trim().toLowerCase())
  );

  let fetched = 0;
  let added = 0;

  for (const group of GROUPS) {
    const url = `${SOURCE}/${group}.json`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Source failed: ${group} (${response.status})`);
    }

    const data = await response.json();

    if (!Array.isArray(data.user_agents)) {
      throw new Error(`Invalid source format: ${group}`);
    }

    fetched += data.user_agents.length;

    for (const item of data.user_agents) {
      const ua = typeof item === "string"
        ? item
        : item?.user_agent || item?.userAgent || item?.ua;

      if (typeof ua !== "string" || !ua.trim()) continue;

      const cleanUA = ua.trim();
      const key = cleanUA.toLowerCase();

      if (seen.has(key)) continue;

      const category = detectCategory(cleanUA);
      if (!category) continue;

      seen.add(key);

      db.records.push({
        category,
        name: `${category} Browser`,
        ua: cleanUA,
        kind: item?.kind || "observed",
        source: "ShrekBytes/useragents-data"
      });

      added++;
    }

    console.log(`${group}: ${data.user_agents.length} entries checked`);
  }

  db.lastUpdated = new Date().toISOString();

  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(db, null, 2) + "\n",
    "utf8"
  );

  console.log("Source entries checked:", fetched);
  console.log("New records added:", added);
  console.log("Total records:", db.records.length);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

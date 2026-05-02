#!/usr/bin/env node
/**
 * Pushes only CHANGED files to GitHub using the REST API (incremental mode).
 * Reads the list of changed files from a passed argument or detects them
 * by diffing local content against the GitHub tree.
 * Run: node scripts/src/github-push.mjs [file1 file2 ...]
 *   or: node scripts/src/github-push.mjs   ← auto-detects changes vs GitHub HEAD
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

const OWNER = "JBlizzard-sketch";
const REPO = "komm";
const BRANCH = "main";
const BASE = "/home/runner/workspace";
const TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

if (!TOKEN) {
  console.error("❌  GITHUB_PERSONAL_ACCESS_TOKEN is not set");
  process.exit(1);
}

const API = "https://api.github.com";
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, urlPath, body, { retries = 3, baseDelay = 15000 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${API}${urlPath}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if ((res.status === 403 || res.status === 429) && attempt < retries) {
      const retryAfter = parseInt(res.headers.get("Retry-After") ?? "0", 10) * 1000;
      const wait = retryAfter || baseDelay * Math.pow(2, attempt);
      console.warn(`  ⏳  Rate limited (${res.status}) — waiting ${Math.round(wait / 1000)}s [retry ${attempt + 1}/${retries}]…`);
      await sleep(wait);
      continue;
    }
    const text = await res.text();
    if (!res.ok) {
      throw Object.assign(new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0, 300)}`), { status: res.status });
    }
    return text ? JSON.parse(text) : null;
  }
  throw new Error("Exhausted retries");
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".cache", "build", "coverage", ".pnpm-store", ".pnpm", ".turbo", "tmp", ".local"]);
const BINARY_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".pdf", ".zip", ".tar", ".gz"]);
const isBinary = (p) => BINARY_EXT.has(path.extname(p).toLowerCase());

function gitBlobSha(content) {
  // git computes SHA-1 as: "blob <size>\0<content>"
  const header = Buffer.from(`blob ${content.length}\0`);
  return crypto.createHash("sha1").update(Buffer.concat([header, content])).digest("hex");
}

function walk(dir) {
  const results = [];
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return results; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry) || entry.startsWith(".env")) continue;
    const full = path.join(dir, entry);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (stat.isDirectory()) {
      results.push(...walk(full));
    } else {
      if (stat.size > 3 * 1024 * 1024) continue;
      if (full.endsWith(".map") || full.endsWith(".DS_Store")) continue;
      results.push(full);
    }
  }
  return results;
}

async function flattenTree(treeSha) {
  // Fetch the full recursive tree from GitHub — returns path→sha map
  const res = await api("GET", `/repos/${OWNER}/${REPO}/git/trees/${treeSha}?recursive=1`);
  const map = {};
  for (const item of res.tree ?? []) {
    if (item.type === "blob") map[item.path] = item.sha;
  }
  return map;
}

async function getBranchRef() {
  try {
    const res = await api("GET", `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`);
    return res?.object?.sha ?? null;
  } catch (e) {
    if (e.status === 404 || e.status === 409) return null;
    throw e;
  }
}

async function run() {
  console.log(`\n🚀  Incremental push → github.com/${OWNER}/${REPO} (${BRANCH})\n`);

  const headSha = await getBranchRef();
  if (!headSha) {
    console.error("❌  No branch found. Run the full bootstrap push first.");
    process.exit(1);
  }

  // Get HEAD commit + tree
  const headCommit = await api("GET", `/repos/${OWNER}/${REPO}/git/commits/${headSha}`);
  const baseTreeSha = headCommit.tree.sha;

  // Fetch the current GitHub tree (path→sha)
  console.log("  📊  Fetching current GitHub tree…");
  const ghTree = await flattenTree(baseTreeSha);
  console.log(`  ✅  GitHub tree has ${Object.keys(ghTree).length} blobs\n`);

  // Walk local files and find changes
  const allLocal = walk(BASE);
  const changedFiles = [];
  const newFiles = [];

  for (const fullPath of allLocal) {
    const relPath = path.relative(BASE, fullPath);
    const content = fs.readFileSync(fullPath);
    const localSha = gitBlobSha(content);
    const ghSha = ghTree[relPath];
    if (!ghSha) {
      newFiles.push({ fullPath, relPath, content });
    } else if (ghSha !== localSha) {
      changedFiles.push({ fullPath, relPath, content });
    }
  }

  // Detect deleted files
  const localPaths = new Set(allLocal.map((f) => path.relative(BASE, f)));
  const deletedPaths = Object.keys(ghTree).filter((p) => !localPaths.has(p));

  console.log(`  📝  Changed: ${changedFiles.length} | New: ${newFiles.length} | Deleted: ${deletedPaths.length}`);

  if (changedFiles.length === 0 && newFiles.length === 0 && deletedPaths.length === 0) {
    console.log("\n✅  Nothing to push — already up to date.\n");
    return;
  }

  // Upload only changed/new blobs (sequential with delay)
  const treeEntries = [];
  const toUpload = [...changedFiles, ...newFiles];

  for (let idx = 0; idx < toUpload.length; idx++) {
    const { relPath, content } = toUpload[idx];
    const binary = isBinary(relPath);
    process.stdout.write(`  ⬆️   [${idx + 1}/${toUpload.length}] ${relPath}\n`);
    const res = await api("POST", `/repos/${OWNER}/${REPO}/git/blobs`, {
      content: binary ? content.toString("base64") : content.toString("utf-8"),
      encoding: binary ? "base64" : "utf-8",
    });
    treeEntries.push({ path: relPath, mode: "100644", type: "blob", sha: res.sha });
    if (idx < toUpload.length - 1) await sleep(400);
  }

  // Add deletion entries (null sha removes from tree)
  for (const delPath of deletedPaths) {
    treeEntries.push({ path: delPath, mode: "100644", type: "blob", sha: null });
  }

  // Create tree
  console.log("\n  🌲  Creating git tree…");
  const treeRes = await api("POST", `/repos/${OWNER}/${REPO}/git/trees`, {
    base_tree: baseTreeSha,
    tree: treeEntries,
  });

  // Create commit
  const now = new Date().toISOString();
  console.log("  📝  Creating commit…");
  const summary = [
    changedFiles.length && `${changedFiles.length} modified`,
    newFiles.length && `${newFiles.length} added`,
    deletedPaths.length && `${deletedPaths.length} deleted`,
  ].filter(Boolean).join(", ");
  const commitRes = await api("POST", `/repos/${OWNER}/${REPO}/git/commits`, {
    message: `feat: ${summary} — ${now.slice(0, 19).replace("T", " ")} UTC\n\nPushed from Replit via GitHub REST API`,
    tree: treeRes.sha,
    parents: [headSha],
    author: { name: "Komm Bot", email: "komm-bot@replit.dev", date: now },
  });

  // Update branch ref
  console.log(`  🔖  Updating refs/heads/${BRANCH}…`);
  await api("PATCH", `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    sha: commitRes.sha,
    force: false,
  });

  console.log(`\n✅  Done!  https://github.com/${OWNER}/${REPO}`);
  console.log(`   Commit: ${commitRes.sha.slice(0, 7)} — ${summary}\n`);
}

run().catch((err) => {
  console.error("\n❌ ", err.message);
  process.exit(1);
});

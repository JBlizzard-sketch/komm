#!/usr/bin/env node
/**
 * Pushes the workspace to GitHub using the REST API (no git CLI required).
 * Handles both empty (un-initialized) repos and subsequent incremental pushes.
 * Run: node scripts/src/github-push.mjs
 */
import fs from "fs";
import path from "path";

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

async function api(method, urlPath, body) {
  const res = await fetch(`${API}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw Object.assign(new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0, 300)}`), { status: res.status });
  }
  if (!text) return null;
  return JSON.parse(text);
}

/** Use Contents API for a single small file — initialises the git DB */
async function putFileViaContentsApi(filePath, content, message, sha) {
  const body = {
    message,
    content: Buffer.from(content).toString("base64"),
    branch: BRANCH,
  };
  if (sha) body.sha = sha; // update existing file
  return api("PUT", `/repos/${OWNER}/${REPO}/contents/${filePath}`, body);
}

/** Dirs to skip */
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", ".cache", "build", "coverage",
  ".pnpm-store", ".pnpm", ".turbo", "tmp", ".local",
]);
const SKIP_FILES = new Set([".DS_Store", "Thumbs.db"]);
const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico",
  ".woff", ".woff2", ".ttf", ".eot", ".pdf", ".zip", ".tar", ".gz",
]);

function isBinary(p) { return BINARY_EXT.has(path.extname(p).toLowerCase()); }

function shouldSkip(name) {
  return SKIP_DIRS.has(name) || SKIP_FILES.has(name) || name.startsWith(".env");
}

function walk(dir) {
  const results = [];
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return results; }
  for (const entry of entries) {
    if (shouldSkip(entry)) continue;
    const full = path.join(dir, entry);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (stat.isDirectory()) {
      results.push(...walk(full));
    } else {
      if (stat.size > 3 * 1024 * 1024) {
        console.warn(`  ⚠️  Skipping large file: ${path.relative(BASE, full)}`);
        continue;
      }
      if (full.endsWith(".map")) continue;
      results.push(full);
    }
  }
  return results;
}

async function getBranchRef() {
  try {
    const res = await api("GET", `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`);
    return res?.object?.sha || null;
  } catch (e) {
    if (e.status === 404 || e.status === 409) return null;
    throw e;
  }
}

async function run() {
  console.log(`\n🚀  Pushing to github.com/${OWNER}/${REPO} (${BRANCH})\n`);

  // Step 1: Check if branch exists (repo initialized)
  let headSha = await getBranchRef();

  if (!headSha) {
    console.log("  📌  Empty repo detected — bootstrapping with README…");
    const readme = fs.readFileSync(path.join(BASE, "README.md"), "utf-8");
    const result = await putFileViaContentsApi("README.md", readme, "chore: initial commit — Komm bulk messaging platform");
    headSha = result.commit.sha;
    console.log(`  ✅  Bootstrap commit: ${headSha.slice(0, 7)}`);
  }

  // Step 2: Walk files
  const allFiles = walk(BASE);
  console.log(`  📁  ${allFiles.length} files to push\n`);

  // Step 3: Get base tree from current HEAD
  const headCommit = await api("GET", `/repos/${OWNER}/${REPO}/git/commits/${headSha}`);
  const baseTreeSha = headCommit.tree.sha;

  // Step 4: Create blobs in batches
  const treeEntries = [];
  const BATCH = 8;
  let processed = 0;
  let skipped = 0;

  for (let i = 0; i < allFiles.length; i += BATCH) {
    const batch = allFiles.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (fullPath) => {
        const relPath = path.relative(BASE, fullPath);
        // Skip README here — already pushed via Contents API
        if (relPath === "README.md" && i === 0) return null;
        const binary = isBinary(fullPath);
        const content = fs.readFileSync(fullPath);
        const res = await api("POST", `/repos/${OWNER}/${REPO}/git/blobs`, {
          content: binary ? content.toString("base64") : content.toString("utf-8"),
          encoding: binary ? "base64" : "utf-8",
        });
        return { path: relPath, mode: "100644", type: "blob", sha: res.sha };
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) treeEntries.push(r.value);
      else if (r.status === "rejected") {
        skipped++;
        console.warn(`  ⚠️  ${r.reason?.message?.slice(0, 100)}`);
      }
    }
    processed += batch.length;
    if (processed % 48 === 0 || processed >= allFiles.length) {
      console.log(`  ⏳  ${Math.min(processed, allFiles.length)}/${allFiles.length} files processed…`);
    }
  }

  console.log(`\n  ✅  ${treeEntries.length} blobs created (${skipped} skipped)`);

  // Step 5: Create tree
  console.log("  🌲  Creating git tree…");
  const treeRes = await api("POST", `/repos/${OWNER}/${REPO}/git/trees`, {
    base_tree: baseTreeSha,
    tree: treeEntries,
  });

  // Step 6: Create commit
  const now = new Date().toISOString();
  console.log("  📝  Creating commit…");
  const commitRes = await api("POST", `/repos/${OWNER}/${REPO}/git/commits`, {
    message: `chore: sync workspace — ${now.slice(0, 19).replace("T", " ")} UTC\n\nPushed from Replit via GitHub REST API`,
    tree: treeRes.sha,
    parents: [headSha],
    author: { name: "Komm Bot", email: "komm-bot@replit.dev", date: now },
  });

  // Step 7: Update branch
  console.log(`  🔖  Updating refs/heads/${BRANCH}…`);
  await api("PATCH", `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    sha: commitRes.sha,
    force: false,
  });

  console.log(`\n✅  Done!  https://github.com/${OWNER}/${REPO}`);
  console.log(`   Commit: ${commitRes.sha.slice(0, 7)} — ${treeEntries.length + 1} files\n`);
}

run().catch((err) => {
  console.error("\n❌ ", err.message);
  process.exit(1);
});

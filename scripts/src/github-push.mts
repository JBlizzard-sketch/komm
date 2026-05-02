#!/usr/bin/env node
/**
 * Pushes the workspace to GitHub using the REST API (no git CLI required).
 * Usage: GITHUB_PERSONAL_ACCESS_TOKEN=... node scripts/src/github-push.mts
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const OWNER = "JBlizzard-sketch";
const REPO = "komm";
const BRANCH = "main";
const BASE = "/home/runner/workspace";
const TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

if (!TOKEN) {
  console.error("❌  GITHUB_PERSONAL_ACCESS_TOKEN is not set");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
};

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${method} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

/** Files/dirs to skip completely */
const SKIP = new Set([
  "node_modules", ".git", "dist", ".cache", "build", "coverage",
  ".pnpm-store", ".pnpm", ".turbo", "tmp",
  "*.map", "*.log",
]);

/** Extensions we treat as binary and base64-encode */
const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg",
  ".woff", ".woff2", ".ttf", ".eot",
  ".pdf", ".zip", ".tar", ".gz",
]);

function isBinary(filePath: string) {
  return BINARY_EXT.has(path.extname(filePath).toLowerCase());
}

function shouldSkip(name: string) {
  return SKIP.has(name) || name.startsWith(".env");
}

function walk(dir: string, base: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir)) {
    if (shouldSkip(entry)) continue;
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results.push(...walk(full, base));
    } else {
      // skip very large files (> 4MB)
      if (stat.size > 4 * 1024 * 1024) {
        console.warn(`  ⚠️  Skipping large file: ${path.relative(base, full)}`);
        continue;
      }
      results.push(full);
    }
  }
  return results;
}

async function createBlob(content: Buffer, encoding: "utf-8" | "base64"): Promise<string> {
  const res = await api("POST", `/repos/${OWNER}/${REPO}/git/blobs`, {
    content: encoding === "base64" ? content.toString("base64") : content.toString("utf-8"),
    encoding,
  }) as { sha: string };
  return res.sha;
}

async function getLatestCommitSha(): Promise<string> {
  const res = await api("GET", `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`) as { object: { sha: string } } | null;
  if (!res) throw new Error("Branch not found");
  return res.object.sha;
}

async function getBaseTreeSha(commitSha: string): Promise<string> {
  const res = await api("GET", `/repos/${OWNER}/${REPO}/git/commits/${commitSha}`) as { tree: { sha: string } };
  return res.tree.sha;
}

async function run() {
  console.log(`\n🚀  Pushing workspace to github.com/${OWNER}/${REPO} (${BRANCH})\n`);

  // Collect all files
  const allFiles = walk(BASE, BASE);
  console.log(`  📁  ${allFiles.length} files found`);

  // Create blobs in batches
  const treeEntries: { path: string; mode: "100644"; type: "blob"; sha: string }[] = [];
  let i = 0;
  const BATCH = 8;

  while (i < allFiles.length) {
    const batch = allFiles.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (fullPath) => {
        const relPath = path.relative(BASE, fullPath);
        const binary = isBinary(fullPath);
        const content = fs.readFileSync(fullPath);
        try {
          const sha = await createBlob(content, binary ? "base64" : "utf-8");
          treeEntries.push({ path: relPath, mode: "100644", type: "blob", sha });
        } catch (e: any) {
          console.warn(`  ⚠️  Skipping ${relPath}: ${e.message.slice(0, 80)}`);
        }
      })
    );
    i += BATCH;
    if (i % 40 === 0) console.log(`  ⏳  Processed ${i}/${allFiles.length} files…`);
  }

  console.log(`  ✅  ${treeEntries.length} blobs created`);

  // Get latest commit
  let baseSha: string;
  let baseTreeSha: string;
  try {
    baseSha = await getLatestCommitSha();
    baseTreeSha = await getBaseTreeSha(baseSha);
  } catch {
    // Empty repo — no base tree
    baseSha = "";
    baseTreeSha = "";
  }

  // Create tree
  console.log("  🌲  Creating tree…");
  const treeRes = await api("POST", `/repos/${OWNER}/${REPO}/git/trees`, {
    base_tree: baseTreeSha || undefined,
    tree: treeEntries,
  }) as { sha: string };

  // Create commit
  const now = new Date().toISOString();
  const commitBody: Record<string, unknown> = {
    message: `chore: sync workspace [${now}]`,
    tree: treeRes.sha,
    author: {
      name: "Komm Bot",
      email: "komm-bot@replit.dev",
      date: now,
    },
  };
  if (baseSha) commitBody.parents = [baseSha];

  console.log("  📝  Creating commit…");
  const commitRes = await api("POST", `/repos/${OWNER}/${REPO}/git/commits`, commitBody) as { sha: string };

  // Update branch ref
  console.log(`  🔖  Updating refs/heads/${BRANCH}…`);
  if (baseSha) {
    await api("PATCH", `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
      sha: commitRes.sha,
      force: false,
    });
  } else {
    await api("POST", `/repos/${OWNER}/${REPO}/git/refs`, {
      ref: `refs/heads/${BRANCH}`,
      sha: commitRes.sha,
    });
  }

  console.log(`\n✅  Done! https://github.com/${OWNER}/${REPO}\n`);
}

run().catch((err) => {
  console.error("❌ ", err.message);
  process.exit(1);
});

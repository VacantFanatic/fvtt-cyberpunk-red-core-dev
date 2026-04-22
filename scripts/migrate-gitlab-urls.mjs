/**
 * One-shot migration: replace GitLab project URLs with GitHub equivalents.
 * Run: node scripts/migrate-gitlab-urls.mjs
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SKIP = new Set(["node_modules", "dist", ".git", "package-lock.json"]);

const TEXT_EXT = new Set([
  ".js",
  ".mjs",
  ".json",
  ".yml",
  ".yaml",
  ".md",
  ".hbs",
  ".sh",
  ".txt",
  ".toml",
]);

function* walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (SKIP.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) yield* walk(p);
    else if (TEXT_EXT.has(path.extname(ent.name))) yield p;
  }
}

function transform(content) {
  let s = content;

  s = s.replace(
    /https:\/\/gitlab\.com\/cyberpunk-red-team\/fvtt-cyberpunk-red-core\/-\/issues\//g,
    "https://github.com/cyberpunk-red-team/fvtt-cyberpunk-red-core/issues/"
  );
  s = s.replace(
    /https:\/\/gitlab\.com\/cyberpunk-red-team\/fvtt-cyberpunk-red-core\/-\/milestones/g,
    "https://github.com/cyberpunk-red-team/fvtt-cyberpunk-red-core/milestones"
  );
  s = s.replace(
    /https:\/\/gitlab\.com\/cyberpunk-red-team\/fvtt-cyberpunk-red-core\/-\/blob\//g,
    "https://github.com/cyberpunk-red-team/fvtt-cyberpunk-red-core/blob/"
  );

  s = s.replace(
    /https:\/\/gitlab\.com\/cyberpunk-red-team\/fvtt-cyberpunk-red-core\/-\/wikis\/([^"'<>\s]+)/g,
    (match, p1) => {
      const hashIdx = p1.indexOf("#");
      const main = hashIdx >= 0 ? p1.slice(0, hashIdx) : p1;
      const frag = hashIdx >= 0 ? p1.slice(hashIdx + 1) : "";
      const slug = main.replace(/\//g, "-");
      return `https://github.com/cyberpunk-red-team/fvtt-cyberpunk-red-core/wiki/${slug}${frag ? `#${frag}` : ""}`;
    }
  );

  s = s.replace(
    /https:\/\/gitlab\.com\/api\/v4\/projects\/22820629\/packages\/generic\/fvtt-cyberpunk-red-core\/latest\/system\.json/g,
    "https://github.com/cyberpunk-red-team/fvtt-cyberpunk-red-core/releases/latest/download/system.json"
  );

  s = s.replace(
    /https:\/\/gitlab\.com\/uploads\/-\/system\/project\/avatar\/22820629\/Repo-Icon\.png/g,
    "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"
  );

  s = s.replace(
    /https:\/\/gitlab\.com\/cyberpunk-red-team\/fvtt-cyberpunk-red-core/g,
    "https://github.com/cyberpunk-red-team/fvtt-cyberpunk-red-core"
  );

  s = s.replace(/\/g, "");

  s = s.replace(/GitHub README/g, "GitHub README");

  return s;
}

let changed = 0;
for (const file of walk(ROOT)) {
  const raw = fs.readFileSync(file, "utf8");
  const next = transform(raw);
  if (next !== raw) {
    fs.writeFileSync(file, next, "utf8");
    changed += 1;
    console.log(file.replace(ROOT + path.sep, ""));
  }
}
console.log(`Done. Updated ${changed} files.`);

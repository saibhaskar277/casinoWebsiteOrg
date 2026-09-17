const fs = require("fs");
const path = require("path");

function tryRead(filePath) {
  try {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, "utf8").trim();
  } catch (_) {
    /* ignore */
  }
  return null;
}

function resolveRepoSecretsDir() {
  const candidates = [
    process.env.SITE_AGENT_SECRETS_DIR,
    path.resolve(process.cwd(), "secrets"),
    path.resolve(process.cwd(), "..", "secrets"),
    path.resolve(__dirname, "..", "..", "secrets"), // <repo>/secrets when cwd varies
    path.resolve(__dirname, "..", "secrets"), // site-agent/secrets
    path.resolve(__dirname, "..", "..", "..", "secrets")
  ].filter(Boolean);

  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return path.resolve(process.cwd(), "secrets");
}

function loadDeepseekApiKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY.trim();
  const dir = resolveRepoSecretsDir();
  return tryRead(path.join(dir, "deepseek.key"));
}

function loadGoogleServiceAccountJson() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  }
  const dir = resolveRepoSecretsDir();
  const p = path.join(dir, "google-calendar-sa.json");
  if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  return null;
}

module.exports = {
  loadDeepseekApiKey,
  loadGoogleServiceAccountJson,
  resolveRepoSecretsDir
};

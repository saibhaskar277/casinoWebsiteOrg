import { AgentApp } from "./core/AgentApp.js";

function getBust() {
  try {
    return window.__ASSET_BUST__ ? String(window.__ASSET_BUST__) : "";
  } catch (_) {
    return "";
  }
}

function withBust(url) {
  const bust = getBust();
  if (!bust) return url;
  return url + (url.includes("?") ? "&" : "?") + "v=" + encodeURIComponent(bust);
}

async function loadJson(url) {
  const res = await fetch(withBust(url), { cache: "no-store" });
  if (!res.ok) throw new Error(`load failed ${res.status}: ${url}`);
  return res.json();
}

function injectCss(basePath) {
  const href = withBust(`${basePath}/assets/netty-bot.css`);
  if (document.querySelector(`link[data-site-agent-css="1"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.siteAgentCss = "1";
  document.head.appendChild(link);
}

/**
 * Boot the portable site-agent widget.
 * Config lives in /site-agent/config/*.json — swap those for a new host site.
 */
async function bootstrap() {
  if (window.__siteAgentBootstrapRan) return;
  window.__siteAgentBootstrapRan = true;

  let config;
  let siteProfile;
  try {
    [config, siteProfile] = await Promise.all([
      loadJson("/site-agent/config/client.config.json"),
      loadJson("/site-agent/config/site.profile.json")
    ]);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("site-agent config failed", e);
    return;
  }
  if (!config?.enabled) return;

  const basePath = config.basePath || "/site-agent/client";
  config.basePath = basePath;
  injectCss(basePath);

  const mountNode = document.createElement("div");
  mountNode.id = "site-agent-mount";
  document.body.appendChild(mountNode);

  const app = new AgentApp({ config, siteProfile, mountNode });
  window.SiteAgent = app;
  window.NettyAgent = app; // backward-compatible alias
  app.mount();
}

bootstrap();

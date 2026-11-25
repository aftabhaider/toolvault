// Notify IndexNow search engines (Bing, Yandex, Seznam, Naver; Bing also
// feeds ChatGPT search and Copilot) that pages changed.
//
//   node scripts/indexnow.mjs                 # every URL in sitemap.xml
//   node scripts/indexnow.mjs /about /solar/  # only these paths
//
// Run it after a deploy is live: engines fetch the key file below to verify
// ownership, so it must already be served from the site root.

import { readFile } from "node:fs/promises";

const HOST = "toolvault.aftabjordan1.workers.dev";
const KEY = "fe7d079fb00a97f7e051c835347fd49e";
const SITE = `https://${HOST}`;

const paths = process.argv.slice(2);
const urlList = paths.length
  ? paths.map(p => new URL(p, SITE).href)
  : [...(await readFile(new URL("../sitemap.xml", import.meta.url), "utf8")).matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList }),
});
console.log(`IndexNow: ${response.status} ${response.statusText} for ${urlList.length} URL(s)`);
if (![200, 202].includes(response.status)) {
  console.log(await response.text());
  process.exitCode = 1;
}

// functions/src/bunny.js
const { createHmac } = require("crypto");

/**
 * Bunny CDN token authentication (current format, same as Bunny's reference code at
 * github.com/BunnyWay/BunnyCDN.TokenAuthentication):
 *   token = "HS256-" + base64url( HMAC-SHA256(securityKey, path + expires) )
 *   url   = https://host/path?token=...&expires=...
 * @param {Object} opts
 * @param {string} opts.host e.g. "unlukt.b-cdn.net"
 * @param {string} opts.path must start with "/"
 * @param {string} opts.securityKey the pull zone's "URL Token Authentication Key"
 * @param {number} [opts.ttlSeconds=3600]
 * @param {number} [opts.expiresAt] fixed expiry (unix seconds) — overrides ttlSeconds
 * @returns {string} Signed CDN URL
 */
function signBunnyUrl(opts) {
  const { host, path, securityKey, ttlSeconds = 3600, expiresAt } = opts;
  if (!path || !path.startsWith("/")) {
    throw new Error("path must start with /");
  }
  if (!securityKey) {
    throw new Error("securityKey is required");
  }
  const cleanHost = host.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const expires = String(expiresAt != null ? expiresAt : Math.floor(Date.now() / 1000) + ttlSeconds);
  const token = "HS256-" + createHmac("sha256", securityKey)
    .update(path)
    .update(expires)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `https://${cleanHost}${path}?token=${token}&expires=${expires}`;
}

module.exports = {
  signBunnyUrl,
};

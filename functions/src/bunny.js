// functions/src/bunny.js
const { createHash } = require("crypto");

/**
 * Bunny CDN token authentication for a Pull Zone / Storage path.
 * token = base64url(sha256(securityKey + path + expires))
 * @param {Object} opts
 * @param {string} opts.host e.g. "unlukt.b-cdn.net"
 * @param {string} opts.path must start with "/"
 * @param {string} opts.securityKey
 * @param {number} [opts.ttlSeconds=3600]
 * @returns {string} Signed CDN URL
 */
function signBunnyUrl(opts) {
  const { host, path, securityKey, ttlSeconds = 3600 } = opts;
  if (!path || !path.startsWith("/")) {
    throw new Error("path must start with /");
  }
  if (!securityKey) {
    throw new Error("securityKey is required");
  }
  const cleanHost = host.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const token = createHash("sha256")
    .update(securityKey + path + expires)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return `https://${cleanHost}${path}?token=${token}&expires=${expires}`;
}

module.exports = {
  signBunnyUrl,
};

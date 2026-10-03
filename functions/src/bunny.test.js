// functions/src/bunny.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { signBunnyUrl } = require("./bunny");

test("signs bunny url with token and expiration", () => {
  const url = signBunnyUrl({
    host: "unlukt.b-cdn.net",
    path: "/uploads/user123/video.mp4",
    securityKey: "secret_test_key_123",
    ttlSeconds: 3600,
  });

  assert.ok(url.startsWith("https://unlukt.b-cdn.net/uploads/user123/video.mp4?token="));
  assert.ok(url.includes("&expires="));
});

test("throws error if path does not start with /", () => {
  assert.throws(() => {
    signBunnyUrl({
      host: "unlukt.b-cdn.net",
      path: "uploads/user123/video.mp4",
      securityKey: "secret",
    });
  }, /path must start with \//);
});

test("strips protocol from host if passed with https://", () => {
  const url = signBunnyUrl({
    host: "https://unlukt.b-cdn.net/",
    path: "/media/photo.jpg",
    securityKey: "secret",
  });

  assert.ok(url.startsWith("https://unlukt.b-cdn.net/media/photo.jpg?token="));
});

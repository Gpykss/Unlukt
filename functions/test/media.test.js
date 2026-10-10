// functions/test/media.test.js — paid media never stays readable in public docs
const test = require("node:test");
const assert = require("node:assert/strict");
const { installMock, Timestamp } = require("./mockFirestore");
const db = installMock();
const sharp = require("sharp");
const media = require("../src/media");

test.before(async () => {
  const png = await sharp({ create: { width: 200, height: 120, channels: 3, background: "#e11d48" } }).png().toBuffer();
  global.fetch = async () => ({ ok: true, arrayBuffer: async () => png });
});

test("locked post: originals moved to mediaPrivate, public doc gets blurred preview only", async () => {
  db.store.clear();
  const post = { userId: "cre", type: "paid", price: 5, images: [{ url: "https://unlukt.b-cdn.net/a.jpg", type: "image" }, { url: "https://unlukt.b-cdn.net/b.mp4", type: "video" }] };
  db.seed("posts/p1", post);
  assert.equal(await media.protectPost("p1", db.data("posts/p1")), "protected");
  const pub = db.data("posts/p1");
  assert.ok(!JSON.stringify(pub).includes("b-cdn.net"), "no CDN url left in public doc");
  assert.match(pub.images[0].previewUrl, /^data:image\/webp;base64,/);
  assert.ok(pub.images[0].previewUrl.length < 3000);
  assert.equal(pub.images[1].type, "video");
  assert.equal(db.data("mediaPrivate/post_p1").items.length, 2);
  // trigger runs again on its own write → no-op
  assert.equal(await media.protectPost("p1", db.data("posts/p1")), "already");
});

test("getMedia: stranger refused, buyer / subscriber / owner get the real urls", async () => {
  db.seed("users/x", {});
  await assert.rejects(media.getMedia("x", { postId: "p1" }), /Unlock or subscribe/);
  await assert.rejects(media.getMedia(null, { postId: "p1" }));
  db.seed("unlocks/p1_buyer", { fanId: "buyer" });
  db.seed("users/buyer", {});
  const r = await media.getMedia("buyer", { postId: "p1" });
  assert.equal(r.items[0].url, "https://unlukt.b-cdn.net/a.jpg");
  db.seed("subscriptions/sub_cre", { status: "active", expiresAt: Timestamp.fromMillis(Date.now() + 1e6) });
  db.seed("users/sub", {});
  assert.equal((await media.getMedia("sub", { postId: "p1" })).items.length, 2);
  db.seed("subscriptions/old_cre", { status: "active", expiresAt: Timestamp.fromMillis(Date.now() - 1e6) });
  db.seed("users/old", {});
  await assert.rejects(media.getMedia("old", { postId: "p1" }));
  assert.equal((await media.getMedia("cre", { postId: "p1" })).items.length, 2);
});

test("editing a locked post keeps originals; switching to free restores them", async () => {
  // creator reorders: keeps locked item 1, adds a new upload
  const cur = db.data("posts/p1");
  db.seed("posts/p1", { ...cur, images: [cur.images[1], { url: "https://unlukt.b-cdn.net/c.jpg", type: "image" }] });
  await media.protectPost("p1", db.data("posts/p1"));
  assert.deepEqual(db.data("mediaPrivate/post_p1").items.map((i) => i.url), ["https://unlukt.b-cdn.net/b.mp4", "https://unlukt.b-cdn.net/c.jpg"]);
  db.seed("posts/p1", { ...db.data("posts/p1"), type: "free" });
  assert.equal(await media.protectPost("p1", db.data("posts/p1")), "restored");
  assert.equal(db.data("posts/p1").images[1].url, "https://unlukt.b-cdn.net/c.jpg");
});

test("PPV message: media moved out, only sender / buyers get it", async () => {
  db.seed("conversations/c1", { participants: ["cre", "fan"] });
  db.seed("conversations/c1/messages/m1", { senderId: "cre", isPPV: true, mediaUrl: "https://unlukt.b-cdn.net/x.jpg", mediaType: "image", unlockedBy: [] });
  await media.protectMessage("c1", "m1", db.data("conversations/c1/messages/m1"));
  const m = db.data("conversations/c1/messages/m1");
  assert.equal(m.mediaUrl, undefined);
  assert.match(m.previewUrl, /^data:image/);
  assert.equal(db.data("mediaPrivate/m1").bunnyPath, "https://unlukt.b-cdn.net/x.jpg");
  await assert.rejects(media.getMedia("fan", { conversationId: "c1", messageId: "m1" }));
  assert.equal((await media.getMedia("cre", { conversationId: "c1", messageId: "m1" })).url, "https://unlukt.b-cdn.net/x.jpg");
});

test("signed urls: only files in the protected folder, and only when a Bunny token key is set", async () => {
  const priv = "https://unlukt.b-cdn.net/private/cre/1_a.jpg";
  assert.equal(media.signedUrl(priv), priv, "no key → unchanged");
  process.env.BUNNY_TOKEN_KEY = "k";
  assert.match(media.signedUrl(priv), /^https:\/\/unlukt\.b-cdn\.net\/private\/cre\/1_a\.jpg\?token=HS256-[\w-]+&expires=\d+$/);
  // an old token on the link is replaced, never stacked
  assert.equal((media.signedUrl(`${priv}?token=old&expires=1`).match(/token=/g) || []).length, 1);
  // public files (avatars, free posts, older uploads) keep their plain link
  assert.equal(media.signedUrl("https://unlukt.b-cdn.net/uploads/a.jpg"), "https://unlukt.b-cdn.net/uploads/a.jpg");
  delete process.env.BUNNY_TOKEN_KEY;
});

test("protected folder: stored bare, preview fetched with a signed link, viewers get expiring links", async () => {
  db.store.clear();
  process.env.BUNNY_TOKEN_KEY = "k";
  const realFetch = global.fetch;
  const fetched = [];
  global.fetch = async (u, o) => { fetched.push(String(u)); return realFetch(u, o); };
  try {
    const priv = "https://unlukt.b-cdn.net/private/cre/2_b.jpg";
    const r = await media.publishPost("cre", { post: { type: "paid", price: 4, images: [{ url: `${priv}?token=stale&expires=5` }] } });
    assert.equal(db.data(`mediaPrivate/post_${r.id}`).items[0].url, priv);
    assert.match(fetched[0], /\/private\/cre\/2_b\.jpg\?token=HS256-/);
    assert.ok(!JSON.stringify(db.data(`posts/${r.id}`)).includes("b-cdn.net"));
    const now = Math.floor(Date.now() / 1000);
    const got = (await media.getMedia("cre", { postId: r.id })).items[0].url;
    const exp = Number(new URL(got).searchParams.get("expires"));
    assert.ok(exp > now + 3000 && exp <= now + 3700, "link lasts about an hour");
    // creator makes the post free → public doc gets a working long-lived link, not a bare 403 one
    db.seed(`posts/${r.id}`, { ...db.data(`posts/${r.id}`), type: "free" });
    assert.equal(await media.protectPost(r.id, db.data(`posts/${r.id}`)), "restored");
    const freeUrl = db.data(`posts/${r.id}`).images[0].url;
    assert.ok(Number(new URL(freeUrl).searchParams.get("expires")) > now + 365 * 24 * 3600);
    // …and paid again → the public doc is clean and the private copy is bare again
    db.seed(`posts/${r.id}`, { ...db.data(`posts/${r.id}`), type: "paid" });
    assert.equal(await media.protectPost(r.id, db.data(`posts/${r.id}`)), "protected");
    assert.ok(!JSON.stringify(db.data(`posts/${r.id}`)).includes("b-cdn.net"));
    assert.equal(db.data(`mediaPrivate/post_${r.id}`).items[0].url, priv);
    // PPV message in the protected folder
    db.seed("conversations/c7", { participants: ["cre", "fan"] });
    const m = await media.sendPPV("cre", { conversationId: "c7", price: 3, mediaUrl: "https://unlukt.b-cdn.net/private/cre/3_c.jpg", mediaType: "image" });
    assert.match((await media.getMedia("cre", { conversationId: "c7", messageId: m.messageId })).url, /\?token=HS256-/);
  } finally {
    global.fetch = realFetch;
    delete process.env.BUNNY_TOKEN_KEY;
  }
});

test("publishPost: locked post never has the original URL in the public doc", async () => {
  db.store.clear();
  const r = await media.publishPost("cre", { post: { type: "paid", price: 4, content: "hi", images: [{ url: "https://unlukt.b-cdn.net/z.jpg" }, { url: "javascript:alert(1)" }] } });
  const pub = db.data(`posts/${r.id}`);
  assert.ok(!JSON.stringify(pub).includes("b-cdn.net"));
  assert.equal(pub.images.length, 1);
  assert.equal(pub.userId, "cre");
  assert.equal(db.data(`mediaPrivate/post_${r.id}`).items[0].url, "https://unlukt.b-cdn.net/z.jpg");
  await assert.rejects(media.publishPost("cre", { post: { type: "free", images: [] } }));
  await assert.rejects(media.publishPost("cre", { post: { type: "paid", price: 0 } }));
});

test("sendPPV: only participants; teaser public, rest private; outsiders can't fetch it", async () => {
  db.seed("conversations/c9", { participants: ["cre", "fan"] });
  await assert.rejects(media.sendPPV("intruder", { conversationId: "c9", content: "x" }));
  const r = await media.sendPPV("cre", { conversationId: "c9", content: "a long secret message here", price: 3, mediaUrl: "https://unlukt.b-cdn.net/s.jpg", mediaType: "image" });
  const m = db.data(`conversations/c9/messages/${r.messageId}`);
  assert.ok(!JSON.stringify(m).includes("b-cdn.net"));
  assert.ok(!m.content.includes("secret message here"));
  assert.equal(db.data(`mediaPrivate/${r.messageId}`).priceMinor, 300);
  await assert.rejects(media.getMedia("intruder", { conversationId: "c9", messageId: r.messageId }), /Not your/);
  await assert.rejects(media.getMedia("fan", { conversationId: "c9", messageId: r.messageId }), /Unlock/);
  const own = await media.getMedia("cre", { conversationId: "c9", messageId: r.messageId });
  assert.equal(own.content, "a long secret message here");
});

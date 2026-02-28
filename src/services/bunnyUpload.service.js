import { auth } from "../config/firebase";

/**
 * Upload media securely:
 * Frontend -> Firebase Function -> Bunny Storage -> returns CDN URL
 */
export async function uploadToBunny(file, { folder = "uploads", contentType = "media" } = {}) {
  if (!file) throw new Error("No file selected");

  const user = auth.currentUser;
  if (!user) throw new Error("Please login first");

  const token = await user.getIdToken();

  const endpoint = import.meta.env.VITE_UPLOAD_ENDPOINT;
  if (!endpoint) throw new Error("Missing VITE_UPLOAD_ENDPOINT in .env");

  const form = new FormData();
  form.append("file", file);
  form.append("folder", folder);
  form.append("contentType", contentType);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data?.success) {
    throw new Error(data?.error || "Upload failed");
  }

  // data.cdnUrl is what you store in Firestore
  return data; // { success, cdnUrl, objectPath, mimeType, size }
}

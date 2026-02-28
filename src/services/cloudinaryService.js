import { uploadToBunny } from "./bunnyUpload.service";

const cloudinaryService = {
  async uploadImage(file) {
    const res = await uploadToBunny(file, { folder: "images", contentType: "image" });
    return res.cdnUrl;
  },

  async uploadVideo(file) {
    const res = await uploadToBunny(file, { folder: "videos", contentType: "video" });
    return res.cdnUrl;
  },

  async uploadMedia(file) {
    const isVideo = file?.type?.startsWith("video/");
    const res = await uploadToBunny(file, {
      folder: isVideo ? "videos" : "images",
      contentType: isVideo ? "video" : "image",
    });
    return res.cdnUrl;
  }
};

export default cloudinaryService;

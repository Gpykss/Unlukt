const Avatar = ({ src, alt = "avatar", size = 48 }) => (
  <img src={src} alt={alt} style={{ width: size, height: size }} className="rounded-full" />
);

export default Avatar;

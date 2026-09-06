import { networkInterfaces } from "os";

function getLanIp() {
  for (const iface of Object.values(networkInterfaces())) {
    for (const info of iface) {
      if (info.family === "IPv4" && !info.internal) return info.address;
    }
  }
  return null;
}

const LAN_IP = getLanIp();
const devOrigins = ["localhost", "127.0.0.1", "aixia"];
if (LAN_IP) devOrigins.push(LAN_IP);

// Server-side only (never inlined into the browser bundle, unlike NEXT_PUBLIC_*),
// so this is read fresh from the environment every time the container starts —
// changing it never requires a rebuild. Defaults to the Docker Compose service
// name for the containerized setup; override for native (non-Docker) dev.
const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  allowedDevOrigins: devOrigins,
  // Next.js otherwise 308-redirects "/api/chat/stream/" to the slashless path
  // BEFORE the rewrite below runs. The browser re-POSTs to the slashless URL,
  // which gets proxied to Django, whose APPEND_SLASH cannot redirect a POST
  // without losing the body — so it raises and the chat request 500s. Django's
  // routes all end in a slash, so keep the path exactly as the client sent it.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    // The trailing slash on the destination is required, not cosmetic. Next
    // strips trailing slashes while matching, so ":path*" is always slashless;
    // every Django API route ends in a slash, and APPEND_SLASH cannot fix a
    // POST (it would have to drop the body), so it 500s instead. Re-add it here.
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*/` }];
  },
};

export default nextConfig;

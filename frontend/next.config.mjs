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

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  allowedDevOrigins: devOrigins,
};

export default nextConfig;

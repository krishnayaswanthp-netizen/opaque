import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.0.100"],
  experimental: {
    proxyClientMaxBodySize:
      process.env.METASHIELD_PROXY_MAX_BODY_SIZE || "512mb",
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    const backendBase = (
      process.env.METASHIELD_BACKEND_URL || "http://127.0.0.1:5000"
    ).replace(/\/$/, "")

    return [
      {
        source: "/backend/:path*",
        destination: `${backendBase}/:path*`,
      },
    ]
  },
}

export default nextConfig

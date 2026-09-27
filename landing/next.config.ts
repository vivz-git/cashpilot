import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static HTML export: the landing page has no server-side requirements
  // and can be hosted on any static host or CDN.
  output: "export",
  poweredByHeader: false,
};

export default nextConfig;

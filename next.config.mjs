const nextConfig = {
  outputFileTracingRoot: process.cwd(),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
  // Verification and recovery links contain single-use credentials.
  logging: {
    incomingRequests: { ignore: [/\/api\/auth\//, /\/redefinir-senha/] },
  },
};

export default nextConfig;

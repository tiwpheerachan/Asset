/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ['@shd/shared'],
  // ลดการใช้แรมตอน build ให้พอกับเครื่อง deploy แรมน้อย (เช่น Render free 512MB)
  // เหมือนที่ฝั่ง OA ตั้งไว้ — แลกความเร็ว build กับการ build ไม่ผ่านเพราะ OOM
  experimental: {
    webpackMemoryOptimizations: true,
    workerThreads: false,
    cpus: 1,
  },
};
export default nextConfig;

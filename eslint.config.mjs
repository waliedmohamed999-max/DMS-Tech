import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    ignores: [".next/**", "node_modules/**", "_prototype/**", "src/generated/**", ".local/**"]
  }
];

export default config;

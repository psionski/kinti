import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { INSTRUCTIONS } from "./instructions";

export function createMcpServer(): McpServer {
  return new McpServer(
    { name: "kinti", version: process.env.npm_package_version ?? "0.0.0" },
    { instructions: INSTRUCTIONS }
  );
}

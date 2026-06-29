const { createContext } = require("../src/server/http");
const { callMcpTool, listMcpTools } = require("../src/server/mcp/tools");

async function main() {
  const [, , toolName, rawArgs] = process.argv;
  if (!toolName || toolName === "list") {
    console.log(JSON.stringify({ tools: listMcpTools() }, null, 2));
    return;
  }

  const args = rawArgs ? JSON.parse(rawArgs) : {};
  const result = await callMcpTool(toolName, args, createContext());
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

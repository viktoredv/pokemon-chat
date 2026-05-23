import express, { Request, Response } from "express";
import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { experimental_createMCPClient } from "ai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

const MCP_SERVER_URL = "https://pokeapi-mcp-server-production.up.railway.app/mcp";

app.post("/api/chat", async (req: Request, res: Response) => {
  const { messages } = req.body;

  let mcpClient: Awaited<ReturnType<typeof experimental_createMCPClient>> | null = null;

  try {
    mcpClient = await experimental_createMCPClient({
      transport: new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL)),
    });

    const tools = await mcpClient.tools();

    const result = streamText({
      model: anthropic("claude-sonnet-4-5"),
      system:
        "You are PokéGuru, a friendly and enthusiastic Pokémon expert. " +
        "Use the available tools to answer questions about Pokémon accurately. " +
        "Keep answers concise and fun. Use the occasional Pokémon-related emoji.",
      messages,
      tools,
      maxSteps: 5,
      onFinish: async () => {
        await mcpClient?.close();
      },
    });

    result.pipeTextStreamToResponse(res);
  } catch (err) {
    console.error("Error:", err);
    await mcpClient?.close();
    res.status(500).json({ error: "Something went wrong." });
  }
});

const port = parseInt(process.env.PORT ?? "3000", 10);
app.listen(port, () => {
  console.log(`PokéGuru running on http://localhost:${port}`);
});

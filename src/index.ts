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

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    // Stream events — send a sentinel when a tool call starts so the
    // frontend can reset the bubble and show only the final answer.
    let stepCount = 0;
    for await (const part of result.fullStream) {
      if (part.type === "step-start") {
        // Every step after the first means a tool was called — reset the bubble
        if (stepCount > 0) res.write("\x1E");
        stepCount++;
      } else if (part.type === "text-delta") {
        res.write(part.textDelta);
      }
    }

    res.end();
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

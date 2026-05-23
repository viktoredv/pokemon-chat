import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MCP_SERVER_URL = "https://pokeapi-mcp-server-production.up.railway.app/mcp";

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system:
        "You are PokéGuru, a friendly and enthusiastic Pokémon expert. " +
        "Use the available tools to answer questions about Pokémon accurately. " +
        "Keep answers concise and fun. Use the occasional Pokémon-related emoji 🔴⚪.",
      messages,
      // @ts-expect-error — mcp_servers is a beta feature not yet in SDK types
      mcp_servers: [
        {
          type: "url",
          url: MCP_SERVER_URL,
          name: "pokeapi",
        },
      ],
    }, {
      headers: {
        "anthropic-beta": "mcp-client-2025-04-04",
      },
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error(err);
    res.write(`data: ${JSON.stringify({ error: "Something went wrong." })}\n\n`);
    res.end();
  }
});

const port = parseInt(process.env.PORT ?? "3000", 10);
app.listen(port, () => {
  console.log(`PokéGuru running on http://localhost:${port}`);
});

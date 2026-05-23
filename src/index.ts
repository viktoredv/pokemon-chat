import express, { Request, Response } from "express";
import { streamText, generateText } from "ai";
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

const SYSTEM_PROMPT = `You are PokéGuru, a super enthusiastic Pokémon expert for young fans aged 8–12!

Rules:
- Use simple, fun language kids can understand. Avoid jargon.
- Keep answers short and punchy. No walls of text.
- Be warm and encouraging: "Great question!", "Oh wow, cool pick!"
- When you mention a specific Pokémon, always include its Pokédex number like this: Pikachu [#25]. This is important.
- Use the available tools to give accurate info.
- Use fun Pokémon emojis occasionally ⚡🔥💧🌿`;

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
      system: SYSTEM_PROMPT,
      messages,
      tools,
      maxSteps: 5,
      onFinish: async () => {
        await mcpClient?.close();
      },
    });

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    let stepCount = 0;
    for await (const part of result.fullStream) {
      if (part.type === "step-start") {
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

// Contextual suggestion chips
app.post("/api/suggestions", async (req: Request, res: Response) => {
  const { messages } = req.body;

  try {
    const result = await generateText({
      model: anthropic("claude-sonnet-4-5"),
      system:
        "Based on this Pokémon conversation, suggest 3 short follow-up questions a kid (age 8–12) would love to ask next. " +
        "Return ONLY a valid JSON array of 3 strings. Max 7 words each. Make them fun and curious. " +
        'Example: ["What does Pikachu evolve into?", "Is Charizard a Dragon type?", "Who can beat Mewtwo?"]',
      messages,
      maxTokens: 120,
    });

    const raw = result.text.trim();
    const match = raw.match(/\[.*\]/s);
    const suggestions = match ? JSON.parse(match[0]) : [];
    res.json({ suggestions });
  } catch (err) {
    console.error("Suggestions error:", err);
    res.json({ suggestions: [] });
  }
});

const port = parseInt(process.env.PORT ?? "3000", 10);
app.listen(port, () => {
  console.log(`PokéGuru running on http://localhost:${port}`);
});

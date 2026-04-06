import Anthropic from "@anthropic-ai/sdk";
import { unlink } from "fs/promises";
import * as path from "path";
import type { LazyMemContext } from "./context";

export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type ChatEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_start"; name: string; id: string }
  | { type: "tool_result"; id: string; content: string; isError: boolean }
  | { type: "message_end" }
  | { type: "error"; message: string };

export type ToolExecutor = (tool: ToolUse) => Promise<string>;
export type ConfirmHandler = (tool: ToolUse) => Promise<boolean>;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_files",
    description: "List all files in the memory directory with their type and description.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "read_file",
    description: "Read the full content of a memory file by filename.",
    input_schema: {
      type: "object" as const,
      properties: {
        filename: { type: "string", description: "The .md filename (e.g. feedback_testing.md)" },
      },
      required: ["filename"],
    },
  },
  {
    name: "write_file",
    description:
      "Write content to a memory file (creates or overwrites). Use for adding new memories or updating existing ones. Requires user confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        filename: { type: "string", description: "The .md filename" },
        content: { type: "string", description: "Full file content including frontmatter" },
      },
      required: ["filename", "content"],
    },
  },
  {
    name: "delete_file",
    description:
      "Permanently delete a memory file. Requires user confirmation. Only call after explaining what will be deleted and why.",
    input_schema: {
      type: "object" as const,
      properties: {
        filename: { type: "string", description: "The .md filename to delete" },
      },
      required: ["filename"],
    },
  },
];

export function makeToolExecutor(ctx: LazyMemContext, onConfirm: ConfirmHandler): ToolExecutor {
  return async (tool: ToolUse): Promise<string> => {
    const { memoryDir, memoryFiles } = ctx;

    if (tool.name === "list_files") {
      if (memoryFiles.length === 0) return "No memory files found.";
      return memoryFiles
        .map(f => `${f.filename} [${f.type}]: ${f.description || f.name}`)
        .join("\n");
    }

    if (tool.name === "read_file") {
      const filename = String(tool.input["filename"] ?? "");
      try {
        const content = await Bun.file(path.join(memoryDir, filename)).text();
        return content;
      } catch {
        return `Error: could not read ${filename}`;
      }
    }

    if (tool.name === "write_file") {
      const filename = String(tool.input["filename"] ?? "");
      const content = String(tool.input["content"] ?? "");
      const confirmed = await onConfirm(tool);
      if (!confirmed) return "Write cancelled by user.";
      try {
        await Bun.write(path.join(memoryDir, filename), content);
        // refresh the in-memory file list entry
        const idx = ctx.memoryFiles.findIndex(f => f.filename === filename);
        if (idx >= 0) ctx.memoryFiles[idx].content = content;
        return `Written: ${filename}`;
      } catch (e: any) {
        return `Error writing ${filename}: ${e?.message ?? e}`;
      }
    }

    if (tool.name === "delete_file") {
      const filename = String(tool.input["filename"] ?? "");
      const confirmed = await onConfirm(tool);
      if (!confirmed) return "Delete cancelled by user.";
      try {
        await unlink(path.join(memoryDir, filename));
        // remove from in-memory list
        const idx = ctx.memoryFiles.findIndex(f => f.filename === filename);
        if (idx >= 0) ctx.memoryFiles.splice(idx, 1);
        return `Deleted: ${filename}`;
      } catch (e: any) {
        return `Error deleting ${filename}: ${e?.message ?? e}`;
      }
    }

    return `Unknown tool: ${tool.name}`;
  };
}

export class ChatSession {
  private client: Anthropic;
  private messages: Anthropic.MessageParam[] = [];
  private systemPrompt: string;

  constructor(systemPrompt: string) {
    this.systemPrompt = systemPrompt;
    this.client = new Anthropic();
  }

  async *send(userMessage: string, executor: ToolExecutor): AsyncGenerator<ChatEvent> {
    this.messages.push({ role: "user", content: userMessage });

    try {
      // Agent loop: keep going until end_turn (no more tool calls)
      while (true) {
        const stream = this.client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          system: this.systemPrompt,
          tools: TOOLS,
          messages: this.messages,
        });

        for await (const event of stream) {
          if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
            yield { type: "tool_start", name: event.content_block.name, id: event.content_block.id };
          } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            yield { type: "text_delta", text: event.delta.text };
          }
        }

        const final = await stream.finalMessage();
        this.messages.push({ role: "assistant", content: final.content });

        if (final.stop_reason === "end_turn") {
          yield { type: "message_end" };
          break;
        }

        if (final.stop_reason === "tool_use") {
          const results: Anthropic.ToolResultBlockParam[] = [];

          for (const block of final.content) {
            if (block.type !== "tool_use") continue;
            const toolUse: ToolUse = {
              id: block.id,
              name: block.name,
              input: block.input as Record<string, unknown>,
            };
            let content: string;
            let isError = false;
            try {
              content = await executor(toolUse);
            } catch (e: any) {
              content = `Error: ${e?.message ?? e}`;
              isError = true;
            }
            yield { type: "tool_result", id: block.id, content, isError };
            results.push({ type: "tool_result", tool_use_id: block.id, content });
          }

          this.messages.push({ role: "user", content: results });
          // loop: send results back to Claude
        }
      }
    } catch (e: any) {
      yield { type: "error", message: e?.message ?? String(e) };
    }
  }
}

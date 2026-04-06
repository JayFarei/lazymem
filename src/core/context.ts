import * as os from "os";
import * as path from "path";
import type { AuditData } from "./types";

export interface MemoryFile {
  filename: string;
  fullPath: string;
  type: "user" | "feedback" | "project" | "reference" | "unknown";
  name: string;
  description: string;
  content: string;
}

export interface LazyMemContext {
  auditData: AuditData;
  globalInstructions: string | null;
  memoryIndex: string | null;
  memoryFiles: MemoryFile[];
  memoryDir: string;
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: match[2].trim() };
}

export async function loadContext(auditData: AuditData): Promise<LazyMemContext> {
  const home = os.homedir();
  const key = process.cwd().replace(/\//g, "-");
  const memoryDir = path.join(home, ".claude", "projects", key, "memory");

  let globalInstructions: string | null = null;
  let memoryIndex: string | null = null;
  const memoryFiles: MemoryFile[] = [];

  try {
    const f = Bun.file(path.join(home, ".claude", "CLAUDE.md"));
    if (await f.exists()) globalInstructions = await f.text();
  } catch {}

  try {
    const f = Bun.file(path.join(memoryDir, "MEMORY.md"));
    if (await f.exists()) memoryIndex = await f.text();
  } catch {}

  try {
    const glob = new Bun.Glob("*.md");
    for await (const filename of glob.scan(memoryDir)) {
      if (filename === "MEMORY.md") continue;
      try {
        const filePath = path.join(memoryDir, filename);
        const raw = await Bun.file(filePath).text();
        const { meta, body } = parseFrontmatter(raw);
        memoryFiles.push({
          filename,
          fullPath: filePath,
          type: (meta["type"] as MemoryFile["type"]) || "unknown",
          name: meta["name"] || filename.replace(".md", ""),
          description: meta["description"] || "",
          content: body,
        });
      } catch {}
    }
  } catch {}

  return { auditData, globalInstructions, memoryIndex, memoryFiles, memoryDir };
}

function fmtMB(mb: number) {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${mb}M`;
}

export function buildSystemPrompt(ctx: LazyMemContext): string {
  const { auditData: d, memoryFiles, memoryDir } = ctx;

  const state = [
    `RAM: ${d.system.used} used, ${d.system.free} free`,
    `Claude: ${d.totalInstances} instances, ${fmtMB(d.totalClaudeMem)}`,
    ...d.sessions.map(s => `  ${s.name}: ${s.instances}x ${fmtMB(s.totalMem)} (${s.project})`),
    ...(d.anomalies.length
      ? [`Anomalies: ${d.anomalies.map(a => `[${a.severity}] ${a.text}`).join(", ")}`]
      : []),
  ].join("\n");

  const files = memoryFiles.length
    ? memoryFiles.map(f => `- ${f.filename} [${f.type}]: ${f.description || f.name}`).join("\n")
    : "(none)";

  return `You are the memory manager embedded in lazymem, a developer TUI for Claude AI agent monitoring.

## System State
${state}

## Memory Directory
${memoryDir}

## Memory Files
${files}

## Your Job
Help the user manage their Claude memory files: view, search, add, update, or delete them.
Use the read_file, write_file, delete_file, and list_files tools to interact with files.
Be concise and direct. For DELETE operations, always describe what will be deleted before calling delete_file.
For WRITE operations on existing files, show the proposed content before writing.
When writing memory files, preserve the frontmatter format (---\\nname: ...\\ndescription: ...\\ntype: ...\\n---\\n).`;
}

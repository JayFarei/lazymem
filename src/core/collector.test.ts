import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseColimaAlloc,
  parseDockerContainers,
  parseDockerVmActual,
  parseProcessesOutput,
  parseSystemInfo,
  parseTmuxPanesOutput,
  parseTopProcsOutput,
} from "./collector";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "collector");

function fixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

describe("collector parsers", () => {
  test("parseSystemInfo parses vm_stat, memsize, and swap usage fixtures", () => {
    const system = parseSystemInfo(
      fixture("vm_stat.txt"),
      fixture("memsize.txt"),
      fixture("swapusage.txt"),
    );

    expect(system).toEqual({
      totalMB: 16384,
      appMB: 184,
      wiredMB: 32,
      compMB: 16,
      cachedMB: 128,
      freeMB: 48,
      usedMB: 232,
      swap: {
        total: "3.00G",
        used: "1.25G",
        free: "1.75G",
      },
    });
  });

  test("parseTopProcsOutput derives names, memory strings, and sorts by memory", () => {
    const topProcs = parseTopProcsOutput(fixture("ps_top_procs.txt"));

    expect(topProcs).toHaveLength(3);
    expect(topProcs.map((proc) => proc.cmd)).toEqual(["python3", "Slack", "node"]);
    expect(topProcs.map((proc) => proc.memMB)).toEqual([2048, 1024, 500]);
    expect(topProcs.map((proc) => proc.mem)).toEqual(["2.0G", "1.0G", "500M"]);
  });

  test("parseTmuxPanesOutput parses pane rows", () => {
    expect(parseTmuxPanesOutput(fixture("tmux_list_panes.txt"))).toEqual([
      {
        session: "work",
        pane: "0.0",
        tty: "/dev/ttys001",
        cmd: "zsh",
        path: "/Users/me/project",
      },
      {
        session: "pair",
        pane: "1.2",
        tty: "/dev/ttys003",
        cmd: "bun",
        path: "/Users/me/another",
      },
    ]);
  });

  test("parseProcessesOutput filters to interesting processes and truncates args", () => {
    const processes = parseProcessesOutput(fixture("ps_processes.txt"));

    expect(processes).toHaveLength(3);
    expect(processes.map((proc) => proc.cmd)).toEqual(["claude", "node", "bun"]);
    expect(processes.map((proc) => proc.mem)).toEqual([500, 250, 63]);
    expect(processes[2].args.length).toBe(120);
  });

  test("parseDockerContainers joins docker stats and docker ps fixtures", () => {
    expect(parseDockerContainers(
      fixture("docker_stats.txt"),
      fixture("docker_ps.txt"),
    )).toEqual([
      {
        name: "api",
        mem: "512MiB / 8GiB",
        cpu: "23.4%",
        image: "ghcr.io/acme/api:latest",
      },
      {
        name: "db",
        mem: "1.25GiB / 8GiB",
        cpu: "101.2%",
        image: "postgres:16",
      },
    ]);
  });

  test("parseColimaAlloc extracts the allocated memory column", () => {
    expect(parseColimaAlloc(fixture("colima_list.txt"))).toBe("8GiB");
  });

  test("parseDockerVmActual extracts the virtualization process rss in MB", () => {
    expect(parseDockerVmActual(fixture("ps_vm.txt"))).toBe(1024);
  });
});

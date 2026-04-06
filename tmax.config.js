module.exports = {
  title: "lazymem dev",
  panes: [
    {
      label: "TUI",
      command: "bun run dev",
    },
    {
      label: "shell",
      command: "bun --version && exec $SHELL",
    },
  ],
};

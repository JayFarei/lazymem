import { createSignal, onCleanup } from "solid-js";

const LOGO = [
  " _                    __  __                ",
  "| |    __ _ _____   _|  \\/  | ___ _ __ ___  ",
  "| |   / _` |_  / | | | |\\/| |/ _ \\ '_ ` _ \\ ",
  "| |__| (_| |/ /| |_| | |  | |  __/ | | | | |",
  "|_____\\__,_/___|\\__, |_|  |_|\\___|_| |_| |_|",
  "                |___/                        ",
];

const SPINNER = ["   ", ".  ", ".. ", "..."];

export function LoadingSplash() {
  const [frame, setFrame] = createSignal(0);

  const timer = setInterval(() => setFrame(f => f + 1), 300);
  onCleanup(() => clearInterval(timer));

  const spinText = () => `collecting${SPINNER[frame() % SPINNER.length]}`;

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
    >
      {LOGO.map(line => (
        <box height={1}>
          <text fg="#58a6ff">{line}</text>
        </box>
      ))}
      <box height={1} marginTop={2}>
        <text fg="#4d5566">{spinText()}</text>
      </box>
    </box>
  );
}

// A slash command the server offers, e.g. /improve
export interface CommandInfo {
  name: string;
  description: string;
  usage: string;
}

// What the server answers when a slash command was run
export interface CommandResult {
  command: string;
  title: string;
  text: string;
  suggestions: string[]; // short replies the user can click
  use_text: string | null; // text that can be put into the message box
  provider: string; // 'mock' = offline demo, otherwise the AI service name
}
/**
 * Tool: play_dora_dash
 *
 * Launches the Dora Dash mini-game widget when the user wants to play.
 */

import { registerTool } from '../toolRegistry.js';
import type { Tool } from '../types.js';

const doraDashTool: Tool = {
  name: 'play_dora_dash',
  category: 'fun',

  description: `Launches the Dora Dash mini-game — a 2D dodging game where the player controls the Messign pilot plane and avoids falling bugs.

Use this tool when someone:
- Says "I'm bored" or wants to have fun
- Types "/play" or "/game"
- Asks to play a game or play Dora Dash
- Wants a break or wants to do something fun`,

  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },

  execute: async () => ({
    success: true,
    data: { gameReady: true },
    summary: 'Launching Dora Dash mini-game!',
  }),
};

registerTool(doraDashTool);

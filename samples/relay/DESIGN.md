# Relay visual system — Impeccable Operate mode

## Design direction
**The quiet workbench.** A native feeling macOS writing environment: soft paper neutrals, purposeful cobalt ink, balanced editorial typography, clean side rails, and a precise blue action cue. Calm, trustworthy, restrained and recognizably independent from ChatGPT.

## Palette (light default)
- Canvas: #F7F8F6; sidebar: #EFF1EE; raised surface: #FFFFFF
- Primary text: #1F292F; muted: #657279; faint: #879397
- Lines: #DDE3E0; elevated-line: #D3DBD7
- Primary cobalt: #355DDD; primary hover #264BC7; pale selection: #E6EDFF
- Success #168566; danger #C74B4D; warning #A67326

## Dark palette
- Canvas #131B21; sidebar #192329; surface #1E2A31
- Primary text #EDF1F2; muted #ACB9BE; lines #32434A
- Cobalt #8CA8FF; selection #273F6E; success #75D4B5; danger #F0A2A5

## Typography
Use system UI sans in navigational controls (-apple-system, BlinkMacSystemFont); reading copy uses consistent 15px/1.65 with max width 46rem. Stable tabular numerals for status. Titles subtly tracked (-.025em), never cramped.

## Layout
Three regions visually, two columns structurally: 274px sidebar with integrated toolbar and conversation search; fluid conversation workspace (max 800px reading measure) with anchored composer bottom. Titlebar region follows macOS draggable strip. On narrow windows, collapse sidebar behind toggle with overlay.

## Interaction
- Compose Enter sends, Shift+Enter line break. Cmd+N new chat, Cmd+K filter chats, Cmd+R reload list.
- Chat statuses: idle, sending, loading, disconnected, upstream failure. Never fake streaming.
- Context menu for rename/archive/delete. Dangerous action needs confirmation.
- Lightweight press feedback and animated dots only for in-flight response; honor reduced motion.
- Mouse, keyboard and VoiceOver accessible focus/focus-visible outlines, icon names and labels.

## Craft boundaries
No gradient text, dashboard KPI templates, oversized shadow cards, unnecessary emoji or app-website chrome. Use lucide icons only as meaningful controls, no decorative illustration prerequisite. Empty state should feel actionable, not blank.

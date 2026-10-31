# Vaani AI: Your AI Assistant in English, Hindi & Marathi

Vaani AI is a lightweight, multilingual chatbot web app. The interface is plain HTML, CSS and JavaScript (no build step), and the answers come from an [n8n](https://n8n.io) workflow that you control. You can connect any chat model that n8n supports, such as Anthropic, Google Gemini or OpenAI.

> "Vaani" (वाणी) means voice or speech in Hindi and Marathi.

## Features

- **Three interface languages:** English, हिन्दी and मराठी, switchable at any time
- **Four modes:** Daily Helper, Study Assistant, India Knowledge and Translate
- **Streaming replies** from n8n, with an automatic fallback to normal replies
- **Markdown rendering:** headings, lists, code blocks and tables
- **Message actions:** copy, regenerate, and "explain simply in Hindi / Marathi"
- **Chat history** with a sidebar, saved in the browser (localStorage)
- **Voice input** using the browser's Web Speech API (works in Chrome and Edge)
- **Text file attach:** `.txt`, `.md`, `.csv`, `.json`, `.py`, `.js`, `.html` up to 200 KB
- **Light and dark themes**, and a responsive layout for phones and desktops
- **Demo mode**, clearly labelled, for running without any AI backend

## Project structure

```
vaani-ai/
├── index.html    # page structure
├── style.css     # all styling
├── script.js     # chat logic, i18n, markdown, n8n client
├── config.js     # your webhook URL and settings
└── README.md
```

## Quick start

1. **Clone the repo**
   ```bash
   git clone https://github.com/<your-username>/vaani-ai.git
   cd vaani-ai
   ```
2. **Set your n8n URL** in `config.js`:
   ```js
   window.APP_CONFIG = {
     WEBHOOK_URL: "https://YOUR-N8N-HOST/webhook/YOUR-ID/chat",
     SEND_MODE_HINT: false,
     TIMEOUT_MS: 60000
   };
   ```
3. **Run locally**
   ```bash
   python3 -m http.server 8080
   ```
   Open http://localhost:8080.

### Configuration

| Option | Description |
|---|---|
| `WEBHOOK_URL` | The Production URL of your n8n Chat Trigger. Leave it as `""` to run in demo mode. |
| `SEND_MODE_HINT` | `true` sends the selected mode and language as hidden instructions with each message. `false` sends plain text only. |
| `TIMEOUT_MS` | How long to wait for a reply before showing a timeout message. |

## n8n setup

1. Create a workflow with these nodes: **Chat Trigger → AI Agent**, with a **Chat Model** and **Simple Memory** attached to the agent.
2. In the Chat Trigger, turn on **Make Chat Publicly Available** and add your site URL under **Allowed Origins** (no trailing slash).
3. Pick your chat model and add its API key in n8n's credentials. The key stays in n8n and is never in this repo.
4. Set the Simple Memory session ID to come from the previous node, so each chat keeps its own context.
5. **Save and Publish** the workflow, then copy the **Production URL** (it ends in `/chat`) into `config.js`.

The site sends this request:

```json
POST <WEBHOOK_URL>
{ "action": "sendMessage", "sessionId": "<chat id>", "chatInput": "<message>" }
```

It understands both streamed responses (`{"type":"item","content":"..."}` lines) and plain `{ "output": "..." }` replies.

## Deploy

**Netlify:** drag the project folder onto [app.netlify.com/drop](https://app.netlify.com/drop). Then add the live URL to Allowed Origins in n8n and publish again.

**Vercel or GitHub Pages:** upload the files as a static site. No build command is needed.

## Troubleshooting

| Problem | Likely cause and fix |
|---|---|
| "Server returned 500" | Check n8n **Executions** for the failed run and read the error on the red node. |
| 429 / quota exceeded in n8n | The model provider's rate limit or free quota is used up. Wait, switch to a different model, or check your plan. |
| "Can't reach the server" | CORS or network problem. Check Allowed Origins and that the workflow is published. |
| Unstyled page after deploy | Not all four files were uploaded. Deploy the whole folder. |
| Replies don't follow the selected mode | Set `SEND_MODE_HINT: true` in `config.js`. |

## Security notes

- Never put API keys in this repo or in client-side code. Keep them in n8n credentials.
- The webhook URL is visible to anyone who opens the site. Add rate limiting and a spend limit on your model provider.
- Chat history is stored only in each visitor's browser.
- For a public repo, consider committing a `config.js` with a placeholder URL instead of your real webhook.

## Limitations

- No user accounts, and no server-side chat history yet.
- Attachments are limited to small text files. Photos and PDFs are not supported.
- Voice input depends on browser support.

## Roadmap

- Photo and PDF upload
- Server-side chat history (Supabase or a database)
- Login
- A WhatsApp or Telegram version using the same n8n agent

# @kudagon/azureai-client  
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

A lightweight, fully-typed TypeScript client for the **Azure OpenAI Chat/Assistants API**, designed for Node.js.  
Supports file uploads, conversation state management, and response persistence.  

---

## ✨ Features
- 📘 Full TypeScript support with IntelliSense  
- 🌐 Works on **Node 16+** (`undici` polyfill) and **Node 18+** (native `fetch/FormData/Blob`)  
- 📂 File upload + cleanup helpers  
- 💬 Conversation management (messages, assistants, threads)  
- 💾 Save responses to JSON or text  
- 🔍 Convenient helpers for raw and plain text responses  

---

## 📦 Installation

```bash
npm install @kudagon/azureai-client
````

---

## 🚀 Quick Start

```ts
import KudagonAzureAIClient from "@kudagon/azureai-client";

const client = new KudagonAzureAIClient({
  endpoint: process.env.AZURE_OPENAI_ENDPOINT!,   // e.g. https://my-resource.openai.azure.com
  apiKey: process.env.AZURE_OPENAI_KEY!,
  deploymentName: "gpt-4o-mini",                 // your deployment name
  apiVersion: "2024-08-01-preview",              // optional, defaults provided
});

// Add conversation messages
await client.add_message({ role: "system", content: "You are a helpful assistant." });
await client.add_message({ role: "user", content: "Tell me a joke about Nigerian economy." });

// Run the request
await client.fetch();

// Get just the assistant’s reply string
console.log(client.response());

// Or inspect the full raw JSON response
console.log(client.raw_response());

// Save to disk
await client.save_response({ file_name: "output.json" });
```

---

## ⚙️ API Reference

### `new KudagonAzureAIClient(config: AzureAIConfig)`

Create a new client instance.

**Config options:**

* `endpoint: string` – Azure OpenAI endpoint (no trailing slash)
* `apiKey: string` – API key from Azure
* `deploymentName: string` – Model deployment name
* `apiVersion?: string` – Defaults to `2024-08-01-preview`
* `timeout?: number` – Default `30000ms`
* `initMsg?: string` – Default system prompt

---

### Core Methods

#### `add_message(message: Message | Message[])`

Add one or more chat messages (`role: "user" | "assistant" | "system"`).

#### `add_file(fileConfig: FileConfig)`

Attach a file from disk (`file_path`) or raw content (`raw_file` + `file_name`).

#### `set_options(options: GenerationOptions)`

Override generation parameters (e.g., `max_tokens`, `temperature`, `top_p`).

#### `fetch(): Promise<void>`

Runs completion with the current state.
Uploads files, creates/uses assistant + thread, and stores the last response.

#### `response(): string`

Returns **just the assistant’s latest reply** (string).
Throws if no response is available.

#### `raw_response(): CompletionResponse`

Returns the **full structured JSON response** from Azure.
Includes choices, token usage, finish reasons, etc.

#### `save_response({ file_name, file_type }): Promise<void>`

Persist the last response as `.json` or `.txt`.

#### `get_state()`

Inspect current conversation state (messages, files, options, assistant/thread IDs).

#### `clear()`

Reset messages, files, assistant, and thread state.

---

### File Management

* `list_files()` – List uploaded files
* `delete_file(fileId)` – Delete a file by ID

### Assistant Management

* `delete_assistant()` – Delete the current assistant

---

## 🛠️ Development

Clone and install:

```bash
git clone https://github.com/kudagon/azureai-client.git
cd kudagon-azureai-client
npm install
```

Build:

```bash
npm run build
```

---

## 📖 Example with dotenv

```ts
import { config } from "dotenv";
import KudagonAzureAIClient from "@kudagon/azureai-client";

config(); // Load .env variables

const client = new KudagonAzureAIClient({
  apiKey: process.env.AZURE_OPENAI_KEY!,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
  deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT!,
  apiVersion: process.env.API_VERSION!,
});

(async () => {
  await client.add_message({ role: "system", content: "You are a Nigerian comedian." });
  await client.add_message({ role: "user", content: "Give me a quick joke about Lagos traffic." });

  await client.fetch();

  console.log("Assistant:", client.response());
})();
```

---

## 📜 License

MIT © [Kudagon](https://github.com/Kudagon)
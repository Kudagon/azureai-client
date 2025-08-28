# @kudagon/azureai-client
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

A lightweight TypeScript client for the **Azure OpenAI Assistants API**, supporting file uploads, conversation threads, and response persistence.  

---

## ✨ Features
- Full TypeScript support with IntelliSense  
- Works on **Node 16 (via undici)** and **Node 18+ (native fetch/FormData/Blob)**  
- File upload + cleanup helpers  
- Conversation management (messages, assistants, threads)  
- Save responses to JSON or text files  

---

## 📦 Installation

```bash
npm install @kudagon/azureai-client
````

---

## 🚀 Usage

```ts
import KudagonAzureAIClient from "@kudagon/azureai-client";

const client = new KudagonAzureAIClient({
  endpoint: process.env.AZURE_OPENAI_ENDPOINT!,   // e.g. https://my-resource.openai.azure.com
  apiKey: process.env.AZURE_OPENAI_KEY!,
  deploymentName: "gpt-4o-mini",                 // your deployment name
  apiVersion: "2024-08-01-preview",              // optional, defaults provided
});

// Add messages
client.add_message({ role: "system", content: "You are a helpful assistant." });
client.add_message({ role: "user", content: "Analyze this dataset." });

// Optionally attach files
client.add_file({ file_path: "./data.json", file_type: "json" });

// Run the request
await client.fetch();

// Save the response to a file
await client.save_response({ file_name: "response.json" });

// Inspect current state
console.log(client.get_state());

// Clear conversation if needed
client.clear();
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

* **`add_message(message: Message | Message[])`**
  Add one or more messages (`role: "user" | "assistant" | "system"`).

* **`add_file(fileConfig: FileConfig)`**
  Attach a file from disk or raw content (`file_path` or `raw_file` + `file_name`).

* **`set_options(options: GenerationOptions)`**
  Override generation parameters (max\_tokens, temperature, top\_p).

* **`fetch()`**
  Uploads files, creates/uses assistant + thread, runs completion, stores last response.

* **`save_response({ file_name, file_type })`**
  Save last response as `json` or `text`.

* **`get_state()`**
  Get current conversation state (messages, files, options, assistant/thread IDs).

* **`clear()`**
  Reset messages, files, assistant, and thread.

* **File management:**

  * `list_files()` – List uploaded files
  * `delete_file(fileId)` – Delete a file by ID

* **Assistant management:**

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
// src/index.ts
import { existsSync, readFileSync, writeFileSync } from "fs";
import { extname, basename } from "path";
import * as undici from "undici"; // imported as module to access named + default exports

/**
 * Ensure fetch/FormData/Blob work in Node18+ (globals) or Node16 (undici)
 */
const _fetch: typeof globalThis.fetch =
  (globalThis as any).fetch ?? (undici as any).fetch;

const _FormData: typeof FormData =
  (globalThis as any).FormData ?? (undici as any).FormData;

/**
 * Blob can be provided as a global or the default export of undici.
 * Its constructor signature can vary; use `any` for the constructor type to avoid
 * overly strict typing problems across environments.
 */
const _Blob: any =
  (globalThis as any).Blob ?? (undici as any).default ?? (undici as any).Blob;

/**
 * Types / interfaces
 */
export interface AzureAIConfig {
  endpoint: string;
  apiKey: string;
  deploymentName: string;
  apiVersion?: string;
  timeout?: number;
  initMsg?: string;
}

export type FileType = "json" | "text";

export interface FileConfig {
  file_path?: string;
  raw_file?: string | object;
  file_name?: string;
  file_type?: FileType;
}

export type Role = "user" | "assistant" | "system";
export interface Message {
  role: Role;
  content: string;
}

export interface GenerationOptions {
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
}

export interface SaveResponseConfig {
  file_name: string;
  file_type?: "json" | "text";
}

export interface ConversationState {
  messages: Message[];
  files: { path: string; type: FileType }[];
  options: GenerationOptions;
  assistantId: string | null;
  threadId: string | null;
}

interface InternalFile {
  path: string;
  type: FileType;
  content: any;
  rawContent: any;
}

interface UploadedFile {
  id: string;
  path: string;
  type: FileType;
}

interface CompletionChoice {
  index: number;
  message: {
    role: Role;
    content: string;
  };
  finish_reason: string;
}
interface CompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: CompletionChoice[];
}

/**
 * Kudagon Azure AI Client (TypeScript)
 */
export class KudagonAzureAIClient {
  endpoint: string;
  apiKey: string;
  deploymentName: string;
  apiVersion: string;
  timeout: number;

  messages: Message[] = [];
  files: InternalFile[] = [];
  options: GenerationOptions = { max_tokens: 4000, temperature: 0.7 };

  assistantId: string | null = null;
  threadId: string | null = null;
  initMsg: string;

  private _lastResponse?: CompletionResponse;

  constructor(config: AzureAIConfig) {
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.deploymentName = config.deploymentName;
    this.apiVersion = config.apiVersion || "2024-08-01-preview";
    this.timeout = config.timeout ?? 30000;
    this.initMsg = config.initMsg || "You are a helpful assistant.";

    this._validateConfig();
  }

  private _validateConfig(): void {
    if (!this.endpoint) throw new Error("Endpoint is required");
    if (!this.apiKey) throw new Error("API key is required");
    if (!this.deploymentName) throw new Error("Deployment name is required");
    this.endpoint = this.endpoint.replace(/\/$/, "");
  }

  add_file(fileConfig: FileConfig): this {
    let pathStr: string;
    let type: FileType;
    let rawContent: any;
    let content: any;

    if (fileConfig.raw_file) {
      if (!fileConfig.file_name)
        throw new Error("file_name is required when using raw_file");
      pathStr = fileConfig.file_name;
      rawContent = fileConfig.raw_file;
      type = (fileConfig.file_type || "text") as FileType;
    } else if (fileConfig.file_path) {
      pathStr = fileConfig.file_path;
      if (!existsSync(pathStr)) throw new Error(`File not found: ${pathStr}`);
      rawContent = readFileSync(pathStr, "utf8");
      type = (fileConfig.file_type ||
        (() => {
          const ext = extname(pathStr).toLowerCase();
          switch (ext) {
            case ".json":
              return "json";
            case ".txt":
              return "text";
            default:
              return "text";
          }
        })()) as FileType;
    } else {
      throw new Error("Either raw_file or file_path must be provided");
    }

    switch (type) {
      case "json":
        try {
          content =
            typeof rawContent === "string"
              ? JSON.parse(rawContent)
              : rawContent;
        } catch (parseError: any) {
          throw new Error(`Invalid JSON content: ${parseError.message}`);
        }
        break;
      case "text":
        content = rawContent;
        break;
      default:
        content = rawContent;
    }

    this.files.push({ path: pathStr, type, content, rawContent });
    return this;
  }

  add_message(messages: Message | Message[]): this {
    const messageArray = Array.isArray(messages) ? messages : [messages];
    for (const message of messageArray) {
      if (!message.role || !message.content)
        throw new Error("Each message must have role and content properties");
      if (!["user", "assistant", "system"].includes(message.role))
        throw new Error("Message role must be user, assistant, or system");
      this.messages.push(message);
    }
    return this;
  }

  set_options(options: GenerationOptions): this {
    this.options = { ...this.options, ...options };
    return this;
  }

  private async _uploadFiles(): Promise<UploadedFile[]> {
    const uploadedFiles: UploadedFile[] = [];

    for (const file of this.files) {
      try {
        const formData = new _FormData();
        const contentStr =
          file.type === "json"
            ? typeof file.content === "string"
              ? file.content
              : JSON.stringify(file.content, null, 2)
            : typeof file.rawContent === "string"
            ? file.rawContent
            : String(file.rawContent);

        const fileBlob = new _Blob([contentStr], {
          type: file.type === "json" ? "application/json" : "text/plain",
        });

        formData.append("file", fileBlob as any, basename(file.path));
        formData.append("purpose", "assistants");

        const uploadUrl = `${this.endpoint}/openai/files?api-version=${this.apiVersion}`;

        const response = await _fetch(uploadUrl, {
          method: "POST",
          headers: {
            "api-key": this.apiKey,
          },
          body: formData as any,
        } as any);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `File upload failed (${response.status}): ${errorText}`
          );
        }

        const fileData = await response.json();
        uploadedFiles.push({
          id: fileData.id,
          path: file.path,
          type: file.type,
        });
      } catch (error: any) {
        throw error;
      }
    }

    return uploadedFiles;
  }

  private async _getOrCreateAssistant(): Promise<string | null> {
    if (this.assistantId) return this.assistantId;

    try {
      const systemMessage = this.messages.find((m) => m.role === "system");
      const instructions = systemMessage
        ? systemMessage.content
        : "You are a helpful assistant that can analyze files and answer questions.";

      const assistantUrl = `${this.endpoint}/openai/assistants?api-version=${this.apiVersion}`;

      const assistantRequest = {
        model: this.deploymentName,
        name: "File Analysis Assistant",
        instructions,
        tools: [{ type: "code_interpreter" }],
        temperature: this.options.temperature,
      };

      const response = await _fetch(assistantUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": this.apiKey,
        },
        body: JSON.stringify(assistantRequest),
      } as any);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Assistant creation failed (${response.status}): ${errorText}`
        );
      }

      const assistant = await response.json();
      this.assistantId = assistant.id;
      return this.assistantId;
    } catch (error) {
      throw error;
    }
  }

  private async _getOrCreateThread(
    uploadedFiles: UploadedFile[] = []
  ): Promise<string | null> {
    if (this.threadId) return this.threadId;

    try {
      const threadUrl = `${this.endpoint}/openai/threads?api-version=${this.apiVersion}`;

      const threadMessages = this.messages
        .filter((msg) => msg.role !== "system")
        .map((msg, idx) => {
          const message: any = { role: msg.role, content: msg.content };
          if (
            msg.role === "user" &&
            uploadedFiles.length > 0 &&
            msg === this.messages.find((m) => m.role === "user")
          ) {
            message.attachments = uploadedFiles.map((file) => ({
              file_id: file.id,
              tools: [{ type: "code_interpreter" }],
            }));
          }
          return message;
        });

      const threadRequest = { messages: threadMessages };

      const response = await _fetch(threadUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": this.apiKey,
        },
        body: JSON.stringify(threadRequest),
      } as any);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Thread creation failed (${response.status}): ${errorText}`
        );
      }

      const thread = await response.json();
      this.threadId = thread.id;
      return this.threadId;
    } catch (error) {
      throw error;
    }
  }

  private async _runAssistant(): Promise<any> {
    try {
      const runUrl = `${this.endpoint}/openai/threads/${this.threadId}/runs?api-version=${this.apiVersion}`;
      const runRequest = { assistant_id: this.assistantId };

      const response = await _fetch(runUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": this.apiKey,
        },
        body: JSON.stringify(runRequest),
      } as any);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Run creation failed (${response.status}): ${errorText}`
        );
      }

      const run = await response.json();
      return await this._waitForRunCompletion(run.id);
    } catch (error) {
      throw error;
    }
  }

  private async _waitForRunCompletion(runId: string): Promise<any> {
    const maxAttempts = 60;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const statusUrl = `${this.endpoint}/openai/threads/${this.threadId}/runs/${runId}?api-version=${this.apiVersion}`;
        const response = await _fetch(statusUrl, {
          headers: { "api-key": this.apiKey },
        } as any);

        if (!response.ok) {
          throw new Error(`Status check failed: ${response.statusText}`);
        }

        const run = await response.json();

        if (run.status === "completed") {
          return run;
        } else if (["failed", "cancelled", "expired"].includes(run.status)) {
          throw new Error(
            `Run ${run.status}: ${run.last_error?.message || "Unknown error"}`
          );
        }

        await new Promise((resolve) => setTimeout(resolve, 5000));
        attempts++;
      } catch (error) {
        throw error;
      }
    }

    throw new Error("Run timed out after 5 minutes");
  }

  private async _getMessages(): Promise<any> {
    try {
      const messagesUrl = `${this.endpoint}/openai/threads/${this.threadId}/messages?api-version=${this.apiVersion}&limit=1`;
      const response = await _fetch(messagesUrl, {
        headers: { "api-key": this.apiKey },
      } as any);

      if (!response.ok) {
        throw new Error(`Failed to get messages: ${response.statusText}`);
      }

      const messages = await response.json();
      return messages.data?.[0];
    } catch (error) {
      throw error;
    }
  }

  async fetch(): Promise<this> {
    try {
      if (this.messages.length === 0 && this.files.length === 0) {
        throw new Error(
          "No messages or files to send. Use add_message() or add_file() first."
        );
      }

      let uploadedFiles: UploadedFile[] = [];
      if (this.files.length > 0) {
        uploadedFiles = await this._uploadFiles();
      }

      await this._getOrCreateAssistant();
      await this._getOrCreateThread(uploadedFiles);

      const run = await this._runAssistant();
      const responseMessage = await this._getMessages();

      const contentValue =
        responseMessage?.content?.[0]?.text?.value ??
        responseMessage?.content ??
        "";

      const formattedResponse = {
        id: run.id,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: this.deploymentName,
        choices: [
          {
            index: 0,
            message: {
              role: responseMessage?.role ?? "assistant",
              content: contentValue,
            },
            finish_reason: "stop",
          },
        ],
      };

      this._lastResponse = formattedResponse;

      if (uploadedFiles.length > 0) {
        uploadedFiles.forEach((f) => {
          this.delete_file(f.id).catch(() => {
            /* ignore cleanup errors */
          });
        });
      }

      return this;
    } catch (error: any) {
      if (error.name === "AbortError") {
        throw new Error(
          `Request timeout after ${this.timeout}ms. Try increasing the timeout or check your connection.`
        );
      }
      throw error;
    }
  }

  async save_response({
    file_name,
    file_type = "json",
  }: SaveResponseConfig): Promise<this> {
    if (!file_name)
      throw new Error("file_name is required to save the response");
    if (!this._lastResponse)
      throw new Error(
        "No response available. Call fetch() first to get a response."
      );

    try {
      let dataToWrite: string;

      switch (file_type.toLowerCase()) {
        case "json": {
          let content = this._lastResponse.choices[0].message.content;
          if (typeof content === "string") {
            try {
              content = JSON.parse(content);
            } catch {
              // keep as string
            }
          }
          dataToWrite = JSON.stringify(content, null, 2);
          break;
        }
        case "text":
          dataToWrite = this._lastResponse.choices
            .map((c: any) => c.message.content)
            .join("\n\n");
          break;
        default:
          dataToWrite =
            typeof this._lastResponse === "string"
              ? this._lastResponse
              : JSON.stringify(this._lastResponse);
      }

      writeFileSync(file_name, dataToWrite, "utf8");
      return this;
    } catch (error) {
      throw error;
    }
  }

  clear(): this {
    this.messages = [];
    this.files = [];
    this.assistantId = null;
    this.threadId = null;
    return this;
  }

  get_state(): ConversationState {
    return {
      messages: this.messages,
      files: this.files.map((f) => ({ path: f.path, type: f.type })),
      options: this.options,
      assistantId: this.assistantId,
      threadId: this.threadId,
    };
  }

  async delete_file(fileId: string): Promise<any> {
    try {
      const deleteUrl = `${this.endpoint}/openai/files/${fileId}?api-version=${this.apiVersion}`;
      const response = await _fetch(deleteUrl, {
        method: "DELETE",
        headers: { "api-key": this.apiKey },
      } as any);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `File deletion failed (${response.status}): ${errorText}`
        );
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  }

  async delete_assistant(): Promise<void> {
    if (!this.assistantId) return;

    try {
      const deleteUrl = `${this.endpoint}/openai/assistants/${this.assistantId}?api-version=${this.apiVersion}`;
      const response = await _fetch(deleteUrl, {
        method: "DELETE",
        headers: { "api-key": this.apiKey },
      } as any);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Assistant deletion failed (${response.status}): ${errorText}`
        );
      }

      this.assistantId = null;
      this.threadId = null;
    } catch (error) {
      throw error;
    }
  }

  async list_files(): Promise<any> {
    try {
      const listUrl = `${this.endpoint}/openai/files?api-version=${this.apiVersion}`;
      const response = await _fetch(listUrl, {
        method: "GET",
        headers: { "api-key": this.apiKey },
      } as any);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to list files (${response.status}): ${errorText}`
        );
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Returns the **entire raw response object** from the last API call.
   *
   * Useful if you need access to metadata like usage, tokens,
   * role, or multiple choices returned by the model.
   *
   * @throws {Error} If no response is available (call `fetch()` first).
   * @returns {any} The raw response object returned by the Azure AI API.
   */
  raw_response(): CompletionResponse {
    if (!this._lastResponse) {
      throw new Error("No response available. Call fetch() first.");
    }
    return this._lastResponse;
  }

  /**
   * Returns only the **assistant's reply text** from the last API call.
   *
   * This is a convenience method for quickly grabbing the generated text,
   * without parsing the full raw response object.
   *
   * @throws {Error} If no response is available (call `fetch()` first).
   * @returns {string} The assistant’s reply string, or an empty string if none.
   */
  response(): string {
    if (!this._lastResponse) {
      throw new Error("No response available. Call fetch() first.");
    }
    return this._lastResponse?.choices?.[0]?.message?.content ?? "";
  }
}

export type { CompletionResponse, CompletionChoice };
export default KudagonAzureAIClient;

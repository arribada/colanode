// import { Document } from '@langchain/core/documents';
// import { StringOutputParser } from '@langchain/core/output_parsers';
// import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
// import { ChatOpenAI } from '@langchain/openai';

// import { NodeType, RecordNode } from '@colanode/core';
// import {
//   queryRewritePrompt,
//   summarizationPrompt,
//   rerankPrompt,
//   answerPrompt,
//   intentRecognitionPrompt,
//   noContextPrompt,
//   databaseFilterPrompt,
//   chunkSummarizationPrompt,
// } from '@colanode/server/lib/ai/prompts';
// import { config } from '@colanode/server/lib/config';
// import {
//   rerankedDocumentsSchema,
//   RerankedDocuments,
//   citedAnswerSchema,
//   CitedAnswer,
//   databaseFilterSchema,
//   DatabaseFilterResult,
//   RewrittenQuery,
//   rewrittenQuerySchema,
// } from '@colanode/server/types/llm';

// const getChatModel = (task: string): ChatOpenAI | ChatGoogleGenerativeAI => {
//   if (!config.ai.enabled) {
//     throw new Error('AI is disabled.');
//   }

//   const modelConfig = config.ai.models[task as keyof typeof config.ai.models];

//   const providerConfig = config.ai.providers[modelConfig.provider];
//   if (!providerConfig.enabled) {
//     throw new Error(`${modelConfig.provider} provider is disabled.`);
//   }

//   switch (modelConfig.provider) {
//     case 'openai':
//       return new ChatOpenAI({
//         modelName: modelConfig.modelName,
//         temperature: modelConfig.temperature,
//         openAIApiKey: providerConfig.apiKey,
//       });
//     case 'google':
//       return new ChatGoogleGenerativeAI({
//         model: modelConfig.modelName,
//         temperature: modelConfig.temperature,
//         apiKey: providerConfig.apiKey,
//       });
//     default:
//       throw new Error(`Unsupported AI provider: ${modelConfig.provider}`);
//   }
// };

// export const rewriteQuery = async (query: string): Promise<RewrittenQuery> => {
//   const task = 'queryRewrite';
//   const model = getChatModel(task).withStructuredOutput(rewrittenQuerySchema);
//   return queryRewritePrompt
//     .pipe(model)
//     .invoke({ query }) as unknown as RewrittenQuery;
// };

// export const summarizeDocument = async (
//   document: Document,
//   query: string
// ): Promise<string> => {
//   const task = 'summarization';
//   const model = getChatModel(task);
//   return summarizationPrompt
//     .pipe(model)
//     .pipe(new StringOutputParser())
//     .invoke({ text: document.pageContent, query });
// };

// export const rerankDocuments = async (
//   documents: { content: string; type: string; sourceId: string }[],
//   query: string
// ): Promise<
//   Array<{ index: number; score: number; type: string; sourceId: string }>
// > => {
//   const task = 'rerank';
//   const model = getChatModel(task).withStructuredOutput(
//     rerankedDocumentsSchema
//   );
//   const formattedContext = documents
//     .map(
//       (doc, idx) =>
//         `${idx}. Type: ${doc.type}, Content: ${doc.content}, ID: ${doc.sourceId}\n`
//     )
//     .join('\n');
//   const result = (await rerankPrompt
//     .pipe(model)
//     .invoke({ query, context: formattedContext })) as RerankedDocuments;
//   return result.rankings;
// };

// export const generateFinalAnswer = async (promptArgs: {
//   currentTimestamp: string;
//   workspaceName: string;
//   userName: string;
//   userEmail: string;
//   formattedChatHistory: string;
//   formattedMessages: string;
//   formattedDocuments: string;
//   question: string;
// }): Promise<{
//   answer: string;
//   citations: Array<{ sourceId: string; quote: string }>;
// }> => {
//   const task = 'response';
//   const model = getChatModel(task).withStructuredOutput(citedAnswerSchema);
//   return (await answerPrompt.pipe(model).invoke(promptArgs)) as CitedAnswer;
// };

// export const generateNoContextAnswer = async (
//   query: string,
//   chatHistory: string = ''
// ): Promise<string> => {
//   const task = 'noContext';
//   const model = getChatModel(task);
//   return noContextPrompt
//     .pipe(model)
//     .pipe(new StringOutputParser())
//     .invoke({ question: query, formattedChatHistory: chatHistory });
// };

// export const assessUserIntent = async (
//   query: string,
//   chatHistory: string
// ): Promise<'retrieve' | 'no_context'> => {
//   const task = 'intentRecognition';
//   const model = getChatModel(task);
//   const result = await intentRecognitionPrompt
//     .pipe(model)
//     .pipe(new StringOutputParser())
//     .invoke({ question: query, formattedChatHistory: chatHistory });
//   return result.trim().toLowerCase() === 'no_context'
//     ? 'no_context'
//     : 'retrieve';
// };

// export const generateDatabaseFilters = async (args: {
//   query: string;
//   databases: Array<{
//     id: string;
//     name: string;
//     fields: Record<string, { type: string; name: string }>;
//     sampleRecords: RecordNode[];
//   }>;
// }): Promise<DatabaseFilterResult> => {
//   const task = 'databaseFilter';
//   const model = getChatModel(task).withStructuredOutput(databaseFilterSchema);
//   const databasesInfo = args.databases
//     .map(
//       (db) => `
// Database: ${db.name} (ID: ${db.id})
// Fields:
// ${Object.entries(db.fields)
//   .map(([id, field]) => `- ${field.name} (ID: ${id}, Type: ${field.type})`)
//   .join('\n')}

// Sample Records:
// ${db.sampleRecords
//   .map(
//     (record, i) =>
//       `${i + 1}. ${Object.entries(record.fields)
//         .map(([fieldId, value]) => `${db.fields[fieldId]?.name}: ${value}`)
//         .join(', ')}`
//   )
//   .join('\n')}
// `
//     )
//     .join('\n\n');

//   return databaseFilterPrompt.pipe(model).invoke({
//     query: args.query,
//     databasesInfo,
//   }) as unknown as DatabaseFilterResult;
// };

// export const enrichChunk = async (
//   chunk: string,
//   fullText: string = '',
//   nodeType: NodeType
// ): Promise<string> => {
//   const task = 'contextEnhancer';
//   const model = getChatModel(task);

//   return chunkSummarizationPrompt
//     .pipe(model)
//     .pipe(new StringOutputParser())
//     .invoke({
//       chunk,
//       fullText,
//       nodeType,
//     });
// };

// ---------------------------------------------------------------------------
// Anthropic (Claude) completion wiring — Arribada Wiki
//
// The langchain-based RAG helpers above are disabled. The editor completion
// feature instead uses the Vercel AI SDK ('ai' + '@ai-sdk/anthropic'). Only
// Anthropic is wired here; other providers throw so the caller can surface a
// clear "provider unsupported" error.
// ---------------------------------------------------------------------------
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

import type { AiProviderName } from '@colanode/core';

export interface ResolvedLlm {
  provider: AiProviderName;
  model: string;
  apiKey: string;
}

// Resolves the concrete AI SDK model for a ResolvedLlm. Anthropic keeps using
// the native @ai-sdk/anthropic provider; any other provider is routed through
// the OpenAI-compatible provider using AI_OPENAI_COMPAT_BASE_URL (e.g. a free
// Groq/Cerebras endpoint) so the wiki AI can run at $0.
export const resolveAiModel = (llm: ResolvedLlm) => {
  if (llm.provider === 'anthropic') {
    return createAnthropic({ apiKey: llm.apiKey })(llm.model);
  }
  const baseURL = process.env.AI_OPENAI_COMPAT_BASE_URL;
  if (!baseURL) {
    throw new Error(
      `AI provider '${llm.provider}' requires AI_OPENAI_COMPAT_BASE_URL (e.g. https://api.groq.com/openai/v1).`
    );
  }
  return createOpenAICompatible({
    name: llm.provider,
    baseURL,
    apiKey: llm.apiKey,
  })(llm.model);
};

// Single-shot text generation for a resolved LLM. Supported model names:
// claude-opus-4-8 / claude-sonnet-5 / claude-haiku-4-5-20251001 (any Anthropic
// model id is passed through).
export const generateLlmText = async (
  llm: ResolvedLlm,
  args: { system: string; prompt: string; maxOutputTokens?: number }
): Promise<string> => {
  const { text } = await generateText({
    model: resolveAiModel(llm),
    system: args.system,
    prompt: args.prompt,
    maxOutputTokens: args.maxOutputTokens ?? 2048,
  });

  return text;
};

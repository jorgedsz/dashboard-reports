import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const CHUNK_SIZE = 50;

function formatConversationsForAnalysis(conversations) {
  return conversations.map((conv, idx) => {
    const msgs = conv.messages
      .map(m => `  [${m.direction}] (${m.type}) ${m.dateAdded}: ${m.body}`)
      .join('\n');

    return `--- Conversation ${idx + 1} ---
Contact: ${conv.contactName} (${conv.type})
Email: ${conv.contactEmail || 'N/A'}
Phone: ${conv.contactPhone || 'N/A'}
Created: ${conv.dateCreated || 'N/A'}
Last Updated: ${conv.dateUpdated || 'N/A'}
Last Message Direction: ${conv.lastMessageDirection || 'N/A'}
Messages (${conv.messages.length}):
${msgs || '  (no messages)'}`;
  }).join('\n\n');
}

async function analyzeChunk(conversations, userPrompt, chunkIndex, totalChunks) {
  const formatted = formatConversationsForAnalysis(conversations);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `You are analyzing customer conversations from GoHighLevel CRM.

Here are ${conversations.length} conversations (batch ${chunkIndex + 1} of ${totalChunks}):

${formatted}

---

User's analysis request: "${userPrompt}"

Provide a detailed analysis based on the user's request. Use markdown formatting. Include specific examples and quotes from conversations where relevant. Be thorough and insightful.`,
    }],
  });

  return response.content[0].text;
}

async function mergeReports(subReports, userPrompt, totalConversations) {
  const combined = subReports.map((report, i) => `## Batch ${i + 1} Analysis\n\n${report}`).join('\n\n---\n\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: `You previously analyzed ${totalConversations} GoHighLevel conversations in ${subReports.length} batches. Here are the batch analyses:

${combined}

---

The original analysis request was: "${userPrompt}"

Now merge all batch analyses into ONE cohesive, well-structured final report. Use markdown formatting with clear sections, headings, bullet points, and highlights. Eliminate redundancy, synthesize patterns across batches, and provide actionable insights. Include a summary section at the top and detailed findings below.

Total conversations analyzed: ${totalConversations}`,
    }],
  });

  return response.content[0].text;
}

export async function generateReport(conversations, userPrompt, onProgress) {
  if (conversations.length === 0) {
    return 'No conversations found in the selected date range and filters.';
  }

  if (conversations.length <= CHUNK_SIZE) {
    if (onProgress) onProgress('Analyzing conversations...');
    return await analyzeChunk(conversations, userPrompt, 0, 1);
  }

  const chunks = [];
  for (let i = 0; i < conversations.length; i += CHUNK_SIZE) {
    chunks.push(conversations.slice(i, i + CHUNK_SIZE));
  }

  const subReports = [];
  for (let i = 0; i < chunks.length; i++) {
    if (onProgress) onProgress(`Analyzing batch ${i + 1} of ${chunks.length}...`);
    const subReport = await analyzeChunk(chunks[i], userPrompt, i, chunks.length);
    subReports.push(subReport);
  }

  if (onProgress) onProgress('Merging results into final report...');
  return await mergeReports(subReports, userPrompt, conversations.length);
}

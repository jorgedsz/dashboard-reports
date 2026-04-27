import axios from 'axios';

const GHL_BASE = 'https://services.leadconnectorhq.com';
const API_VERSION = '2021-07-28';
const MAX_PAGES = 20; // Safety limit: max 2000 conversations scanned

function ghlHeaders(token) {
  return { Authorization: `Bearer ${token}`, Version: API_VERSION, Accept: 'application/json' };
}

/**
 * Fetch conversations from GHL, paginated.
 * Date filtering done client-side (GHL search doesn't support date params).
 * onProgress(message) called for status updates.
 */
export async function fetchConversations(token, locationId, dateFrom, dateTo, onProgress) {
  const conversations = [];
  let startAfterId = null;
  let hasMore = true;
  const fromDate = dateFrom ? new Date(dateFrom) : null;
  const toDate = dateTo ? new Date(new Date(dateTo).getTime() + 86400000 - 1) : null;
  let emptyPagesInRange = 0;
  let page = 0;

  console.log(`[GHL] Fetching conversations: locationId=${locationId}, from=${fromDate?.toISOString()}, to=${toDate?.toISOString()}`);

  while (hasMore && page < MAX_PAGES) {
    page++;
    if (onProgress) onProgress(`Scanning conversations (page ${page}, found ${conversations.length} matches)...`);

    const params = { locationId, limit: 100 };
    if (startAfterId) params.startAfterId = startAfterId;

    const response = await axios.get(`${GHL_BASE}/conversations/search`, {
      headers: ghlHeaders(token),
      params,
    });

    const data = response.data;
    const batch = data.conversations || [];

    if (batch.length === 0) {
      hasMore = false;
      break;
    }

    let batchHasConversationsInRange = false;

    for (const conv of batch) {
      const convDate = new Date(conv.dateUpdated || conv.dateAdded || conv.createdAt);

      if (fromDate && convDate < fromDate) continue;
      if (toDate && convDate > toDate) continue;

      batchHasConversationsInRange = true;
      conversations.push(conv);
    }

    if (!batchHasConversationsInRange) {
      emptyPagesInRange++;
      if (emptyPagesInRange >= 2) {
        hasMore = false;
        break;
      }
    } else {
      emptyPagesInRange = 0;
    }

    if (batch.length < 100) {
      hasMore = false;
    } else {
      startAfterId = batch[batch.length - 1].id;
    }
  }

  // Deduplicate conversations (GHL can return same conversation across pages)
  const seen = new Set();
  const unique = [];
  for (const conv of conversations) {
    if (!seen.has(conv.id)) {
      seen.add(conv.id);
      unique.push(conv);
    }
  }

  console.log(`[GHL] Done scanning: ${page} pages, ${conversations.length} raw, ${unique.length} unique conversations in date range`);
  unique.sort((a, b) => new Date(b.dateUpdated) - new Date(a.dateUpdated));
  return unique;
}

/**
 * Fetch messages for a single conversation.
 */
export async function fetchMessages(token, conversationId) {
  const messages = [];
  let pageToken = null;
  let hasMore = true;

  while (hasMore) {
    const params = { limit: 100 };
    if (pageToken) params.startAfterId = pageToken;

    const response = await axios.get(`${GHL_BASE}/conversations/${conversationId}/messages`, {
      headers: ghlHeaders(token),
      params,
    });

    const data = response.data;
    // GHL wraps messages: { messages: { messages: [...], lastMessageId, nextPage } }
    const raw = data.messages;
    const batch = Array.isArray(raw) ? raw : Array.isArray(raw?.messages) ? raw.messages : [];

    if (batch.length === 0 && raw && !Array.isArray(raw)) {
      console.log(`[GHL] Messages response structure for ${conversationId}:`, Object.keys(raw), `inner messages count: ${raw.messages?.length || 0}`);
    }

    if (batch.length === 0) break;

    messages.push(...batch);

    // Use nextPage from nested structure if available, otherwise fall back to count-based
    const nextPage = raw?.nextPage;
    if (batch.length < 100 && !nextPage) {
      hasMore = false;
    } else {
      pageToken = raw?.lastMessageId || batch[batch.length - 1].id;
    }
  }

  return messages;
}

/**
 * Fetch conversations with their messages.
 * messageTypes filter is applied at the message level, not conversation level.
 * Conversations are included if they have at least one message matching the selected types.
 */
export async function fetchConversationsWithMessages(token, locationId, dateFrom, dateTo, messageTypes, onProgress) {
  const conversations = await fetchConversations(token, locationId, dateFrom, dateTo, onProgress);
  const total = conversations.length;

  if (onProgress) onProgress(`Found ${total} conversations. Fetching messages...`);

  const results = [];
  const messageTypesFound = new Set();

  for (let i = 0; i < conversations.length; i++) {
    const conv = conversations[i];
    if (onProgress) onProgress(`Fetching messages (${i + 1}/${total})...`);

    try {
      const messages = await fetchMessages(token, conv.id);

      // Log message types from first conversation to debug
      if (i === 0 && messages.length > 0) {
        const sampleTypes = [...new Set(messages.map(m => m.messageType || m.type))];
        console.log(`[GHL] Sample message types from first conversation:`, JSON.stringify(sampleTypes));
      }

      // Track all message types seen
      for (const m of messages) {
        messageTypesFound.add(m.messageType || m.type || 'unknown');
      }

      // Filter messages by selected types if any
      let filteredMessages = messages;
      if (messageTypes && messageTypes.length > 0) {
        filteredMessages = messages.filter(m => {
          const mt = (m.messageType || m.type || '').toUpperCase();
          return messageTypes.some(t => mt === t.toUpperCase() || mt === t.replace('TYPE_', '').toUpperCase());
        });
      }

      // Only include conversation if it has matching messages
      if (messageTypes && messageTypes.length > 0 && filteredMessages.length === 0) {
        continue;
      }

      results.push({
        id: conv.id,
        contactName: conv.contactName || conv.fullName || 'Unknown',
        contactEmail: conv.email || '',
        contactPhone: conv.phone || '',
        type: conv.type || 'unknown',
        dateCreated: conv.dateAdded || conv.createdAt,
        dateUpdated: conv.dateUpdated || conv.lastMessageDate,
        lastMessageType: conv.lastMessageType || '',
        lastMessageDirection: conv.lastMessageDirection || '',
        messages: filteredMessages.map(m => ({
          body: m.body || '',
          direction: m.direction || '',
          type: m.messageType || m.type || '',
          dateAdded: m.dateAdded || '',
        })),
      });
    } catch (err) {
      console.error(`Failed to fetch messages for conversation ${conv.id}:`, err.message);
    }
  }

  console.log(`[GHL] Message types found across all conversations: [${[...messageTypesFound].join(', ')}]`);
  console.log(`[GHL] After message-level filtering: ${results.length} conversations with matching messages`);

  return results;
}

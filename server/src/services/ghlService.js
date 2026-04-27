import axios from 'axios';

const GHL_BASE = 'https://services.leadconnectorhq.com';
const API_VERSION = '20210124';

function ghlHeaders(token) {
  return { Authorization: `Bearer ${token}`, Version: API_VERSION };
}

export async function fetchConversations(token, locationId, dateFrom, dateTo, conversationTypes) {
  const conversations = [];
  let startAfterId = null;
  let hasMore = true;

  while (hasMore) {
    const params = {
      locationId,
      limit: 100,
    };
    if (dateFrom) params.startAfterDate = new Date(dateFrom).toISOString();
    if (dateTo) params.endBeforeDate = new Date(dateTo).toISOString();
    if (startAfterId) params.startAfterId = startAfterId;

    const response = await axios.get(`${GHL_BASE}/conversations/search`, {
      headers: ghlHeaders(token),
      params,
    });

    const data = response.data;
    const batch = data.conversations || [];

    const filtered = conversationTypes && conversationTypes.length > 0
      ? batch.filter(c => conversationTypes.includes(c.type))
      : batch;

    conversations.push(...filtered);

    if (batch.length < 100) {
      hasMore = false;
    } else {
      startAfterId = batch[batch.length - 1].id;
    }
  }

  conversations.sort((a, b) => new Date(b.dateUpdated) - new Date(a.dateUpdated));
  return conversations;
}

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
    const batch = data.messages || [];
    messages.push(...batch);

    if (batch.length < 100) {
      hasMore = false;
    } else {
      pageToken = batch[batch.length - 1].id;
    }
  }

  return messages;
}

export async function fetchConversationsWithMessages(token, locationId, dateFrom, dateTo, conversationTypes, onProgress) {
  const conversations = await fetchConversations(token, locationId, dateFrom, dateTo, conversationTypes);
  const total = conversations.length;
  const results = [];

  for (let i = 0; i < conversations.length; i++) {
    const conv = conversations[i];
    try {
      const messages = await fetchMessages(token, conv.id);
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
        messages: messages.map(m => ({
          body: m.body || '',
          direction: m.direction || '',
          type: m.messageType || m.type || '',
          dateAdded: m.dateAdded || '',
        })),
      });
    } catch (err) {
      console.error(`Failed to fetch messages for conversation ${conv.id}:`, err.message);
      results.push({
        id: conv.id,
        contactName: conv.contactName || conv.fullName || 'Unknown',
        type: conv.type || 'unknown',
        dateUpdated: conv.dateUpdated || '',
        messages: [],
        error: 'Failed to fetch messages',
      });
    }

    if (onProgress) onProgress(i + 1, total);
  }

  return results;
}

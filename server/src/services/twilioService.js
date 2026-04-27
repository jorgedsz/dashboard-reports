import axios from 'axios';
import OpenAI from 'openai';

const TWILIO_BASE = 'https://api.twilio.com/2010-04-01';

function twilioAuth(accountSid, authToken) {
  return { username: accountSid, password: authToken };
}

async function transcribeRecording(audioBuffer, filename) {
  try {
    const openai = new OpenAI();
    const file = new File([audioBuffer], filename, { type: 'audio/mpeg' });
    const response = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
    });
    return response.text;
  } catch (err) {
    console.error(`[Twilio] Transcription failed for ${filename}:`, err.message);
    return null;
  }
}

export async function fetchCalls(accountSid, authToken, dateFrom, dateTo, onProgress) {
  const calls = [];
  let url = `${TWILIO_BASE}/Accounts/${accountSid}/Calls.json`;
  const params = {
    'StartTime>': dateFrom,
    'StartTime<': dateTo,
    PageSize: 100,
  };
  let page = 0;

  if (onProgress) onProgress('Obteniendo llamadas de Twilio...');

  while (url) {
    page++;
    if (onProgress && page > 1) {
      onProgress(`Obteniendo llamadas de Twilio (página ${page}, ${calls.length} encontradas)...`);
    }

    const response = await axios.get(url, {
      auth: twilioAuth(accountSid, authToken),
      params: page === 1 ? params : undefined,
    });

    const data = response.data;
    if (data.calls && data.calls.length > 0) {
      calls.push(...data.calls);
    }

    url = data.next_page_uri ? `https://api.twilio.com${data.next_page_uri}` : null;
  }

  return calls;
}

export async function fetchRecording(accountSid, authToken, callSid) {
  try {
    const listUrl = `${TWILIO_BASE}/Accounts/${accountSid}/Calls/${callSid}/Recordings.json`;
    const listRes = await axios.get(listUrl, {
      auth: twilioAuth(accountSid, authToken),
    });

    const recordings = listRes.data.recordings;
    if (!recordings || recordings.length === 0) return null;

    const recordingSid = recordings[0].sid;
    const mp3Url = `${TWILIO_BASE}/Accounts/${accountSid}/Recordings/${recordingSid}.mp3`;
    const mp3Res = await axios.get(mp3Url, {
      auth: twilioAuth(accountSid, authToken),
      responseType: 'arraybuffer',
    });

    return { buffer: Buffer.from(mp3Res.data), recordingSid };
  } catch (err) {
    console.error(`[Twilio] Failed to fetch recording for call ${callSid}:`, err.message);
    return null;
  }
}

export async function fetchCallsWithRecordings(accountSid, authToken, dateFrom, dateTo, onProgress) {
  const calls = await fetchCalls(accountSid, authToken, dateFrom, dateTo, onProgress);
  const total = calls.length;

  if (onProgress) onProgress(`Se encontraron ${total} llamadas. Descargando grabaciones...`);

  const results = [];

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    if (onProgress) onProgress(`Descargando y transcribiendo grabación (${i + 1}/${total})...`);

    let transcription = null;
    let hasRecording = false;

    if (parseInt(call.duration) > 0) {
      const recording = await fetchRecording(accountSid, authToken, call.sid);
      if (recording) {
        hasRecording = true;
        if (recording.buffer.length <= 25 * 1024 * 1024) {
          transcription = await transcribeRecording(
            recording.buffer,
            `${call.sid}.mp3`
          );
        } else {
          console.warn(`[Twilio] Recording for call ${call.sid} exceeds 25MB, skipping transcription`);
        }
      }
    }

    results.push({
      sid: call.sid,
      from: call.from_formatted || call.from,
      to: call.to_formatted || call.to,
      direction: call.direction,
      duration: parseInt(call.duration) || 0,
      status: call.status,
      startTime: call.start_time,
      endTime: call.end_time,
      hasRecording,
      transcription,
    });
  }

  console.log(`[Twilio] Processed ${results.length} calls, ${results.filter(r => r.transcription).length} with transcriptions`);
  return results;
}

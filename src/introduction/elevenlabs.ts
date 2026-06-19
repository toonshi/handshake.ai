import { config } from '../config';

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

interface OutboundCallResponse {
  conversation_id: string;
  status: string;
}

export async function initiateOutboundCall(
  phoneNumber: string,
  firstMessage: string
): Promise<string> {
  const url = `${ELEVENLABS_BASE_URL}/convai/conversations/outbound`;

  const payload = {
    agent_id: config.elevenlabs.agentId,
    agent_phone_number_id: undefined, // set if you have a purchased number
    to_number: phoneNumber,
    conversation_initiation_client_data: {
      conversation_config_override: {
        agent: {
          first_message: firstMessage,
        },
      },
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': config.elevenlabs.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as OutboundCallResponse;
  return data.conversation_id;
}

export async function getCallStatus(conversationId: string): Promise<string> {
  const url = `${ELEVENLABS_BASE_URL}/convai/conversations/${conversationId}`;

  const response = await fetch(url, {
    headers: {
      'xi-api-key': config.elevenlabs.apiKey,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as { status: string };
  return data.status;
}

export interface SSEEvent {
  event: string;
  data: string;
}

export async function* parseSSEStream(
  response: Response
): AsyncGenerator<SSEEvent> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = 'message';
  let currentData = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop()!; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        currentData += (currentData ? '\n' : '') + line.slice(6);
      } else if (line === '') {
        if (currentData) {
          yield { event: currentEvent, data: currentData };
          currentEvent = 'message';
          currentData = '';
        }
      }
    }
  }

  // Flush remaining data
  if (currentData) {
    yield { event: currentEvent, data: currentData };
  }
}

export function formatSSE(event: string, data: string): string {
  return `event: ${event}\ndata: ${data}\n\n`;
}

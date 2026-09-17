export class HttpChatTransport {
  constructor(chatUrl) {
    this.chatUrl = chatUrl;
  }

  async send(payload, { signal } = {}) {
    const res = await fetch(this.chatUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`chat failed: ${res.status} ${text}`);
    }
    return res.json();
  }
}


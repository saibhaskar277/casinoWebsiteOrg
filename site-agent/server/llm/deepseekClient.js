async function deepseekChat({ apiKey, model, messages, tools, maxTokens, temperature }) {
  const body = {
    model,
    messages,
    temperature: temperature == null ? 0.2 : temperature,
    max_tokens: maxTokens == null ? 400 : maxTokens
  };

  if (Array.isArray(tools) && tools.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`DeepSeek error: ${res.status} ${text}`);
  }

  return JSON.parse(text);
}

module.exports = { deepseekChat };

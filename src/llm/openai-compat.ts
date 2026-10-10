import type { LLM } from '../tipos.ts';
import { dia } from '../util.ts';

/**
 * Cualquier API compatible con OpenAI (OpenRouter por defecto). Un modelo barato alcanza:
 * el modelo solo clasifica y reescribe; precios y stock los pone el código.
 * Tope diario de llamadas como límite de gasto: al llegar, el pipeline sigue con reglas.
 */
export class LLMCompat implements LLM {
  private llamadas = 0;
  private hoy = dia();
  constructor(private apiKey: string, private modelo: string, private base = 'https://openrouter.ai/api/v1', private topeDiario = 300) {}

  async completar(sistema: string, usuario: string, json = false) {
    if (dia() !== this.hoy) [this.hoy, this.llamadas] = [dia(), 0];
    if (++this.llamadas > this.topeDiario) throw new Error('tope diario de llamadas al LLM alcanzado');
    const res = await fetch(`${this.base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelo,
        temperature: 0.2,
        messages: [{ role: 'system', content: sistema }, { role: 'user', content: usuario }],
        ...(json && { response_format: { type: 'json_object' } }),
      }),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return data.choices[0].message.content;
  }
}

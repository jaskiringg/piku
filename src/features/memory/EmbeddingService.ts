import { ollamaService } from '../../services/OllamaService'
import { logger }         from '../../lib/logger'

export class EmbeddingService {
  // Returns Float32Array — 4 bytes/float vs ~15 bytes/float in JSON number[].
  // The conversion happens once here at the API boundary; all downstream code
  // works directly with Float32Array stored natively in IndexedDB.
  async embed(text: string): Promise<Float32Array> {
    try {
      const raw = await ollamaService.embed(text)  // number[] from Ollama
      logger.embedding('converted to Float32Array', { dims: raw.length })
      return new Float32Array(raw)
    } catch (err) {
      logger.error('EmbeddingService.embed failed', { chars: text.length, error: String(err) })
      throw err
    }
  }
}

// Structured logger for Piku.
// All logs are prefixed and scoped so console output is easy to filter.
// Usage: logger.project('thing happened', { key: value })

type LogData = Record<string, unknown> | string | number | undefined

function emit(scope: string, level: 'log' | 'warn' | 'error', msg: string, data?: LogData) {
  const prefix = `[piku:${scope}]`
  if (data !== undefined) {
    console[level](prefix, msg, data)
  } else {
    console[level](prefix, msg)
  }
}

export const logger = {
  ollama:     (msg: string, data?: LogData) => emit('ollama',      'log',   msg, data),
  embedding:  (msg: string, data?: LogData) => emit('embedding',   'log',   msg, data),
  memory:     (msg: string, data?: LogData) => emit('memory',      'log',   msg, data),
  project:    (msg: string, data?: LogData) => emit('project',     'log',   msg, data),
  chat:       (msg: string, data?: LogData) => emit('chat',        'log',   msg, data),
  worldmodel: (msg: string, data?: LogData) => emit('worldmodel',  'log',   msg, data),
  info:       (msg: string, data?: LogData) => emit('piku',        'log',   msg, data),
  warn:       (msg: string, data?: LogData) => emit('piku',        'warn',  msg, data),
  error:      (msg: string, data?: LogData) => emit('piku',        'error', msg, data),
}

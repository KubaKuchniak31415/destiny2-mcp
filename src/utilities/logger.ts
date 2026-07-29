type Level = 'debug' | 'info' | 'warn' | 'error';

export const print = (level: Level, message: string) => {
  console.error(`[${level.toUpperCase()}] ${message}`);
};
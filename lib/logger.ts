export async function logError(error: unknown, context?: Record<string, unknown>) {
  console.error('[intake] error', error, context || '');

  if (!process.env.SENTRY_DSN) return;

  try {
    const Sentry = await import('@sentry/node');
    if (Sentry && typeof Sentry.captureException === 'function') {
      Sentry.captureException(error, { extra: context });
    }
  } catch (captureError) {
    console.warn('Sentry capture failed', captureError);
  }
}

export function logInfo(message: string, context?: Record<string, unknown>) {
  console.info('[intake]', message, context || '');
}

/**
 * Reject the returned promise after `timeoutMs` if `promise` hasn't settled.
 * Note: this does NOT cancel the underlying work — it just stops waiting.
 * For cancelable I/O (fetch, etc.) prefer AbortController.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); }
    );
  });
}

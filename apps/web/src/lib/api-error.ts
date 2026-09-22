export const BACKEND_UNAVAILABLE_EVENT = 'classroom-backend-unavailable';
export const BACKEND_AVAILABLE_EVENT = 'classroom-backend-available';

export function reportBackendUnavailable(message: string): void {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent(BACKEND_UNAVAILABLE_EVENT, {
      detail: { message },
    }),
  );
}

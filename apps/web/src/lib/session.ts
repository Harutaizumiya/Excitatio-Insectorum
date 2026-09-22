import type { NamedEntity } from './domain';

const USER_SESSION_KEY = 'classroom.session:v1';
const ACTIVE_CLASS_KEY = 'classroom.active-class:v1';
const DISPLAY_SESSION_KEY = 'classroom.display-session:v1';

export interface UserSession {
  accessToken: string;
  refreshToken: string;
  user: NamedEntity;
}

export interface DisplaySession {
  deviceId: string;
  classId?: string;
  credential: string;
  accessToken: string;
  expiresAt: string;
}

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing and storage quota errors should not break the API client.
  }
}

function remove(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function authChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('classroom-auth-changed'));
  }
}

export function getUserSession(): UserSession | null {
  return readJson<UserSession>(USER_SESSION_KEY);
}

export function setUserSession(session: UserSession): void {
  writeJson(USER_SESSION_KEY, session);
  authChanged();
}

export function clearUserSession(): void {
  remove(USER_SESSION_KEY);
  remove(ACTIVE_CLASS_KEY);
  authChanged();
}

export function getActiveClassId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ACTIVE_CLASS_KEY);
  } catch {
    return null;
  }
}

export function setActiveClassId(classId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ACTIVE_CLASS_KEY, classId);
  } catch {
    // Ignore storage failures; callers can still use the current response.
  }
  authChanged();
}

export function getDisplaySession(): DisplaySession | null {
  return readJson<DisplaySession>(DISPLAY_SESSION_KEY);
}

export function setDisplaySession(session: DisplaySession): void {
  writeJson(DISPLAY_SESSION_KEY, session);
  authChanged();
}

export function clearDisplaySession(): void {
  remove(DISPLAY_SESSION_KEY);
  authChanged();
}

export function clearAllSessions(): void {
  clearUserSession();
  clearDisplaySession();
}

import Taro, { useDidHide, useDidShow } from '@tarojs/taro';
import { useEffect, useRef, useState } from 'react';
import { getSession, getActiveClassId } from './api';
import {
  SocketIoRealtimeClient,
  RealtimeLifecycleController,
  type ClassRealtimeEvent,
  type RealtimeConnectionStatus,
  type SocketTask,
} from './realtime-core';

const API_ORIGIN = process.env.TARO_APP_API_ORIGIN || 'http://127.0.0.1:3000/api/v1';
const SOCKET_ORIGIN = process.env.TARO_APP_SOCKET_ORIGIN || API_ORIGIN.replace(/\/api\/v1\/?$/, '');
const socketOrigin = SOCKET_ORIGIN.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');

export const realtimeClient = new SocketIoRealtimeClient({
  createSocket: async (url) => (await Taro.connectSocket({ url })) as unknown as SocketTask,
  getUrl: () => `${socketOrigin.replace(/\/$/, '')}/socket.io/?EIO=4&transport=websocket`,
  getAuth: () => {
    const session = getSession();
    const classId = getActiveClassId();
    return session && classId ? { token: session.accessToken, classId } : null;
  },
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (timer) => clearTimeout(timer),
});

let connectedClassId: string | null = null;

export function connectRealtime(classId?: string): void {
  const nextClassId = classId ?? getActiveClassId();
  if (!nextClassId || nextClassId !== getActiveClassId()) return;
  if (connectedClassId !== nextClassId) {
    realtimeClient.disconnect();
    connectedClassId = nextClassId;
  }
  realtimeClient.connect();
}

export function disconnectRealtime(): void {
  connectedClassId = null;
  realtimeClient.disconnect();
}

export function subscribeRealtime<T extends ClassRealtimeEvent>(
  type: string,
  handler: (event: T) => void,
): () => void {
  return realtimeClient.subscribe(type, handler);
}

export function useRealtimeStatus(): RealtimeConnectionStatus {
  const [status, setStatus] = useState(realtimeClient.getStatus());
  useEffect(() => realtimeClient.subscribeStatus(setStatus), []);
  return status;
}

export function useRealtimeEvent<T extends ClassRealtimeEvent>(
  type: string,
  handler: (event: T) => void,
): void {
  const current = useRef(handler);
  current.current = handler;
  useEffect(() => realtimeClient.subscribe<T>(type, (event) => current.current(event)), [type]);
}

export function useForegroundRefresh(callback: () => void | Promise<void>): void {
  const current = useRef(callback);
  current.current = callback;
  useDidShow(() => {
    void current.current();
  });
}

export function useRealtimeLifecycle(
  classId: string | null,
  onConnected?: () => void | Promise<void>,
): void {
  const current = useRef(onConnected);
  const currentClassId = useRef(classId);
  const lifecycle = useRef<RealtimeLifecycleController | null>(null);
  if (!lifecycle.current) {
    lifecycle.current = new RealtimeLifecycleController(connectRealtime, disconnectRealtime);
  }
  current.current = onConnected;
  currentClassId.current = classId;
  useDidShow(() => {
    lifecycle.current?.show(currentClassId.current);
    void current.current?.();
  });
  useDidHide(() => lifecycle.current?.hide());
  useEffect(() => lifecycle.current?.setClass(classId), [classId]);
  useEffect(() => () => lifecycle.current?.dispose(), []);
  useEffect(() => realtimeClient.subscribeConnected(() => void current.current?.()), []);
}

export type { ClassRealtimeEvent, RealtimeConnectionStatus } from './realtime-core';

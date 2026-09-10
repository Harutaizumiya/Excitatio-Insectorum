'use client';

import { useEffect, useRef, useState } from 'react';

import type { ClassEventType, ClassRealtimeEvent, RealtimeConnectionStatus } from '@/lib';

import { useRealtimeClient } from './classroom-system-provider';

export function useRealtimeStatus(): RealtimeConnectionStatus {
  const client = useRealtimeClient();
  const [status, setStatus] = useState<RealtimeConnectionStatus>('DISCONNECTED');

  useEffect(() => client.subscribeStatus(setStatus), [client]);
  return status;
}

export function useRealtimeEvent<TType extends ClassEventType>(
  type: TType,
  handler: (event: ClassRealtimeEvent<TType>) => void,
  classId?: string,
): void {
  const client = useRealtimeClient();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(
    () => client.subscribe(type, classId, (event) => handlerRef.current(event)),
    [classId, client, type],
  );
}

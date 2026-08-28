import { ClassEventType, PrincipalType } from '../common';
import { RealtimeService } from './realtime.service';

describe('RealtimeService', () => {
  it('publishes the complete envelope under its event type to the class room', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const service = new RealtimeService();
    service.attachServer({ to } as never);
    const event = {
      id: 'event-1',
      type: ClassEventType.RANDOM_PICKED,
      classId: 'class-1',
      occurredAt: '2026-08-25T00:00:00.000Z',
      payload: { studentId: 'student-1' },
    };

    service.publishClassEvent('class-1', event);
    expect(to).toHaveBeenCalledWith('class:class-1');
    expect(emit).toHaveBeenCalledWith(ClassEventType.RANDOM_PICKED, event);
  });

  it('does not broadcast an envelope into a different class room', () => {
    const to = jest.fn();
    const service = new RealtimeService();
    service.attachServer({ to } as never);
    service.publishClassEvent('class-1', {
      id: 'event-1',
      type: ClassEventType.STUDENT_CHANGED,
      classId: 'class-2',
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    expect(to).not.toHaveBeenCalled();
  });

  it('disconnects registered sockets immediately when a session or device is revoked', () => {
    const service = new RealtimeService();
    const userSocket = { id: 'user-socket', data: {}, disconnect: jest.fn() };
    const deviceSocket = { id: 'device-socket', data: {}, disconnect: jest.fn() };
    service.registerClient(
      userSocket as never,
      {
        sub: 'user-1',
        type: PrincipalType.USER,
        sessionId: 'session-1',
      },
      'class-1',
    );
    service.registerClient(
      deviceSocket as never,
      {
        sub: 'device-1',
        type: PrincipalType.DISPLAY_DEVICE,
        classId: 'class-1',
      },
      'class-1',
    );

    service.disconnectSession('session-1');
    expect(userSocket.disconnect).toHaveBeenCalledWith(true);
    expect(deviceSocket.disconnect).not.toHaveBeenCalled();

    service.disconnectDevice('device-1');
    expect(deviceSocket.disconnect).toHaveBeenCalledWith(true);
  });
});

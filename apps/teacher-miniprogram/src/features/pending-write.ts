export interface OwnedPendingWrite<T> {
  teacherId: string;
  classId: string;
  input: T;
  lookupOnly?: boolean;
}

export function hasPendingWrite(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

export function ownedPendingWrite<T>(
  teacherId: string,
  classId: string,
  input: T,
): OwnedPendingWrite<T> {
  return { teacherId, classId, input };
}

export function isOwnedPendingWrite<T>(
  value: unknown,
  teacherId: string,
  classId: string,
): value is OwnedPendingWrite<T> {
  if (typeof value !== 'object' || value === null) return false;
  const write = value as Partial<OwnedPendingWrite<T>>;
  return (
    write.teacherId === teacherId &&
    write.classId === classId &&
    'input' in write &&
    write.input !== undefined &&
    write.input !== null
  );
}

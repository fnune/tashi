export const BUILTIN_PROFILE_UUIDS: ReadonlyMap<string, string> = new Map([
  ["normal", "075b7f05-9adb-5183-83f5-5f9d5b7adea0"],
  ["sport", "1f2c4f92-2b6a-577e-b546-408716e74468"],
  ["sick", "7a6339cd-b29c-5eee-b408-38ba393440a5"],
  ["menstruation", "1b7dc38e-770f-504e-be22-0a66b07922c6"],
]);

const builtinOfUuid = new Map(
  [...BUILTIN_PROFILE_UUIDS].map(([id, uuid]) => [uuid, id]),
);

export function profileUuid(id: string): string {
  return BUILTIN_PROFILE_UUIDS.get(id) ?? id;
}

export function profileIdOfUuid(uuid: string): string {
  return builtinOfUuid.get(uuid) ?? uuid;
}

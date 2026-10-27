import { uuidV5 } from "./uuid.js";

const NAMESPACE = "5d0a8f4e-3b6c-4d1e-9a27-8c4f1e2b7d90";

const BUILTIN_IDS = ["normal", "sport", "sick", "menstruation"];

const uuidOfBuiltin = new Map(
  BUILTIN_IDS.map((id) => [id, uuidV5(id, NAMESPACE)]),
);
const builtinOfUuid = new Map(
  [...uuidOfBuiltin].map(([id, uuid]) => [uuid, id]),
);

export function profileUuid(id: string): string {
  return uuidOfBuiltin.get(id) ?? id;
}

export function profileIdOfUuid(uuid: string): string {
  return builtinOfUuid.get(uuid) ?? uuid;
}

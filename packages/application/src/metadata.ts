export type MetadataScalar = string | number | boolean | null;

export interface MetadataObject {
  readonly [key: string]: MetadataValue;
}

export type MetadataValue =
  MetadataScalar | readonly MetadataValue[] | MetadataObject;

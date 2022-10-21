export interface Schema {
  $ref?: string;
  type?: string;
  enum?: string[];
}

export interface Property {
  type: PropertyType;
  $ref?: string;
  description?: string;
  nullable?: boolean;
  minimum?: number;
  items?: Schema;
  format?: PropertyFormat;
  enum?: string[];
}

export enum PropertyFormat {
  DateTime = 'date-time',
}

export enum PropertyType {
  Array = 'array',
  Boolean = 'boolean',
  Integer = 'integer',
  Number = 'number',
  String = 'string',
}

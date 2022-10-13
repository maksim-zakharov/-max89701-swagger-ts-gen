import axios from "axios";
import path from "path";
import {
  capitalizeFirstLetter,
  createEnumFileAsync, createInterfaceFileAsync,
  loadEnumTemplateAsync,
  loadModelTemplateAsync,
  loadStoreTemplateAsync,
  loadSwaggerAsync
} from "./utils";

const fs = require('fs');
const { exec } = require('child_process');

interface SwaggerSchema {
  openapi: string;
  paths: Paths;
  info: Info;
  tags: any[];
  servers: Server[];
  components: Components;
  externalDocs: ExternalDocs;
}

interface Components {
  schemas: Schemas;
}

interface Schemas {
  [name: string]: Dto;
}

interface Dto {
  type: string;
  properties: { [key: string]: Property };
  required: string[];
}

interface Property {
  type: Type;
  $ref?: string;
  description?: string;
  nullable?: boolean;
  minimum?: number;
  items?: ItemsElement;
  format?: Format;
  enum?: string[];
}

enum Format {
  DateTime = 'date-time',
}

interface ItemsElement {
  $ref?: string;
  type?: string;
  enum?: string[];
}

enum Type {
  Array = 'array',
  Integer = 'integer',
  String = 'string',
}

interface ExternalDocs {
  description: string;
  url: string;
}

interface Info {
  title: string;
  description: string;
  version: string;
  contact: Contact;
}

interface Contact {}

interface Paths {
  [path: string]: PathMethods;
}

interface PathMethods {
  post?: MethodSchema;
  get?: MethodSchema;
  delete?: MethodSchema;
}

interface MethodSchema {
  operationId: string;
  summary: string;
  parameters: any[];
  requestBody?: RequestBody;
  responses: { [key: string]: Response };
  tags: string[];
}

interface RequestBody {
  required: boolean;
  content: Content;
}

interface Content {
  'application/json': ApplicationJSON;
}

interface ApplicationJSON {
  schema: ItemsElement;
}

interface Response {
  description: string;
  content?: Content;
}

interface Server {
  url: string;
}

const getNameFromDefinitionString = (definitionString: string) =>
  definitionString.replace(/\#\/components\/schemas\//gm, '');

const buildEndpointName = (method: string, methodSchema: MethodSchema) => {
  const methodName = getNameFromDefinitionString(
    (
      methodSchema.responses['200'] ||
      methodSchema.responses['201'] ||
      methodSchema.responses['204']
    ).content?.['application/json']?.schema?.$ref || '',
  );
  return `${method}${methodName}`;
};

const getStoreNameFromArgs = () => {
  const nameParamIndex = process.argv.indexOf('-n') + 1;
  if (nameParamIndex) {
    return process.argv[nameParamIndex];
  }

  return undefined;
};



const generateModels = async (definitions: Schemas) => {
  const outputParamIndex = process.argv.indexOf('-o') + 1;
  const outputPath = process.argv[outputParamIndex];
  if (!outputPath) {
    return;
  }

  const Fields = '// Fields';
  const Imports = '// Imports';
  const ModelTemplate = 'ModelTemplate';

  const swaggerTypeMap: { [key: string]: string } = {
    integer: 'number',
    string: 'string',
    boolean: 'boolean',
  };

  const modelTemplate = await loadModelTemplateAsync();
  const enumTemplate = await loadEnumTemplateAsync();

  const objectNames = Object.keys(definitions);

  for (let i = 0; i < objectNames.length; i++) {
    let interfaceName = objectNames[i];
    const properties = definitions[interfaceName].properties;

    if (definitions[interfaceName].type !== 'object') continue;

    interfaceName = interfaceName.split('.')[0];

    const fieldNames = Object.keys(properties);
    const newFields = [];
    const importFields = new Set<string>();
    for (let j = 0; j < fieldNames.length; j++) {
      const field = properties[fieldNames[j]];

      if (field.type && (field.type as string) !== 'array') {
        const type = field.type as string;
        const isDate = field.format === Format.DateTime;
        if (!field.enum) {
          newFields.push({
            key: fieldNames[j],
            value: isDate ? 'Date' : swaggerTypeMap[type],
            description: field.description,
            nullable: field.nullable,
          });
        } else {
          const enumName = interfaceName + capitalizeFirstLetter(fieldNames[j]);

          importFields.add(enumName);
          newFields.push({
            key: fieldNames[j],
            value: enumName,
            description: field.description,
            nullable: field.nullable,
          });

          await createEnumFileAsync({
            enumName,
            enums: field.enum,
            enumTemplate,
            Fields,
            outputPath,
          });
        }
      } else if ((field.type as string) === 'array') {
        if (field.items!.$ref) {
          let importName = getNameFromDefinitionString(field.items!.$ref!);

          importFields.add(importName);
          newFields.push({
            key: fieldNames[j],
            value: `${importName}[]`,
            description: field.description,
            nullable: field.nullable,
          });
        } else {
          const type = field.items!.type as string;
          const isDate = field.format === Format.DateTime;
          if (!field.items!.enum) {
            newFields.push({
              key: fieldNames[j],
              value: (isDate ? 'Date' : swaggerTypeMap[type]) + '[]',
              description: field.description,
              nullable: field.nullable,
            });
          } else {
            const enumName =
              interfaceName + capitalizeFirstLetter(fieldNames[j]);

            importFields.add(enumName);
            newFields.push({
              key: fieldNames[j],
              value: enumName + '[]',
              description: field.description,
              nullable: field.nullable,
            });

            await createEnumFileAsync({
              enumName,
              enums: field.items!.enum!,
              enumTemplate,
              Fields,
              outputPath,
            });
          }
        }
      } else if (field.$ref) {
        let importName = getNameFromDefinitionString(field.$ref!);

        importFields.add(importName);
        newFields.push({
          key: fieldNames[j],
          value: importName,
          description: field.description,
          nullable: field.nullable,
        });
      }
    }

    await createInterfaceFileAsync({
      outputPath,
      Fields,
      modelTemplate,
      ModelTemplate,
      Imports,
      importFields,
      newFields,
      interfaceName,
    });
  }

  await new Promise((resolve) => {
    exec(`npx prettier --check "${outputPath}/*" -w`, resolve);
  });
};

const gen = async () => {
  const storeName = getStoreNameFromArgs();

  if (!storeName) {
    return;
  }

  const swagger = await loadSwaggerAsync<SwaggerSchema>();

  await generateModels(swagger.components.schemas);

  const paths = Object.keys(swagger.paths);

  const StoreName = 'StoreName';
  const BaseUrl = 'BaseUrl';
  const StoreDescription = 'StoreDescription';
  const HookDescription = 'HookDescription';

  const endpointName = 'endpointName';
  const endpointPath = 'endpointPath';

  let template = await loadStoreTemplateAsync();

  const methods = Object.keys(swagger.paths[paths[0]]);
  // @ts-ignore
  const methodSchema: MethodSchema = swagger.paths[paths[0]][methods[0]];

  template = template.replaceAll(StoreName, storeName.toLowerCase());

  template = template.replace(BaseUrl, swagger.servers?.[0]?.url);
  template = template.replace(StoreDescription, swagger.info.description);

  template = template.replace(
    endpointName,
    buildEndpointName(methods[0], methodSchema),
  );

  template = template.replace(HookDescription, methodSchema.summary);

  template = template.replace(endpointPath, paths[0]);
};

module.exports = gen
// bootstrap();

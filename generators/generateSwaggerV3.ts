import axios from "axios";

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
  description: string;
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

const loadSwaggerAsync = (): Promise<SwaggerSchema> => {
  const sourceParamIndex = process.argv.indexOf('-s') + 1;
  const source = process.argv[sourceParamIndex];

  if (source.includes('http')) {
    return axios.get(source).then((res) => res.data);
  } else {
    return new Promise((resolve, reject) => {
      fs.readFile(source, (err: any, data: any) => {
        if (err) reject(err);
        resolve(JSON.parse(data.toString()) as SwaggerSchema);
      });
    });
  }
};

const loadStoreTemplateAsync = (): Promise<string> =>
  new Promise((resolve, reject) => {
    fs.readFile(
      './templates/StoreTemplate.ts',
      (err: any, data: any) => {
        if (err) reject(err);
        resolve(data.toString());
      },
    );
  });

const loadModelTemplateAsync = (): Promise<string> =>
  new Promise((resolve, reject) => {
    fs.readFile(
      './templates/ModelTemplate.ts',
      (err: any, data: any) => {
        if (err) reject(err);
        resolve(data.toString());
      },
    );
  });

const loadEnumTemplateAsync = (): Promise<string> =>
  new Promise((resolve, reject) => {
    fs.readFile(
      './templates/EnumTemplate.ts',
      (err: any, data: any) => {
        if (err) reject(err);
        resolve(data.toString());
      },
    );
  });

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

function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

const createInterfaceFileAsync = async ({
  interfaceName,
  Fields,
  outputPath,
  newFields,
  Imports,
  ModelTemplate,
  importFields,
  modelTemplate,
}: {
  modelTemplate: string;
  interfaceName: string;
  ModelTemplate: string;
  Fields: string;
  Imports: string;
  importFields: string[];
  newFields: {
    key: string;
    value: string;
    description?: string;
    nullable?: boolean;
  }[];
  outputPath: string;
}) => {
  let data = modelTemplate.toString();

  data = data.replace(ModelTemplate, interfaceName);

  data = data.replace(
    Imports,
    importFields
      .map((name) => `import { ${name} } from './${name}';`)
      .join('\n'),
  );

  data = data.replace(
    Fields,
    newFields
      .map(
        ({ key, value, description, nullable }) =>
          (description
            ? `/**
            * ${description}
            */\n`
            : '') + (nullable ? `${key}?: ${value};` : `${key}: ${value};`),
      )
      .join('\n'),
  );

  await new Promise((resolve) => {
    fs.writeFile(`${outputPath}/${interfaceName}.ts`, data, (err: string) => {
      if (err) return console.log(err);
      resolve(null);
    });
  });
};

const createEnumFileAsync = async ({
  EnumTemplate,
  enumTemplate,
  enumName,
  Fields,
  enums,
  outputPath,
}: {
  EnumTemplate: string;
  enumTemplate: string;
  enumName: string;
  Fields: string;
  enums: string[];
  outputPath: string;
}) => {
  let data = enumTemplate.toString();

  data = data.replace(EnumTemplate, enumName);

  data = data.replace(
    Fields,
    enums.map((value) => `${value} = "${value}",`).join('\n'),
  );

  data = data.replace('// prettier-ignore', '');

  await new Promise((resolve) => {
    fs.writeFile(`${outputPath}/${enumName}.ts`, data, (err: string) => {
      if (err) return console.log(err);
      resolve(null);
    });
  });
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
  const EnumTemplate = 'EnumTemplate';

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
    const importFields = [];
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

          importFields.push(enumName);
          newFields.push({
            key: fieldNames[j],
            value: enumName,
            description: field.description,
            nullable: field.nullable,
          });

          await createEnumFileAsync({
            EnumTemplate,
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
          importName = importName.split('.')[0];

          importFields.push(importName);
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

            importFields.push(enumName);
            newFields.push({
              key: fieldNames[j],
              value: enumName + '[]',
              description: field.description,
              nullable: field.nullable,
            });

            await createEnumFileAsync({
              EnumTemplate,
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
        importName = importName.split('.')[0];

        importFields.push(importName);
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

  const swagger = await loadSwaggerAsync();

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

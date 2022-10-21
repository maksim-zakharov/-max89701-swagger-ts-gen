import {
  capitalizeFirstLetter,
  createEnumFileAsync, createInterfaceFileAsync,
  loadEnumTemplateAsync,
  loadModelTemplateAsync,
  loadStoreTemplateAsync,
  loadSwaggerAsync
} from "./utils";
import { Property, PropertyFormat, Schema } from "./models";

const fs = require('fs');
const { exec } = require('child_process');

interface SwaggerSchema {
  schemes: any[];
  swagger: string;
  info: Info;
  host: string;
  basePath: string;
  paths: Paths;
  definitions: Definitions;
}

interface Definitions {
  [name: string]: DefinitionItem;
}

interface DefinitionItem {
  type: 'object';
  properties: { [key: string]: Property };
}

interface Info {
  description: string;
  title: string;
  contact: any;
  version: string;
}

interface Paths {
  [path: string]: PathMethods;
}

interface PathMethods {
  post?: MethodSchema;
  get?: MethodSchema;
  delete?: MethodSchema;
}

interface MethodSchema {
  description: string;
  consumes?: string[];
  produces: string[];
  tags: string[];
  summary: string;
  parameters: Parameter[];
  responses: { [key: string]: PostResponse };
}

interface Parameter {
  type?: ParameterType;
  default?: string;
  example?: string;
  description: string;
  name: string;
  in: ParameterIn;
  required?: boolean;
  schema?: Schema;
}

enum ParameterIn {
  Body = 'body',
  FormData = 'formData',
  Header = 'header',
  Path = 'path',
}

enum ParameterType {
  File = 'file',
  Integer = 'integer',
  String = 'string',
}

interface PostResponse {
  description: Description;
  schema: Schema;
}

enum Description {
  BadRequest = 'Bad Request',
  InternalServerError = 'Internal Server Error',
  NoContent = 'No Content',
  Ok = 'OK',
}

const getNameFromDefinitionString = (definitionString: string) =>
  definitionString.replace(/\#\/definitions\//gm, '');

const buildEndpointName = (method: string, methodSchema: MethodSchema) => {
  const methodName = getNameFromDefinitionString(
    methodSchema.responses['200'].schema['$ref']!,
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

const generateModels = async (definitions: Definitions, storeName: string) => {
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

    let data = modelTemplate.toString();

    data = data.replace(ModelTemplate, interfaceName);

    const fieldNames = Object.keys(properties);
    const newFields = [];
    const importFields = new Set<string>();
    for (let j = 0; j < fieldNames.length; j++) {
      const field = properties[fieldNames[j]];
      if (
        field.type &&
        (field.type as string) !== 'array'
      ) {
        const type = field.type as string;
        const isDate = field.format === PropertyFormat.DateTime;
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
          let importName = getNameFromDefinitionString(
            field.items!.$ref!,
          );

          importFields.add(importName);
          newFields.push({
            key: fieldNames[j],
            value: `${importName}[]`,
            description: field.description,
            nullable: field.nullable,
          });
        } else {
          const type = field.items!.type as string;
          const isDate = field.format === PropertyFormat.DateTime;
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
        let importName = getNameFromDefinitionString(
          field.$ref!,
        );

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

  await generateModels(swagger.definitions, storeName);

  // const paths = Object.keys(swagger.paths);
  //
  // const StoreName = 'StoreName';
  // const BaseUrl = 'BaseUrl';
  // const StoreDescription = 'StoreDescription';
  // const HookDescription = 'HookDescription';
  //
  // const endpointName = 'endpointName';
  // const endpointPath = 'endpointPath';
  //
  // let template = await loadStoreTemplateAsync();
  //
  // const methods = Object.keys(swagger.paths[paths[0]]);
  // // @ts-ignore
  // const methodSchema: MethodSchema = swagger.paths[paths[0]][methods[0]];
  //
  // template = template.replaceAll(StoreName, storeName.toLowerCase());
  //
  // template = template.replace(BaseUrl, swagger.host + swagger.basePath);
  // template = template.replace(StoreDescription, swagger.info.description);
  //
  // template = template.replace(
  //   endpointName,
  //   buildEndpointName(methods[0], methodSchema),
  // );
  //
  // template = template.replace(HookDescription, methodSchema.description);

  template = template.replace(endpointPath, paths[0]);
};

module.exports = gen

// bootstrap();

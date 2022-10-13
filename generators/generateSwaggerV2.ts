import axios from "axios";
import path from "path";

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

interface Schema {
  $ref?: string;
  type?: string;
}

interface Property {
  type?: PropertyType;
  items?: Schema;
  $ref?: string;
}

enum PropertyType {
  Boolean = 'boolean',
  Integer = 'integer',
  Number = 'number',
  String = 'string',
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
      path.resolve(__dirname, '../templates/StoreTemplate.ts'),
      (err: any, data: any) => {
        if (err) reject(err);
        resolve(data.toString());
      },
    );
  });

const loadModelTemplateAsync = (): Promise<string> =>
  new Promise((resolve, reject) => {
    fs.readFile(
      path.resolve(__dirname, '../templates/ModelTemplate.ts'),
      (err: any, data: any) => {
        if (err) reject(err);
        resolve(data.toString());
      },
    );
  });

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

  const objectNames = Object.keys(definitions);

  for (let i = 0; i < objectNames.length; i++) {
    let interfaceName = objectNames[i];
    const properties = definitions[interfaceName].properties;

    if (definitions[interfaceName].type !== 'object') continue;

    let data = modelTemplate.toString();

    data = data.replace(ModelTemplate, interfaceName);

    const fieldNames = Object.keys(properties);
    const newFields = [];
    const importFields = new Set();
    for (let j = 0; j < fieldNames.length; j++) {
      if (
        properties[fieldNames[j]].type &&
        (properties[fieldNames[j]].type as string) !== 'array'
      ) {
        const type = properties[fieldNames[j]].type as string;
        newFields.push({ key: fieldNames[j], value: swaggerTypeMap[type] });
      } else if ((properties[fieldNames[j]].type as string) === 'array') {
        if (properties[fieldNames[j]].items!.$ref) {
          let importName = getNameFromDefinitionString(
            properties[fieldNames[j]].items!.$ref!,
          );

          importFields.add(importName);
          newFields.push({ key: fieldNames[j], value: `${importName}[]` });
        } else {
          const type = properties[fieldNames[j]].items!.type as string;
          newFields.push({
            key: fieldNames[j],
            value: `${swaggerTypeMap[type]}[]`,
          });
        }
      } else if (properties[fieldNames[j]].$ref) {
        let importName = getNameFromDefinitionString(
          properties[fieldNames[j]].$ref!,
        );

        importFields.add(importName);
        newFields.push({ key: fieldNames[j], value: importName });
      }
    }

    data = data.replace(
      Imports,
      Array.from(importFields)
        .map((name) => `import { ${name} } from './${name}';`)
        .join('\n'),
    );

    data = data.replace(
      Fields,
      newFields.map(({ key, value }) => `${key}: ${value};`).join('\n'),
    );

    await new Promise((resolve) => {
      fs.writeFile(`${outputPath}/${interfaceName}.ts`, data, (err: string) => {
        if (err) return console.log(err);
        resolve(null);
      });
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

  await generateModels(swagger.definitions, storeName);

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

  template = template.replace(BaseUrl, swagger.host + swagger.basePath);
  template = template.replace(StoreDescription, swagger.info.description);

  template = template.replace(
    endpointName,
    buildEndpointName(methods[0], methodSchema),
  );

  template = template.replace(HookDescription, methodSchema.description);

  template = template.replace(endpointPath, paths[0]);
};

module.exports = gen

// bootstrap();

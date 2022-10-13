import fs from "fs";
import axios from "axios";
import path from "path";

export

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
  importFields: Set<string>;
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
    Array.from(importFields)
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
    fs.writeFile(`${outputPath}/${interfaceName}.ts`, data, (err) => {
      if (err) return console.log(err);
      resolve(null);
    });
  });
};

export function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export const createEnumFileAsync = async ({
                                     enumTemplate,
                                     enumName,
                                     Fields,
                                     enums,
                                     outputPath,
                                   }: {
  enumTemplate: string;
  enumName: string;
  Fields: string;
  enums: string[];
  outputPath: string;
}) => {
  const EnumTemplate = 'EnumTemplate';

  let data = enumTemplate.toString();

  data = data.replace(EnumTemplate, enumName);

  data = data.replace(
    Fields,
    enums.map((value) => `${value} = "${value}",`).join('\n'),
  );

  data = data.replace('// prettier-ignore', '');

  await new Promise((resolve) => {
    fs.writeFile(`${outputPath}/${enumName}.ts`, data, (err) => {
      if (err) return console.log(err);
      resolve(null);
    });
  });
};



export const loadSwaggerAsync = <SwaggerSchema,>(): Promise<SwaggerSchema> => {
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

export const loadStoreTemplateAsync = (): Promise<string> =>
  new Promise((resolve, reject) => {
    fs.readFile(
      path.resolve(__dirname, '../templates/StoreTemplate.ts'),
      (err: any, data: any) => {
        if (err) reject(err);
        resolve(data.toString());
      },
    );
  });

export const loadModelTemplateAsync = (): Promise<string> =>
  new Promise((resolve, reject) => {
    fs.readFile(
      path.resolve(__dirname, '../templates/ModelTemplate.ts'),
      (err: any, data: any) => {
        if (err) reject(err);
        resolve(data.toString());
      },
    );
  });

export const loadEnumTemplateAsync = (): Promise<string> =>
  new Promise((resolve, reject) => {
    fs.readFile(
      path.resolve(__dirname, '../templates/EnumTemplate.ts'),
      (err: any, data: any) => {
        if (err) reject(err);
        resolve(data.toString());
      },
    );
  });

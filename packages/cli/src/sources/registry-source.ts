import { promisify } from 'util';
import { join, dirname, basename } from 'path';
import {
  createReadStream,
  ensureDir,
  pathExists,
  move,
  readFile
} from 'fs-extra';
import { extract } from 'tar';
import {
  download,
  checksum as getChecksum,
  has,
  isString,
  tmpFile
} from '../utils';
import { clone, pull } from '../utils/git';
import { Config } from '../config';
import { Dependency, Feature, Version } from '../manifest';
import {
  Registration,
  getRegistrationId,
  getRegistrationSource
} from './registration';
import { Source } from './source';

interface RegistryDependency extends Dependency {
  version: Version;
}

const registry: Source = {
  match(type) {
    if (isString(type)) return type === 'registry';
    return isRegistryDependency(type);
  },

  async update(config: Config) {
    const { local, remote } = config.registry;

    if (!await pathExists(local)) {
      const dir = dirname(local);
      await ensureDir(dir);
      await clone(remote, basename(local), dir);
    }

    await pull(local);
  },

  async resolve(
    config: Config,
    dependency: RegistryDependency
  ): Promise<Registration[]> {
    const { name } = dependency;
    const path = getPath(config, name);

    if (!await pathExists(path)) {
      throw new Error(`"${name}" was not found in the registry`);
    }

    const data = await readFile(path, 'utf8');
    const registrations: Registration[] = data
      .split(/\r?\n/)
      .map((line: string) => JSON.parse(line))
      .filter((value: any) => value && !value.yanked)
      .map(parseRegistration);

    return registrations;
  },

  async fetch(config: Config, registration: Registration): Promise<string> {
    const url = config.resolveRemotePackage(registration);
    const file = config.resolveLocalPackage(registration);

    const [_, checksum] = registration.source.split('#', 2);

    if (!await pathExists(file)) {
      const unverifiedFile = await tmpFile();
      await download(url, unverifiedFile);

      const comparison = await getChecksum(unverifiedFile);
      if (comparison !== checksum) {
        throw new Error(`Invalid checksum for ${registration.id}`);
      }

      await move(unverifiedFile, file);
    }

    const src = config.resolveSource(registration);

    await ensureDir(src);
    await extract({ file, cwd: src });

    return src;
  }
};
export default registry;

export function parseRegistration(value: any): Registration {
  const { name, vers: version, cksum: checksum } = value;

  const dependencies: RegistryDependency[] = value.deps.map((dep: any) => {
    const { name, req, features, optional, defaultFeatures } = dep;
    const dependency: RegistryDependency = {
      name,
      version: req,
      features,
      optional,
      defaultFeatures
    };

    return dependency;
  });

  const features: Feature[] = [];
  for (const [name, dependencies] of Object.entries(value.features)) {
    features.push({ name, dependencies, src: [], references: [] });
  }

  return {
    id: getRegistrationId(name, version),
    source: getRegistrationSource(
      'registry',
      'https://github.com/vba-blocks/registry',
      checksum
    ),
    name,
    version,
    dependencies,
    features
  };
}

function isRegistryDependency(
  dependency: Dependency
): dependency is RegistryDependency {
  return has(dependency, 'version');
}

function getPath(config: Config, name: string): string {
  let parts;
  if (name.length === 1) {
    parts = ['1', name];
  } else if (name.length === 2) {
    parts = ['2', name];
  } else if (name.length === 3) {
    parts = ['3', name.substring(0, 1)];
  } else {
    parts = [name.substring(0, 2), name.substring(2, 4)];
  }

  return join(config.registry.local, ...parts, name);
}
import { Version } from '../version';
import { has, isString } from '../utils';

export interface Dependency {
  name: string;
  default_features: boolean;
  features: string[];

  version?: Version;

  path?: string;

  git?: string;
  tag?: string;
  branch?: string;
  rev?: string;
}

const EXAMPLE = `Example vba-block.toml:

  [dependencies]
  a = "^1.0.0"
  b = { version = "^0.1.0", optional = true }
  c = { path = "packages/c" }
  d = { git = "https://github.com/author/d" }
  e = { git = "https://github.com/author/e", branch = "next" }
  f = { git = "https://github.com/author/f", tag = "v1.0.0" }
  g = { git = "https://github.com/author/g", rev = "a1b2c3d4" }

  [dependencies.h]
  version = "^2.0.0"
  default-features = false
  features ["a", "b"]`;

export function parseDependencies(value: any): Dependency[] {
  return Object.entries(value).map(([name, value]) =>
    parseDependency(name, value)
  );
}

export function parseDependency(
  name: string,
  value: Version | any
): Dependency {
  if (isString(value)) value = { version: value };

  const { version, path, git, tag, branch = 'master', rev } = value;
  if (!version && !path && !git) {
    throw new Error(
      `Invalid dependency "${name}", no version, path, or git specified. ${EXAMPLE}`
    );
  }

  let dependency;
  if (version) dependency = { version };
  else if (path) dependency = { path };
  else if (git) {
    if (rev) dependency = { git, rev };
    else if (tag) dependency = { git, tag };
    else dependency = { git, branch };
  }

  const default_features = has(value, 'default-features')
    ? value['default-features']
    : true;
  const features = value.features || [];

  return Object.assign({ name, features, default_features }, dependency);
}

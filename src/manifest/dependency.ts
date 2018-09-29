import { satisfies as satisfiesSemver } from 'semver';
import { Version } from './version';
import { join, trailing } from '../utils/path';
import { isString } from '../utils/is';
import has from '../utils/has';
import { manifestOk } from '../errors';
import { loadManifest } from '.';

export interface DependencyDetails {
  name: string;
  version?: string;
}

export interface RegistryDependency extends DependencyDetails {
  registry: string;
  version: string;
}

export interface PathDependency extends DependencyDetails {
  path: string;
}

export interface GitDependency extends DependencyDetails {
  git: string;
  tag?: string;
  branch?: string;
  rev?: string;
}

export type Dependency = RegistryDependency | PathDependency | GitDependency;

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
  version = "^2.0.0"`;

export function parseDependencies(value: any, dir: string): Dependency[] {
  return Object.entries(value).map(([name, value]) =>
    parseDependency(name, value, dir)
  );
}

export function parseDependency(
  name: string,
  value: Version | any,
  dir: string
): Dependency {
  if (isString(value)) value = { version: value };

  const {
    registry = 'vba-blocks',
    version,
    path,
    git,
    tag,
    branch = 'master',
    rev
  }: {
    registry?: string;
    version?: string;
    path?: string;
    git?: string;
    tag?: string;
    branch?: string;
    rev?: string;
  } = value;

  manifestOk(
    version || path || git,
    `Invalid dependency "${name}", no version, path, or git specified. ${EXAMPLE}`
  );

  const details = { name };

  if (version) {
    return { ...details, registry, version };
  } else if (path) {
    return { ...details, path: trailing(join(dir, path)) };
  } else {
    if (rev) return { ...details, git: git!, rev };
    else if (tag) return { ...details, git: git!, tag };
    else return { ...details, git: git!, branch };
  }
}

export async function satisfies(
  value: Dependency,
  comparison: Dependency
): Promise<boolean> {
  if (isRegistryDependency(comparison)) {
    // Note: Order matters in value / comparison
    //
    // value = manifest / user value
    // comparison = lockfile value (more specific)
    return (
      isRegistryDependency(value) &&
      satisfiesSemver(comparison.version, value.version)
    );
  } else if (isPathDependency(comparison)) {
    if (!isPathDependency(value)) return false;
    if (value.path !== comparison.path) return false;

    // Check if current version of path dependency matches
    const manifest = await loadManifest(value.path);
    return manifest.version === comparison.version!;
  } else if (isGitDependency(comparison)) {
    if (!isGitDependency(value)) return false;

    if (has(value, 'rev') && has(comparison, 'rev'))
      return value.rev === comparison.rev;
    if (has(value, 'tag') && has(comparison, 'tag'))
      return value.tag === comparison.tag;
    if (has(value, 'branch') && has(comparison, 'branch'))
      return value.branch === comparison.branch;
  }

  return false;
}

export function isRegistryDependency(
  dependency: Dependency
): dependency is RegistryDependency {
  return has(dependency, 'registry');
}

export function isPathDependency(
  dependency: Dependency
): dependency is PathDependency {
  return has(dependency, 'path');
}

export function isGitDependency(
  dependency: Dependency
): dependency is GitDependency {
  return has(dependency, 'git');
}

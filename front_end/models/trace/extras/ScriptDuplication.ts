// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as SDK from '../../../core/sdk/sdk.js';
import type * as Handlers from '../handlers/handlers.js';

const RELATIVE_SIZE_THRESHOLD = 0.1;
const ABSOLUTE_SIZE_THRESHOLD_BYTES = 1024 * 0.5;

type GeneratedFileSizes = {
  errorMessage: string,
}|{files: Record<string, number>, unmappedBytes: number, totalBytes: number};

/**
 * Using a script's contents and source map, attribute every generated byte to an authored source file.
 */
export function computeGeneratedFileSizes(script: Handlers.ModelHandlers.Scripts.Script): GeneratedFileSizes {
  if (!script.sourceMap) {
    throw new Error('expected source map');
  }

  const map = script.sourceMap;
  const content = script.content ?? '';
  const contentLength = content.length;
  const lines = content.split('\n');
  const files: Record<string, number> = {};
  const totalBytes = contentLength;
  let unmappedBytes = totalBytes;

  const lastGeneratedColumnMap = computeLastGeneratedColumnMap(script.sourceMap);

  for (const mapping of map.mappings()) {
    const source = mapping.sourceURL;
    const lineNum = mapping.lineNumber;
    const colNum = mapping.columnNumber;
    const lastColNum = lastGeneratedColumnMap.get(mapping);

    // Webpack sometimes emits null mappings.
    // https://github.com/mozilla/source-map/pull/303
    if (!source) {
      continue;
    }

    // Lines and columns are zero-based indices. Visually, lines are shown as a 1-based index.

    const line = lines[lineNum];
    if (line === null || line === undefined) {
      const errorMessage = `${map.url()} mapping for line out of bounds: ${lineNum + 1}`;
      return {errorMessage};
    }

    if (colNum > line.length) {
      const errorMessage = `${map.url()} mapping for column out of bounds: ${lineNum + 1}:${colNum}`;
      return {errorMessage};
    }

    let mappingLength = 0;
    if (lastColNum !== undefined) {
      if (lastColNum > line.length) {
        const errorMessage = `${map.url()} mapping for last column out of bounds: ${lineNum + 1}:${lastColNum}`;
        return {errorMessage};
      }
      mappingLength = lastColNum - colNum;
    } else {
      // Add +1 to account for the newline.
      mappingLength = line.length - colNum + 1;
    }
    files[source] = (files[source] || 0) + mappingLength;
    unmappedBytes -= mappingLength;
  }

  return {
    files,
    unmappedBytes,
    totalBytes,
  };
}

interface SourceData {
  source: string;
  resourceSize: number;
}

export function normalizeSource(source: string): string {
  // Trim trailing question mark - b/c webpack.
  source = source.replace(/\?$/, '');

  // Normalize paths for dependencies by only keeping everything after the last `node_modules`.
  const lastNodeModulesIndex = source.lastIndexOf('node_modules');
  if (lastNodeModulesIndex !== -1) {
    source = source.substring(lastNodeModulesIndex);
  }

  return source;
}

function shouldIgnoreSource(source: string): boolean {
  // Ignore bundle overhead.
  if (source.includes('webpack/bootstrap')) {
    return true;
  }
  if (source.includes('(webpack)/buildin')) {
    return true;
  }

  // Ignore webpack module shims, i.e. aliases of the form `module.exports = window.jQuery`
  if (source.includes('external ')) {
    return true;
  }

  return false;
}

/**
 * The key is a source map `sources` entry, but normalized via `normalizeSource`.
 *
 * The value is an array with an entry for every script that has a source map which
 * denotes that this source was used, along with the estimated resource size it takes
 * up in the script.
 */
export type ScriptDuplication = Map<string, Array<{scriptId: string, resourceSize: number}>>;

/**
 * Sorts each array within @see ScriptDuplication by resource size, and drops information
 * on sources that are too small.
 */
export function normalizeDuplication(duplication: ScriptDuplication): void {
  for (const [key, originalSourceData] of duplication.entries()) {
    let sourceData = originalSourceData;

    // Sort by resource size.
    sourceData.sort((a, b) => b.resourceSize - a.resourceSize);

    // Remove modules smaller than a % size of largest.
    if (sourceData.length > 1) {
      const largestResourceSize = sourceData[0].resourceSize;
      sourceData = sourceData.filter(data => {
        const percentSize = data.resourceSize / largestResourceSize;
        return percentSize >= RELATIVE_SIZE_THRESHOLD;
      });
    }

    // Remove modules smaller than an absolute threshold.
    sourceData = sourceData.filter(data => data.resourceSize >= ABSOLUTE_SIZE_THRESHOLD_BYTES);

    // Delete any that now don't have multiple source data entries.
    if (sourceData.length > 1) {
      duplication.set(key, sourceData);
    } else {
      duplication.delete(key);
    }
  }
}

function computeLastGeneratedColumnMap(map: SDK.SourceMap.SourceMap): Map<SDK.SourceMap.SourceMapEntry, number> {
  const result = new Map<SDK.SourceMap.SourceMapEntry, number>();

  const mappings = map.mappings();
  for (let i = 0; i < mappings.length - 1; i++) {
    const mapping = mappings[i];
    const nextMapping = mappings[i + 1];
    if (mapping.lineNumber === nextMapping.lineNumber) {
      result.set(mapping, nextMapping.columnNumber);
    }
  }

  // Now, all but the last mapping on each line will have 'lastColumnNumber' set to a number.
  return result;
}

/**
 * Returns a @see ScriptDuplication for the given collection of script contents + source maps.
 */
export function computeScriptDuplication(scriptsData: Handlers.ModelHandlers.Scripts.ScriptsData): ScriptDuplication {
  const sizesMap = new Map<Handlers.ModelHandlers.Scripts.Script, GeneratedFileSizes>();
  for (const script of scriptsData.scripts.values()) {
    if (script.content && script.sourceMap) {
      sizesMap.set(script, computeGeneratedFileSizes(script));
    }
  }

  const sourceDatasMap = new Map<Handlers.ModelHandlers.Scripts.Script, SourceData[]>();

  // Determine size of each `sources` entry.
  for (const [script, sizes] of sizesMap) {
    if (!script.sourceMap) {
      continue;
    }

    if ('errorMessage' in sizes) {
      console.error(sizes.errorMessage);
      continue;
    }

    const sourceDataArray: SourceData[] = [];
    sourceDatasMap.set(script, sourceDataArray);

    const sources = script.sourceMap.sourceURLs();
    for (let i = 0; i < sources.length; i++) {
      if (shouldIgnoreSource(sources[i])) {
        continue;
      }

      const sourceSize = sizes.files[sources[i]];
      sourceDataArray.push({
        source: normalizeSource(sources[i]),
        resourceSize: sourceSize,
      });
    }
  }

  const moduleNameToSourceData: ScriptDuplication = new Map();
  for (const [script, sourceDataArray] of sourceDatasMap) {
    for (const sourceData of sourceDataArray) {
      let data = moduleNameToSourceData.get(sourceData.source);
      if (!data) {
        data = [];
        moduleNameToSourceData.set(sourceData.source, data);
      }
      data.push({
        scriptId: script.scriptId,
        resourceSize: sourceData.resourceSize,
      });
    }
  }

  normalizeDuplication(moduleNameToSourceData);
  return moduleNameToSourceData;
}

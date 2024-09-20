// Copyright 2022 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';

import {HandlerState} from './types.js';

/**
 * IMPORTANT!
 * See UserTimings.md in this directory for some handy documentation on
 * UserTimings and the trace events we parse currently.
 **/
let syntheticEvents: Types.Events.SyntheticEventPair<Types.Events.PairableAsync>[] = [];
const performanceMeasureEvents: Types.Events.PerformanceMeasure[] = [];
const performanceMarkEvents: Types.Events.PerformanceMark[] = [];

const consoleTimings: (Types.Events.ConsoleTimeBegin|Types.Events.ConsoleTimeEnd)[] = [];

const timestampEvents: Types.Events.TimeStamp[] = [];

export interface UserTimingsData {
  /**
   * Events triggered with the performance.measure() API.
   * https://developer.mozilla.org/en-US/docs/Web/API/Performance/measure
   */
  performanceMeasures: readonly Types.Events.SyntheticUserTimingPair[];
  /**
   * Events triggered with the performance.mark() API.
   * https://developer.mozilla.org/en-US/docs/Web/API/Performance/mark
   */
  performanceMarks: readonly Types.Events.PerformanceMark[];
  /**
   * Events triggered with the console.time(), console.timeEnd() and
   * console.timeLog() API.
   * https://developer.mozilla.org/en-US/docs/Web/API/console/time
   */
  consoleTimings: readonly Types.Events.SyntheticConsoleTimingPair[];
  /**
   * Events triggered with the console.timeStamp() API
   * https://developer.mozilla.org/en-US/docs/Web/API/console/timeStamp
   */
  timestampEvents: readonly Types.Events.TimeStamp[];
}
let handlerState = HandlerState.UNINITIALIZED;

export function reset(): void {
  syntheticEvents.length = 0;
  performanceMeasureEvents.length = 0;
  performanceMarkEvents.length = 0;
  consoleTimings.length = 0;
  timestampEvents.length = 0;
  handlerState = HandlerState.INITIALIZED;
}

const resourceTimingNames = [
  'workerStart',
  'redirectStart',
  'redirectEnd',
  'fetchStart',
  'domainLookupStart',
  'domainLookupEnd',
  'connectStart',
  'connectEnd',
  'secureConnectionStart',
  'requestStart',
  'responseStart',
  'responseEnd',
];
const navTimingNames = [
  'navigationStart',
  'unloadEventStart',
  'unloadEventEnd',
  'redirectStart',
  'redirectEnd',
  'fetchStart',
  'commitNavigationEnd',
  'domainLookupStart',
  'domainLookupEnd',
  'connectStart',
  'connectEnd',
  'secureConnectionStart',
  'requestStart',
  'responseStart',
  'responseEnd',
  'domLoading',
  'domInteractive',
  'domContentLoadedEventStart',
  'domContentLoadedEventEnd',
  'domComplete',
  'loadEventStart',
  'loadEventEnd',
];
// These are events dispatched under the blink.user_timing category
// but that the user didn't add. Filter them out so that they do not
// Appear in the timings track (they still appear in the main thread
// flame chart).
const ignoredNames = [...resourceTimingNames, ...navTimingNames];

export function handleEvent(event: Types.Events.Event): void {
  if (handlerState !== HandlerState.INITIALIZED) {
    throw new Error('UserTimings handler is not initialized');
  }

  if (ignoredNames.includes(event.name)) {
    return;
  }

  if (Types.Events.isPerformanceMeasure(event)) {
    performanceMeasureEvents.push(event);
    return;
  }
  if (Types.Events.isPerformanceMark(event)) {
    performanceMarkEvents.push(event);
  }
  if (Types.Events.isConsoleTime(event)) {
    consoleTimings.push(event);
  }
  if (Types.Events.isTimeStamp(event)) {
    timestampEvents.push(event);
  }
}

export async function finalize(): Promise<void> {
  if (handlerState !== HandlerState.INITIALIZED) {
    throw new Error('UserTimings handler is not initialized');
  }

  const asyncEvents = [...performanceMeasureEvents, ...consoleTimings];
  syntheticEvents = Helpers.Trace.createMatchedSortedSyntheticEvents(asyncEvents);
  handlerState = HandlerState.FINALIZED;
}

export function data(): UserTimingsData {
  if (handlerState !== HandlerState.FINALIZED) {
    throw new Error('UserTimings handler is not finalized');
  }

  return {
    performanceMeasures: syntheticEvents.filter(e => e.cat === 'blink.user_timing') as
        Types.Events.SyntheticUserTimingPair[],
    consoleTimings: syntheticEvents.filter(e => e.cat === 'blink.console') as Types.Events.SyntheticConsoleTimingPair[],
    // TODO(crbug/41484172): UserTimingsHandler.test.ts fails if this is not copied.
    performanceMarks: [...performanceMarkEvents],
    timestampEvents: [...timestampEvents],
  };
}

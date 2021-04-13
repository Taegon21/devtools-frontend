// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as FrontendHelpers from '../../../test/unittests/front_end/helpers/EnvironmentHelpers.js';
import * as ComponentHelpers from '../../component_helpers/component_helpers.js';
import * as DataGrid from '../../ui/components/data_grid/data_grid.js';

await ComponentHelpers.ComponentServerSetup.setup();
await FrontendHelpers.initializeGlobalVars();

const component = new DataGrid.DataGrid.DataGrid();

component.data = {
  columns: [
    {id: 'key', title: 'Key', widthWeighting: 1, visible: true, hideable: false, sortable: true},
    {id: 'value', title: 'Value', widthWeighting: 1, visible: true, hideable: true},
  ],
  rows: [
    {cells: [{columnId: 'key', value: 'Bravo', title: 'Bravo'}, {columnId: 'value', value: 'Letter B'}]},
    {cells: [{columnId: 'key', value: 'Alpha', title: 'Alpha'}, {columnId: 'value', value: 'Letter A'}]},
    {cells: [{columnId: 'key', value: 'Charlie', title: 'Charlie'}, {columnId: 'value', value: 'Letter C'}]},
  ],
  activeSort: null,
};

document.getElementById('container')?.appendChild(component);

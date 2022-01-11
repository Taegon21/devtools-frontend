// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
const fs = require('fs');
const path = require('path');
const [, , buildTimestamp, targetGenDir, targetName, ...imageSources] = process.argv;

/**
 * @param {string} fileName
 */
function generateCSSVariableDefinition(fileName) {
  // The `style` referenced here is the `:root` style rule in the constructed stylesheet down below
  return `style.setProperty('--image-file-${
      // We have to remove the `src/` part from any SVG file names for the CSS variables, while
      // we still use the full URL for the meta.url import. That's because the rollup-plugin-import-meta-assets
      // rewrites the image URLs to the new location, but doesn't modify the generated CSS variable name
      fileName.replace('src\/', '').replace(path.extname(fileName), '')}', 'url(\\"' + new URL('./${
      fileName}', import.meta.url).toString() + '\\")');`;
}

const CURRENT_YEAR = new Date(Number(buildTimestamp) * 1000).getFullYear();
const fileContent = `
// Copyright ${CURRENT_YEAR} The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
const sheet = new CSSStyleSheet();
sheet.replaceSync(':root {}');
const style = sheet.cssRules[0].style;

${imageSources.map(generateCSSVariableDefinition).join('\n')}

document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
`;

fs.writeFileSync(path.join(targetGenDir, 'Images.prebundle.js'), fileContent, {encoding: 'utf-8'});

const tsconfigContent = `
{
    "compilerOptions": {
        "composite": true
    },
    "files": [
        "Images.js"
    ]
}
`;

fs.writeFileSync(path.join(targetGenDir, `${targetName}-tsconfig.json`), tsconfigContent, {encoding: 'utf-8'});

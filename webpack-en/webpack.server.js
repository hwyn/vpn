const path = require('path');
const baseDir = process.cwd();

module.exports = (a, b, isDebug) => {
  return {
    ...isDebug ? { entryFile: 'src/en.ts' } : { },
    entry: {
      en: path.join(baseDir, 'src/en.ts')
    }
  }
};
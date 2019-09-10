const path = require('path');
const baseDir = process.cwd();

module.exports = (a, b, isDebug) => {
  return {
    ...isDebug ? { entryFile: 'src/cn.ts' } : { },
    entry: {
      cn: path.join(baseDir, 'src/cn.ts')
    }
  }
};
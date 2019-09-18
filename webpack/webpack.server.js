const path = require('path');
const baseDir = process.cwd();

module.exports = (a, b, isDebug) => {
  return {
    entry: {
      cn: path.join(baseDir, 'src/cn.ts'),
      en: path.join(baseDir, 'src/en.ts')
    },
    isNodExternals: false
  }
};
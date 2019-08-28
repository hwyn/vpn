const path = require('path');
const baseDir = process.cwd();

module.exports = () => {
  return {
    entryFile: 'src/cn.ts',
    entry: {
      cn: path.join(baseDir, 'src/cn.ts')
    }
  }
};
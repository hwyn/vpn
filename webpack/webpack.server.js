const path = require('path');
const baseDir = process.cwd();

module.exports = () => {
  return {
    entryFile: 'src/index.ts',
    entry: {
      cn: path.join(baseDir, 'src/index.ts')
    }
  }
};
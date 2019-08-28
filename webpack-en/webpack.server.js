const path = require('path');
const baseDir = process.cwd();

module.exports = () => {
  return {
    entryFile: 'src/en.ts',
    entry: {
      en: path.join(baseDir, 'src/en.ts')
    }
  }
};
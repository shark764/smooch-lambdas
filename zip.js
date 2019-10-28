const fs = require('fs');
const { resolve } = require('path');
const { join } = require('path');
const cp = require('child_process');

// get library path
const lib = resolve(__dirname);
fs.readdirSync(lib)
  .forEach((mod) => {
    const modPath = join(lib, mod);
    // ensure path has package.json
    if (!fs.existsSync(join(modPath, 'package.json'))) return;

    // install folder
    cp.execSync(`zip -r ${mod} *`, { cwd: modPath });
  });

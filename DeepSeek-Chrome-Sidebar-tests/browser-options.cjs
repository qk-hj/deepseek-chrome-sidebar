const fs = require('fs');
module.exports = () => {
  if (!process.env.CHROME_PATH) return {headless:true};
  if (!fs.existsSync(process.env.CHROME_PATH)) throw new Error('CHROME_PATH does not point to an existing browser executable.');
  return {headless:true,executablePath:process.env.CHROME_PATH};
};

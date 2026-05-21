const initConfig = require('./initConfig');
const initFiles = require('./initFiles');
const initDockerSecrets = require('./initDockerSecrets');
const initSecret = require('./initSecret');
const normalizeTheme = require('./normalizeTheme');

const initApp = async () => {
  initDockerSecrets();
  initSecret();
  await initFiles();
  await initConfig();
  await normalizeTheme();
};

module.exports = initApp;

const TEST_CONFIG_HOME = './.tmp-test-config';
if (process.platform === 'win32') {
  process.env.APPDATA = TEST_CONFIG_HOME;
} else {
  process.env.XDG_CONFIG_HOME = TEST_CONFIG_HOME;
}
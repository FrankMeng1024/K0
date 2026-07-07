// Sprint 14 R2 build: 必需 babel config
// react-native-worklets/plugin 必须放最后（Reanimated 4.x + worklets 0.10.x 要求）
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  };
};

import React from 'react';
import { AppRegistry, NativeModules, Platform, Text, View } from 'react-native';

const App = () => {
  const version = NativeModules.PlatformConstants
    ? NativeModules.PlatformConstants.reactNativeVersion
    : null;

  NativeModules.RN0594Probe.ping()
    .then(value => console.log('RN0594_NATIVE_PROMISE_OK:' + value))
    .catch(error => console.log('RN0594_NATIVE_PROMISE_ERROR:' + String(error)));

  console.log('RN0594_PLATFORM_VERSION:' + JSON.stringify(version));
  console.log('RN0594_PLATFORM_OS:' + Platform.OS);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>CortanaGPT — RN 0.59.4 compatibility probe</Text>
      <Text>{JSON.stringify(version)}</Text>
    </View>
  );
};

AppRegistry.registerComponent('CortanaRN0594Compat', () => App);

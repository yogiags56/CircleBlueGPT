import React from 'react';
import {
  AppRegistry,
  NativeEventEmitter,
  NativeModules,
  Platform,
  Text,
  View,
} from 'react-native';

const App = () => {
  const version = NativeModules.PlatformConstants
    ? NativeModules.PlatformConstants.reactNativeVersion
    : null;

  if (version && version.major === 0 && version.minor === 59 && version.patch === 4) {
    console.log('RN0594_NATIVE_VERSION_OK:' + JSON.stringify(version));
  } else {
    console.log('RN0594_NATIVE_VERSION_MISMATCH:' + JSON.stringify(version));
  }

  const native = NativeModules.RN0594Probe;
  const events = new NativeEventEmitter(native);
  events.addListener('rn0594Probe', value => {
    console.log('RN0594_EVENT_OK:' + value);
  });

  native.ping()
    .then(value => console.log('RN0594_NATIVE_PROMISE_OK:' + value))
    .catch(() => console.log('RN0594_NATIVE_PROMISE_ERROR'));

  native.fail()
    .then(() => console.log('RN0594_NATIVE_REJECT_UNEXPECTED_RESOLVE'))
    .catch(() => console.log('RN0594_NATIVE_PROMISE_REJECT_OK'));

  native.emitProbeEvent();

  console.log('RN0594_PLATFORM_OS:' + Platform.OS);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>CortanaGPT — RN 0.59.4 compatibility probe</Text>
      <Text>{JSON.stringify(version)}</Text>
    </View>
  );
};

AppRegistry.registerComponent('CortanaRN0594Compat', () => App);

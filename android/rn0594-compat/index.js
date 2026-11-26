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

  const cortanaBridge = NativeModules.CortanaBridge;
  cortanaBridge.getBridgeStatus()
    .then(status => console.log('CORTANA_BRIDGE_MODULE_OK:' + status))
    .catch(error => console.log('CORTANA_BRIDGE_MODULE_ERROR:' + error.code));

  cortanaBridge.sendText('CI fail-closed probe')
    .then(() => console.log('CORTANA_BRIDGE_FAIL_CLOSED_UNEXPECTED_RESOLVE'))
    .catch(error => {
      if (error.code === 'E_BRIDGE_UNAVAILABLE') {
        console.log('CORTANA_BRIDGE_FAIL_CLOSED_OK');
      } else {
        console.log('CORTANA_BRIDGE_FAIL_CLOSED_UNEXPECTED:' + error.code);
      }
    });

  cortanaBridge.cancelListening()
    .then(cancelled => console.log('CORTANA_BRIDGE_CANCEL_IDLE_OK:' + String(cancelled)))
    .catch(error => console.log('CORTANA_BRIDGE_CANCEL_ERROR:' + error.code));

  cortanaBridge.resetConversation()
    .then(() => console.log('CORTANA_BRIDGE_RESET_IDLE_OK'))
    .catch(error => console.log('CORTANA_BRIDGE_RESET_ERROR:' + error.code));

  cortanaBridge.onUserManualInput();

  cortanaBridge.getEnrollmentPublicKey()
    .then(identity => {
      if (identity.kty !== 'EC' || identity.crv !== 'P-256' ||
          !/^[A-Za-z0-9_-]{43}$/.test(identity.x) ||
          !/^[A-Za-z0-9_-]{43}$/.test(identity.y) ||
          !/^[A-Za-z0-9_-]{43}$/.test(identity.thumbprint)) {
        throw new Error('INVALID_PUBLIC_IDENTITY');
      }
      console.log('CORTANA_ENROLLMENT_PUBLIC_KEY_OK');
      return cortanaBridge.getEnrollmentPublicKey().then(second => {
        if (second.thumbprint !== identity.thumbprint || second.x !== identity.x || second.y !== identity.y) {
          throw new Error('KEY_IDENTITY_NOT_STABLE');
        }
        console.log('CORTANA_ENROLLMENT_KEY_PERSISTENCE_OK');
        return cortanaBridge.signEnrollmentChallenge('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      });
    })
    .then(signature => {
      if (!/^[A-Za-z0-9_-]{80,100}$/.test(signature)) throw new Error('INVALID_SIGNATURE_ENCODING');
      console.log('CORTANA_ENROLLMENT_SIGNATURE_OK');
    })
    .catch(error => console.log('CORTANA_ENROLLMENT_KEY_ERROR:' + error.code + ':' + error.message));

  cortanaBridge.signEnrollmentChallenge('invalid', 'invalid')
    .then(() => console.log('CORTANA_ENROLLMENT_INVALID_PROOF_UNEXPECTED_RESOLVE'))
    .catch(error => {
      if (error.code === 'E_ENROLLMENT_PROOF') console.log('CORTANA_ENROLLMENT_INPUT_VALIDATION_OK');
      else console.log('CORTANA_ENROLLMENT_INPUT_VALIDATION_ERROR:' + error.code);
    });
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

import 'expo-dev-client';
// Must be the very first import - react-native-gesture-handler needs to set
// up its native event handling before anything else runs, especially on Android.
import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);

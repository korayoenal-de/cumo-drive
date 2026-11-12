// Ersatz für native Module beim Nachspielen am Schreibtisch (expo-speech, AsyncStorage, react-native)
const any: any = new Proxy(function () {}, { get: (_t, k) => (k === '__esModule' ? false : k === 'default' ? any : k === 'OS' ? 'ios' : any), apply: () => any });
export default any;
export const Platform = { OS: 'ios', select: (o: any) => o.ios ?? o.default };
export const StyleSheet = { create: (x: any) => x };
export const AppState = any, NativeModules = any, Dimensions = any, Linking = any;
export const VoiceQuality = { Enhanced: 'Enhanced' };
export const speak = () => {}, stop = async () => {}, getAvailableVoicesAsync = async () => [];

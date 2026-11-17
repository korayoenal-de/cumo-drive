// Leeres Modul für react-native und expo Pakete: jede benannte Funktion ist ein No-op.
const noop = function () { return undefined; };
const handler = {
  get(t, k) {
    if (k in t) return t[k];
    if (k === '__esModule') return true;
    if (k === 'default') return proxy;
    if (k === 'OS') return 'ios';
    if (k === 'select') return (o) => (o && (o.ios ?? o.native ?? o.default));
    return noop;
  },
};
// Benannte Importe, die beim Laden schon gelesen werden (etwa Platform.OS in cumo-routing.ts), brauchen eine
// echte Eigenschaft: esbuild kopiert beim Import nur eigene Schlüssel des Moduls.
const platform = { OS: 'ios', select: (o) => (o && (o.ios ?? o.native ?? o.default)) };
const proxy = new Proxy({ Platform: platform }, handler);
module.exports = proxy;

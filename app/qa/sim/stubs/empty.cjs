// Leeres Modul für react-native und expo Pakete: jede benannte Funktion ist ein No-op.
const noop = function () { return undefined; };
const handler = {
  get(_t, k) {
    if (k === '__esModule') return true;
    if (k === 'default') return proxy;
    if (k === 'OS') return 'ios';
    if (k === 'select') return (o) => (o && (o.ios ?? o.native ?? o.default));
    return noop;
  },
};
const proxy = new Proxy({}, handler);
module.exports = proxy;

// Landingpage /en und /it ohne App Skript (Performance 20.11.2026): wer hier noch keine Sprache gewählt hat, bekommt
// Login, Registrieren und Planer in der Sprache dieser Seite. Gleicher Schlüssel wie i18n/store.web.ts.
try {
  var l = document.documentElement.lang;
  if ((l === 'en' || l === 'it') && !localStorage.getItem('cumo.sprache.v1')) localStorage.setItem('cumo.sprache.v1', l);
} catch (e) {}

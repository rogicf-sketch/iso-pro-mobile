/**
 * Caminhos com acentos (ex.: «GESTÃO») no Windows fazem o Android Gradle falhar.
 * Permite builds locais na mesma pasta do projeto (Google: android.overridePathCheck).
 */
const { withGradleProperties } = require('expo/config-plugins');

module.exports = function withAndroidPathCheck(config) {
  return withGradleProperties(config, (mod) => {
    const key = 'android.overridePathCheck';
    const next = mod.modResults.filter((p) => !(p.type === 'property' && p.key === key));
    next.push({ type: 'property', key, value: 'true' });
    mod.modResults = next;
    return mod;
  });
}

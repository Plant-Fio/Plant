// Lance les verifications sur le site fabrique (_site/) : tout se passe sur le runner GitHub.
//   1) le site "reel"  (vrai Supabase)   -> captures/ci-reel/
//   2) une copie avec faux Supabase       -> captures/ci-appli/
import fs from 'node:fs';
import { servir } from './static-server.mjs';
import { verifierConnexion, verifierAppli } from './checks.mjs';
import { lireVersion } from './helpers.mjs';

const version = lireVersion();

fs.rmSync('_site_stub', { recursive: true, force: true });
fs.cpSync('_site', '_site_stub', { recursive: true });
fs.copyFileSync('tests/supabase-stub.js', '_site_stub/vendor/supabase.js');

const serveurReel = await servir('_site', 8081);
const serveurFaux = await servir('_site_stub', 8082);

try {
  await verifierConnexion('http://localhost:8081/', 'captures/ci-reel', { version });
  await verifierAppli('http://localhost:8082/', 'captures/ci-appli', { version });
} finally {
  serveurReel.close();
  serveurFaux.close();
}

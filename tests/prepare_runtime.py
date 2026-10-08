from pathlib import Path
import json
import zipfile
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build

root = Path(__file__).resolve().parents[1]
profile = root / '.test-profile'
(profile / 'extensions').mkdir(parents=True, exist_ok=True)
(profile / 'data').mkdir(exist_ok=True)
(profile / 'result.json').unlink(missing_ok=True)
archive = build.build()
(profile / 'extensions' / 'batch-add-info@yuan.local').write_text(str(root), encoding='utf-8')
prefs = {
    'extensions.zotero.dataDir': str(profile / 'data'),
    'extensions.zotero.useDataDir': True,
    'extensions.zotero.firstRun.skip': True,
    'extensions.zotero.firstRun2': False,
    'extensions.zotero.sync.autoSync': False,
    'extensions.zotero.httpServer.enabled': False,
    'extensions.zotero.reportTranslationFailure': False,
    'extensions.zotero.automaticScraperUpdates': False,
    'extensions.zotero.repository.autoUpdate': False,
    'extensions.zotero.retractions.enabled': False,
    'extensions.zotero.streaming.enabled': False,
    'extensions.batch-add-info.lastField': 'extra',
    'extensions.zoteroWinWordIntegration.skipInstallation': True,
    'extensions.zoteroOpenOfficeIntegration.skipInstallation': True,
    'extensions.autoDisableScopes': 0,
    'extensions.enabledScopes': 15,
    'extensions.startupScanScopes': 15,
    'extensions.logging.enabled': True,
    'devtools.debugger.remote-enabled': True,
    'devtools.debugger.prompt-connection': False,
    'devtools.chrome.enabled': True,
    'devtools.debugger.remote-port': 58763,
    'browser.shell.checkDefaultBrowser': False,
    'browser.startup.homepage_override.mstone': 'ignore',
    'xpinstall.signatures.required': False,
    'app.update.auto': False,
    'app.update.enabled': False
}
(profile / 'prefs.js').write_text('\n'.join(f'user_pref({json.dumps(k)}, {json.dumps(v)});' for k, v in prefs.items()), encoding='utf-8')
manifest = {
    'manifest_version': 2, 'name': 'Batch Add Info Isolated Test', 'version': '1.0',
    'applications': {'zotero': {'id': 'batch-info-test@yuan.local', 'update_url': 'https://example.invalid/batch-info-test/updates.json', 'strict_min_version': '10.0', 'strict_max_version': '10.0.*'}}
}
script = (root / 'tests' / 'runtime-bootstrap.js').read_text(encoding='utf-8')
script = script.replace('__REPORT__', json.dumps(str(profile / 'result.json')))
script = script.replace('__DATA_DIR__', json.dumps(str(profile / 'data')))
harness = profile / 'harness'
harness.mkdir(exist_ok=True)
(harness / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
(harness / 'bootstrap.js').write_text(script, encoding='utf-8')
(profile / 'extensions' / 'batch-info-test@yuan.local').write_text(str(harness), encoding='utf-8')
with zipfile.ZipFile(profile / 'runtime-harness.xpi', 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('manifest.json', json.dumps(manifest))
    z.writestr('bootstrap.js', script)
print('Isolated profile:', profile)

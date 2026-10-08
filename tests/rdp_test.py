import json
import socket
import time
from pathlib import Path

root = Path(__file__).resolve().parents[1]
for attempt in range(100):
    try:
        sock = socket.create_connection(('127.0.0.1', 58763), timeout=1)
        break
    except OSError:
        time.sleep(0.1)
else:
    raise RuntimeError('Test debugger did not start')
sock.settimeout(20)
def read():
    header = b''
    while not header.endswith(b':'):
        block = sock.recv(1)
        if not block:
            raise EOFError('Debugger connection closed')
        header += block
    size = int(header[:-1])
    data = b''
    while len(data) < size:
        block = sock.recv(size - len(data))
        if not block:
            raise EOFError('Debugger connection closed')
        data += block
    return json.loads(data)
def request(actor, kind, **kwargs):
    packet = json.dumps({'to': actor, 'type': kind, **kwargs}).encode()
    sock.sendall(str(len(packet)).encode() + b':' + packet)
    while True:
        response = read()
        if response.get('from') == actor:
            return response
read()
process = request('root', 'getProcess', id=0)
actor = process['processDescriptor']['actor']
target = request(actor, 'getTarget')['process']
console = target['consoleActor']
paths = [str(root / 'dist' / 'zotero-batch-add-info-1.0.0.xpi'), str(root / '.test-profile' / 'runtime-harness.xpi')]
script = '''(async () => {
    const { Zotero } = ChromeUtils.importESModule('chrome://zotero/content/zotero.mjs');
    await Zotero.initializationPromise;
    const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    for (const path of PATHS) {
        const file = Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsIFile);
        file.initWithPath(path);
        const install = await AddonManager.getInstallForFile(file);
        await install.install();
    }
    return 'installed';
})().catch(error => { dump('TEST INSTALL ERROR: ' + error + '\\n'); })'''.replace('PATHS', json.dumps(paths))
print(json.dumps(request(console, 'evaluateJS', text=script), ensure_ascii=False))
report = root / '.test-profile' / 'result.json'
for attempt in range(450):
    if report.exists():
        print(report.read_text(encoding='utf-8'))
        break
    time.sleep(0.1)
else:
    raise RuntimeError('Runtime tests did not produce a report')
sock.close()

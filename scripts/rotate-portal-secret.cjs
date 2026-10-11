const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Generate 32 bytes of cryptographically secure random bytes (64 hex characters)
const secret = crypto.randomBytes(32).toString('hex');

// Save secret to .env.portal_secret (covered by .env* in .gitignore)
const secretFilePath = path.join(process.cwd(), '.env.portal_secret');
fs.writeFileSync(secretFilePath, secret, { encoding: 'utf8' });
console.log(`[OK] Generated 32-byte cryptographic secret and saved to ${secretFilePath}`);

// Update .env.local
const envLocalPath = path.join(process.cwd(), '.env.local');
let envLocalContent = fs.existsSync(envLocalPath) ? fs.readFileSync(envLocalPath, 'utf8') : '';
if (envLocalContent.includes('PORTAL_WEBHOOK_SECRET=')) {
  envLocalContent = envLocalContent.replace(/PORTAL_WEBHOOK_SECRET=.*/g, `PORTAL_WEBHOOK_SECRET=${secret}`);
} else {
  envLocalContent += `\n# Portal Webhook Secret\nPORTAL_WEBHOOK_SECRET=${secret}\n`;
}
fs.writeFileSync(envLocalPath, envLocalContent, 'utf8');
console.log(`[OK] Updated PORTAL_WEBHOOK_SECRET in .env.local`);

// Upload secret to Cloudflare Workers via wrangler secret put
console.log(`[INFO] Setting secret on Cloudflare Workers (Worker: rba-realtors-lead-viewer)...`);
const isWindows = process.platform === 'win32';
const cmd = isWindows ? 'npx.cmd' : 'npx';
const child = spawn(cmd, ['wrangler', 'secret', 'put', 'PORTAL_WEBHOOK_SECRET', '--name', 'rba-realtors-lead-viewer'], {
  stdio: ['pipe', 'inherit', 'inherit'],
  shell: true
});

child.stdin.write(secret);
child.stdin.end();

child.on('close', (code) => {
  if (code === 0) {
    console.log(`[OK] Successfully updated PORTAL_WEBHOOK_SECRET in Cloudflare Workers production environment.`);
  } else {
    console.error(`[ERROR] Failed to update secret. Process exited with code ${code}`);
    process.exit(code);
  }
});


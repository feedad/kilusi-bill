const fs = require('fs');
const path = '/home/ubuntu/kilusi-bill/frontend/.next/routes-manifest.json';

try {
    const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
    console.log('Original static routes count:', manifest.staticRoutes.length);
    console.log('Original dynamic routes count:', manifest.dynamicRoutes.length);

    // Move all static routes to dynamic routes
    // Except maybe /_not-found if it's special? But page.js exists for it too.
    // Actually, keeping them in staticRoutes prompts Next.js to look for HTML.
    // Moving to dynamicRoutes prompts execution of page.js.

    const staticRoutes = manifest.staticRoutes;
    manifest.staticRoutes = []; // Clear static routes

    // Append to dynamic routes
    manifest.dynamicRoutes = [...manifest.dynamicRoutes, ...staticRoutes];

    console.log('New static routes count:', manifest.staticRoutes.length);
    console.log('New dynamic routes count:', manifest.dynamicRoutes.length);

    fs.writeFileSync(path, JSON.stringify(manifest, null, 2));
    console.log('Manifest patched successfully.');
} catch (e) {
    console.error('Error patching manifest:', e);
    process.exit(1);
}
